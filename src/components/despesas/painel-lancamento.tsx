'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { competenciaDeCartao, competenciaDeContaExterna, formatarCompetencia } from '@/domain/competencia';
import { formatarBRL, reaisParaCentavos } from '@/domain/money';
import { acaoCriarLancamento, acaoEditarLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';

type Membro = { id: string; nome: string; cor: string };
type Categoria = { id: string; nome: string; cor: string };
type Conta = {
  id: string;
  nome: string;
  tipo: 'CARTAO' | 'EXTERNA';
  diaFechamento: number | null;
  cor: string;
};

/** `estado === null` fecha o painel. Um componente, dois modos — nunca dois componentes. */
export type ModoPainel = { modo: 'criar' } | { modo: 'editar'; linha: LinhaGrade };

/** Id do botao "Novo lancamento" — usado por `grade-lancamentos.tsx` e como alvo de
 * foco quando o painel fecha (ver `onCloseAutoFocus` abaixo). Compartilhado como
 * constante para as duas pontas nunca saírem de sincronia. */
export const ID_BOTAO_NOVO_LANCAMENTO = 'botao-novo-lancamento';

type EstadoAtual = { descricao: string; valorCentavos: number };

// `atual` chega tipado `unknown` (ResultadoGravacao) porque e o registro cru do
// Prisma na hora do conflito. Sem `as`: so aceitamos o formato se as chaves que
// vamos exibir realmente baterem, e ignoramos silenciosamente caso contrario —
// a mensagem de conflito continua aparecendo mesmo sem o detalhe extra.
// (comportamento 3 — ver o formulario de edicao anterior a fusao, no historico do git)
function extrairAtual(atual: unknown): EstadoAtual | null {
  if (
    atual !== null &&
    typeof atual === 'object' &&
    'descricao' in atual &&
    'valorCentavos' in atual &&
    typeof atual.descricao === 'string' &&
    typeof atual.valorCentavos === 'number'
  ) {
    return { descricao: atual.descricao, valorCentavos: atual.valorCentavos };
  }
  return null;
}

/**
 * Em qual fatura o lancamento cai, e por que — a regra existe em `@/domain/competencia`
 * desde a Fase 1 e nunca apareceu na tela. So mostra quando data e conta tem valor; as
 * duas funcoes de dominio validam calendario de verdade e lancam para data incompleta,
 * entao qualquer erro aqui so esconde a dica, nunca quebra o painel.
 */
function calcularDica(dataCompra: string, contaId: string, contas: readonly Conta[]): string | null {
  if (!dataCompra || !contaId) return null;
  const conta = contas.find((c) => c.id === contaId);
  if (!conta) return null;

  try {
    if (conta.tipo === 'CARTAO' && conta.diaFechamento !== null) {
      const competencia = competenciaDeCartao(dataCompra, conta.diaFechamento);
      return `Cai na fatura de ${formatarCompetencia(competencia)} — o ${conta.nome} fecha dia ${conta.diaFechamento}.`;
    }

    const competencia = competenciaDeContaExterna(dataCompra);
    return `Cai na fatura de ${formatarCompetencia(competencia)} — é o mês do pagamento.`;
  } catch {
    return null;
  }
}

type FormularioProps = {
  estado: ModoPainel;
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
  onFechar: () => void;
};

/**
 * Os campos de fato, montados so quando o painel esta aberto — condicionado no
 * `estado &&` do componente pai, nunca num `key`. Isso garante que cada abertura
 * (criar, ou editar uma linha) monta uma instancia nova, com `useState` reiniciado
 * e `defaultValue` recalculado a partir do `estado` atual: sem isso, reabrir o
 * painel para uma linha diferente mostraria dado da linha anterior, porque campo
 * nao controlado (`defaultValue`) so le a prop uma vez, no mount.
 */
function Formulario({ estado, contas, categorias, membros, onFechar }: FormularioProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<EstadoAtual | null>(null);
  const [pendente, iniciar] = useTransition();

  const editando = estado.modo === 'editar' ? estado : null;

  // Rastreiam data e conta so para recalcular a dica de competencia a cada
  // mudanca — os proprios campos continuam nao controlados (defaultValue),
  // comportamento 2: um re-render vindo do `revalidatePath` do server action
  // nao apaga o que a pessoa digitou.
  const [dataCompra, setDataCompra] = useState(editando?.linha.dataCompra ?? '');
  const [contaId, setContaId] = useState(editando?.linha.contaId ?? contas[0]?.id ?? '');

  const dica = calcularDica(dataCompra, contaId, contas);

  const escopoPadrao = editando
    ? editando.linha.escopo === 'CONJUNTO'
      ? 'CONJUNTO'
      : (editando.linha.membroId ?? membros[0]?.id ?? 'CONJUNTO')
    : (membros[0]?.id ?? 'CONJUNTO');

  function enviar(dados: FormData) {
    setErro(null);
    setConflito(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valor') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    const escopo = String(dados.get('escopo'));
    const numeroParcelas = Number(dados.get('numeroParcelas') ?? 1);
    const camposComuns = {
      descricao: String(dados.get('descricao') ?? ''),
      valorCentavos,
      dataCompra: String(dados.get('dataCompra') ?? ''),
      numeroParcelas,
      escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
      contaId: String(dados.get('contaId') ?? ''),
      categoriaId: String(dados.get('categoriaId') ?? ''),
      ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
    };

    if (editando) {
      // O lancamento ja tem mais de uma parcela: editar QUALQUER campo regera
      // todas elas (`gravarFilhos` recria do zero, sem opcao de meio-termo).
      // Avisa antes de mandar pro servidor, nao depois. (comportamento 4)
      if (editando.linha.numeroParcelas > 1) {
        const confirmar = window.confirm(
          `Editar "${editando.linha.descricao}" regera as ${editando.linha.numeroParcelas} parcelas deste lançamento. Continuar?`,
        );
        if (!confirmar) return;
      }

      iniciar(async () => {
        try {
          const resultado = await acaoEditarLancamento(editando.linha.lancamentoId, editando.linha.versao, {
            ...camposComuns,
            // origemValor viaja escondido, igual ao que ja estava gravado — o
            // formulario nao oferece troca-lo. (comportamento 5)
            origemValor: editando.linha.origemValor,
          });

          if (!resultado.ok) {
            // Em caso de recusa o formulario nunca reseta — so a mensagem
            // (e o conflito, se for o caso) aparecem. (comportamento 1)
            if (resultado.motivo === 'FATURA_TRAVADA') {
              setErro('Esse mês já está fechado. Destrave a fatura para editar.');
            } else {
              setErro(
                'Alguém salvou uma mudança nesse lançamento enquanto você editava. ' +
                  'Confira o estado atual abaixo e tente de novo.',
              );
              setConflito(extrairAtual(resultado.atual));
            }
            return;
          }

          onFechar();
        } catch (e) {
          setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
        }
      });
      return;
    }

    iniciar(async () => {
      try {
        const resultado = await acaoCriarLancamento({ ...camposComuns, origemValor: 'POR_PARCELA' });

        if (!resultado.ok) {
          setErro('Esse mês já está fechado. Destrave a fatura para lançar.');
          return;
        }

        // Sucesso: o painel fecha (o Sheet devolve o foco ao gatilho, ver
        // `onCloseAutoFocus` em `PainelLancamento`) — a linha nova aparece na
        // secao certa via `revalidatePath` do proprio server action.
        onFechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <form action={enviar} className="flex h-full flex-col overflow-hidden">
      <SheetHeader>
        <SheetTitle>{editando ? 'Editar lançamento' : 'Novo lançamento'}</SheetTitle>
        <SheetDescription>
          {editando ? `Altere os dados de "${editando.linha.descricao}".` : 'Registre uma despesa nova do casal.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="campo-descricao">Descrição</Label>
          <Input
            id="campo-descricao"
            name="descricao"
            required
            placeholder="Ex.: Supermercado"
            defaultValue={editando?.linha.descricao ?? ''}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campo-data-compra">Data</Label>
            <Input
              id="campo-data-compra"
              name="dataCompra"
              type="date"
              required
              defaultValue={editando?.linha.dataCompra ?? ''}
              onChange={(evento) => setDataCompra(evento.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campo-valor">Valor</Label>
            <Input
              id="campo-valor"
              name="valor"
              required
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={editando ? formatarBRL(editando.linha.lancamentoValorCentavos).replace('R$ ', '') : ''}
              className="text-right tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campo-escopo">De quem</Label>
            <Select name="escopo" required defaultValue={escopoPadrao}>
              <SelectTrigger id="campo-escopo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {membros.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
                <SelectItem value="CONJUNTO">Conjunto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campo-parcelas">Parcelas</Label>
            <Input
              id="campo-parcelas"
              name="numeroParcelas"
              type="number"
              min={1}
              max={72}
              defaultValue={editando?.linha.numeroParcelas ?? 1}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campo-conta">Conta</Label>
            <Select
              name="contaId"
              required
              defaultValue={editando?.linha.contaId ?? contas[0]?.id ?? ''}
              onValueChange={setContaId}
            >
              <SelectTrigger id="campo-conta" className="w-full">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campo-categoria">Categoria</Label>
            <Select name="categoriaId" required defaultValue={editando?.linha.categoriaId ?? categorias[0]?.id ?? ''}>
              <SelectTrigger id="campo-categoria" className="w-full">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <SheetFooter className="gap-3 border-t border-borda-suave">
        {dica && <p className="text-xs text-tinta-fraca">{dica}</p>}
        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}
        {conflito && (
          <p className="text-sm text-tinta-fraca">
            Estado atual gravado: <strong className="text-tinta">{conflito.descricao}</strong>,{' '}
            {formatarBRL(conflito.valorCentavos)}.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente ? 'Salvando…' : editando ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}

type Props = {
  estado: ModoPainel | null;
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
  onFechar: () => void;
};

/**
 * Painel de criar/editar lancamento, fundindo os dois formularios que existiam antes
 * (um para criar, outro para editar, cada um em seu proprio arquivo). Abre pela
 * direita sobre a grade, que continua visivel atras.
 *
 * So o `Formulario` (dentro de `{estado && ...}`) monta e desmonta com a troca de
 * `estado`; o `Sheet` em si fica sempre presente, para a animacao de fechar tocar
 * por inteiro antes do conteudo sumir.
 */
export function PainelLancamento({ estado, contas, categorias, membros, onFechar }: Props) {
  return (
    <Sheet
      open={estado !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
    >
      <SheetContent
        className="flex flex-col gap-0 data-[side=right]:sm:max-w-md"
        onCloseAutoFocus={(evento) => {
          // Devolve o foco ao botao "Novo lancamento" — o lugar que da para
          // continuar depois que o painel fecha, tanto no sucesso de criar
          // quanto ao cancelar ou editar. Sem isso o foco cairia no `body`.
          evento.preventDefault();
          document.getElementById(ID_BOTAO_NOVO_LANCAMENTO)?.focus();
        }}
      >
        {estado && (
          <Formulario estado={estado} contas={contas} categorias={categorias} membros={membros} onFechar={onFechar} />
        )}
      </SheetContent>
    </Sheet>
  );
}
