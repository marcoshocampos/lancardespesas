'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { formatarCompetencia } from '@/domain/competencia';
import { formatarBRL, reaisParaCentavos } from '@/domain/money';
import { acaoCriarRecorrente, acaoEditarRecorrente } from '@/server/actions/recorrente';

type Recorrente = {
  id: string;
  descricao: string;
  valorCentavos: number;
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroId: string | null;
  contaId: string;
  categoriaId: string;
  diaDoMes: number;
  competenciaInicio: string;
  ativa: boolean;
  conta: { nome: string };
  categoria: { nome: string };
  membro: { nome: string } | null;
};

type Opcao = { id: string; nome: string };

type Props = {
  recorrentes: Recorrente[];
  /** So as ATIVAS / nao arquivadas: recorrente nova nao nasce em conta aposentada. */
  contas: Opcao[];
  categorias: Opcao[];
  membros: Opcao[];
  /** O mes corrente, como padrao de "a partir de". Vem do servidor, no fuso de casa. */
  competenciaPadrao: string;
};

const CLASSE_ROTULO = 'text-xs font-normal text-tinta-fraca';

/**
 * O formulario, nos dois modos. Um componente so porque aqui — ao contrario das
 * contas — criar e editar tem exatamente os mesmos campos; a unica diferenca e
 * o interruptor `ativa`, que so faz sentido em quem ja existe.
 *
 * `onSubmit` com `preventDefault`, e nao `action={}`: mesma razao medida e
 * registrada em `painel-lancamento.tsx` — com `action`, o React 19 devolve os
 * campos nao controlados ao valor inicial quando o envio termina, e a pessoa
 * perde o que digitou justamente quando ha erro para corrigir.
 */
function FormularioRecorrente({
  recorrente,
  contas,
  categorias,
  membros,
  competenciaPadrao,
  onFechar,
}: Omit<Props, 'recorrentes'> & { recorrente: Recorrente | null; onFechar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ativa, setAtiva] = useState(recorrente?.ativa ?? true);
  const [pendente, iniciar] = useTransition();

  const idBase = recorrente ? `recorrente-${recorrente.id}` : 'recorrente-nova';

  // Editando, a conta e a categoria DA recorrente entram na lista mesmo que
  // tenham sido aposentadas depois — senao o select abriria em outra opcao e
  // salvar trocaria as duas em silencio. E a armadilha 11, na forma daqui.
  const contasOferecidas =
    recorrente && !contas.some((c) => c.id === recorrente.contaId)
      ? [...contas, { id: recorrente.contaId, nome: recorrente.conta.nome }]
      : contas;
  const categoriasOferecidas =
    recorrente && !categorias.some((c) => c.id === recorrente.categoriaId)
      ? [...categorias, { id: recorrente.categoriaId, nome: recorrente.categoria.nome }]
      : categorias;

  const escopoPadrao = recorrente
    ? recorrente.escopo === 'CONJUNTO'
      ? 'CONJUNTO'
      : (recorrente.membroId ?? 'CONJUNTO')
    : (membros[0]?.id ?? 'CONJUNTO');

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setErro(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valor') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    const escopo = String(dados.get('escopo'));
    const entrada = {
      descricao: String(dados.get('descricao') ?? ''),
      valorCentavos,
      escopo: escopo === 'CONJUNTO' ? ('CONJUNTO' as const) : ('PESSOAL' as const),
      ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
      contaId: String(dados.get('contaId') ?? ''),
      categoriaId: String(dados.get('categoriaId') ?? ''),
      diaDoMes: Number(dados.get('diaDoMes') ?? 0),
      competenciaInicio: String(dados.get('competenciaInicio') ?? ''),
    };

    iniciar(async () => {
      try {
        if (recorrente) {
          const resultado = await acaoEditarRecorrente(recorrente.id, { ...entrada, ativa });
          if (!resultado.ok) {
            setErro('Essa recorrente não existe mais. Recarregue a página.');
            return;
          }
        } else {
          await acaoCriarRecorrente(entrada);
        }
        onFechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <form onSubmit={enviar} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor={`${idBase}-descricao`} className={CLASSE_ROTULO}>
          Descrição
        </Label>
        <Input
          id={`${idBase}-descricao`}
          name="descricao"
          required
          maxLength={120}
          autoFocus
          defaultValue={recorrente?.descricao ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-valor`} className={CLASSE_ROTULO}>
          Valor por mês
        </Label>
        <Input
          id={`${idBase}-valor`}
          name="valor"
          required
          inputMode="decimal"
          placeholder="0,00"
          className="text-right tabular-nums"
          defaultValue={recorrente ? formatarBRL(recorrente.valorCentavos).replace('R$ ', '') : ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-dia`} className={CLASSE_ROTULO}>
          Dia da cobrança
        </Label>
        <Input
          id={`${idBase}-dia`}
          name="diaDoMes"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={31}
          step={1}
          defaultValue={recorrente?.diaDoMes ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-escopo`} className={CLASSE_ROTULO}>
          De quem
        </Label>
        <Select name="escopo" required defaultValue={escopoPadrao}>
          <SelectTrigger id={`${idBase}-escopo`} className="w-full">
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
        <Label htmlFor={`${idBase}-conta`} className={CLASSE_ROTULO}>
          Conta
        </Label>
        <Select name="contaId" required defaultValue={recorrente?.contaId ?? contasOferecidas[0]?.id ?? ''}>
          <SelectTrigger id={`${idBase}-conta`} className="w-full">
            <SelectValue placeholder="Selecionar" />
          </SelectTrigger>
          <SelectContent>
            {contasOferecidas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-categoria`} className={CLASSE_ROTULO}>
          Categoria
        </Label>
        <Select
          name="categoriaId"
          required
          defaultValue={recorrente?.categoriaId ?? categoriasOferecidas[0]?.id ?? ''}
        >
          <SelectTrigger id={`${idBase}-categoria`} className="w-full">
            <SelectValue placeholder="Selecionar" />
          </SelectTrigger>
          <SelectContent>
            {categoriasOferecidas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-inicio`} className={CLASSE_ROTULO}>
          A partir de
        </Label>
        <Input
          id={`${idBase}-inicio`}
          name="competenciaInicio"
          type="month"
          required
          defaultValue={recorrente?.competenciaInicio ?? competenciaPadrao}
        />
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4">
        {recorrente && (
          <span className="mr-auto flex items-center gap-2">
            <Switch id={`${idBase}-ativa`} checked={ativa} onCheckedChange={setAtiva} />
            <Label htmlFor={`${idBase}-ativa`} className={CLASSE_ROTULO}>
              Ativa
            </Label>
          </span>
        )}
        <Button type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : recorrente ? 'Salvar' : 'Criar'}
        </Button>
        <Button type="button" variant="outline" onClick={onFechar} disabled={pendente}>
          Cancelar
        </Button>
      </div>

      <p className="col-span-2 text-xs text-tinta-fraca sm:col-span-4">
        Mudar o valor vale para os próximos meses. O que já foi lançado não muda.
      </p>

      {erro && (
        <p role="alert" className="col-span-2 text-sm text-negativo sm:col-span-4">
          {erro}
        </p>
      )}
    </form>
  );
}

function LinhaRecorrente({ recorrente, onEditar }: { recorrente: Recorrente; onEditar: () => void }) {
  const dono = recorrente.escopo === 'CONJUNTO' ? 'Conjunto' : (recorrente.membro?.nome ?? 'sem pessoa');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${recorrente.ativa ? 'text-tinta' : 'text-tinta-fraca'}`}>
          {recorrente.descricao}
          {!recorrente.ativa && <span className="ml-2 text-xs">(desativada)</span>}
        </p>
        <p className="mt-0.5 text-xs text-tinta-fraca">
          {dono} · {recorrente.categoria.nome} · {recorrente.conta.nome} · dia {recorrente.diaDoMes} ·
          desde {formatarCompetencia(recorrente.competenciaInicio)}
        </p>
      </div>

      <span className="shrink-0 text-sm tabular-nums text-tinta">
        {formatarBRL(recorrente.valorCentavos)}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEditar}
        aria-label={`Editar ${recorrente.descricao}`}
      >
        <Pencil aria-hidden="true" />
        Editar
      </Button>
    </div>
  );
}

/**
 * As despesas que se repetem todo mês: assinatura, seguro, mensalidade.
 *
 * **Cadastrar aqui não lança nada.** A recorrente só vira lançamento quando
 * alguém clica na faixa do Despesas, mês a mês — decisão registrada em
 * `docs/decisoes.md`. O subtítulo da página `/recorrentes` diz isso em voz
 * alta, porque "cadastrei e não apareceu" seria a primeira dúvida de quem usa.
 *
 * Sem título próprio: a lista é a página inteira, e o `h1` dela já diz
 * *Recorrentes*. Quando morava em Configurações era uma seção entre quatro e
 * tinha o seu `h2`.
 */
export function ListaRecorrentes({ recorrentes, contas, categorias, membros, competenciaPadrao }: Props) {
  // `null` fechado, 'nova' criando, ou o id de quem esta sendo editada.
  const [aberto, setAberto] = useState<string | null>(null);
  const fechar = () => setAberto(null);
  const comuns = { contas, categorias, membros, competenciaPadrao };

  return (
    <section
      aria-label="Recorrentes cadastradas"
      className="rounded-caixa border border-borda bg-superficie"
    >
      <div className="border-b border-borda px-5 py-4">
        <div>
          {aberto === 'nova' ? (
            <FormularioRecorrente recorrente={null} onFechar={fechar} {...comuns} />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto('nova')}>
              <Plus aria-hidden="true" />
              Nova recorrente
            </Button>
          )}
        </div>
      </div>

      {recorrentes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tinta-fraca">Nenhuma recorrente cadastrada.</p>
      ) : (
        <ul className="divide-y divide-borda-suave">
          {recorrentes.map((r) => (
            <li key={r.id} className="px-5 py-3">
              {aberto === r.id ? (
                <FormularioRecorrente recorrente={r} onFechar={fechar} {...comuns} />
              ) : (
                <LinhaRecorrente recorrente={r} onEditar={() => setAberto(r.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
