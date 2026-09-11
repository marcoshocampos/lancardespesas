'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type TransitionStartFunction,
} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
// `arquivada` viaja junto porque quem decide oferecer ou nao a categoria e este
// componente, que e o unico que sabe o modo do painel — ver `categoriasOferecidas`.
type Categoria = { id: string; nome: string; cor: string; arquivada: boolean };
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

/** Id previsivel do botao de editar de cada linha da grade — mesma ideia do id
 * acima, um por parcela. `secao-pessoa.tsx` marca o botao com ele; aqui serve
 * para achar o alvo do foco quando o painel fecha em modo editar (ver
 * `onCloseAutoFocus` em `PainelLancamento` — achado 2 da revisao de bc54df3). */
export function idBotaoEditar(parcelaId: string): string {
  return `botao-editar-${parcelaId}`;
}

type EstadoAtual = { descricao: string; valorCentavos: number };

// Formato do que `enviar` monta a partir do FormData, comum a criar e editar
// (so `origemValor` fica de fora — cada modo o resolve do seu jeito, ver
// `enviarEdicao` e o modo criar dentro de `enviar`). Existe como tipo nomeado
// porque tambem e o formato do estado que segura os dados capturados
// enquanto o AlertDialog de confirmacao espera a pessoa decidir
// (`confirmacaoRegeracao`, dentro de `Formulario`) — precisa ser o MESMO
// objeto que `enviar` montou, nao um recalculado depois. (comportamento 4)
type CamposComuns = {
  descricao: string;
  valorCentavos: number;
  dataCompra: string;
  numeroParcelas: number;
  escopo: 'CONJUNTO' | 'PESSOAL';
  contaId: string;
  categoriaId: string;
  membroId?: string;
};

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
  /** So as contas ativas: e o que se pode escolher para um lancamento NOVO. */
  contasAtivas: Conta[];
  /** Ativas mais as que tem parcela no mes aberto. Serve so ao modo editar —
   * ver `contasOferecidas` dentro de `Formulario`. */
  contasDoMes: Conta[];
  categorias: Categoria[];
  membros: Membro[];
  /** Levantados para `PainelLancamento`: o `Sheet` precisa saber se ha uma
   * gravacao em voo para recusar fechar por Esc, clique fora ou o X, o que
   * fica fora do alcance deste componente. (achado 1 da revisao de bc54df3) */
  pendente: boolean;
  iniciar: TransitionStartFunction;
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
function Formulario({
  estado,
  contasAtivas,
  contasDoMes,
  categorias,
  membros,
  pendente,
  iniciar,
  onFechar,
}: FormularioProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<EstadoAtual | null>(null);
  // Nao-null so enquanto o AlertDialog "vai regerar as parcelas" espera
  // decisao — guarda o `camposComuns` exato que `enviar` capturou do
  // FormData antes de abrir o dialogo, para `confirmarRegeracao` reenviar
  // sem reler nem recalcular nada. (comportamento 4)
  const [confirmacaoRegeracao, setConfirmacaoRegeracao] = useState<CamposComuns | null>(null);

  const editando = estado.modo === 'editar' ? estado : null;

  /**
   * O que o select de conta oferece. Criar so pode escolher conta ATIVA — e o
   * proprio significado de `ativa`. Editar precisa da lista de ativas MAIS a
   * conta do proprio lancamento, mesmo que ela ja tenha sido aposentada.
   *
   * Nao e cosmetico: o `Select` do radix-ui manda o valor no FormData por um
   * `<select>` escondido que recebe `defaultValue` com o id da conta e monta as
   * `<option>` a partir dos `SelectItem` renderizados. `<select>` nativo cujo
   * `defaultValue` nao casa com nenhuma option cai na PRIMEIRA — entao, sem
   * esta linha, corrigir a descricao de uma compra numa conta aposentada
   * gravaria o lancamento na primeira conta ativa da lista, em silencio.
   *
   * A conta do lancamento editado sempre esta em `contasDoMes`: a linha so
   * aparece na grade porque tem parcela nesta competencia, que e exatamente o
   * criterio de entrada daquela lista.
   */
  const idsAtivas = new Set(contasAtivas.map((c) => c.id));
  const contasOferecidas = editando
    ? contasDoMes.filter((c) => idsAtivas.has(c.id) || c.id === editando.linha.contaId)
    : contasAtivas;

  /**
   * Mesma regra, mesma forma, pelo mesmo motivo — so que para categoria:
   * criar oferece so categoria NAO arquivada (e o proprio significado de
   * arquivar), e editar oferece essas MAIS a categoria do proprio lancamento,
   * ainda que arquivada.
   *
   * A armadilha e a descrita acima, no `<select>` escondido: `defaultValue`
   * que nao casa com nenhuma `<option>` cai na PRIMEIRA, sem o `required`
   * reclamar. Sem esta lista, abrir uma compra de categoria arquivada so para
   * corrigir a descricao gravaria o lancamento na primeira categoria em ordem
   * alfabetica, em silencio — o unico sinal seria o gatilho aparecer vazio.
   *
   * Aqui basta uma lista, e nao duas como nas contas: a pagina manda as
   * categorias inteiras (arquivadas incluidas, ver o comentario da consulta em
   * `despesas/page.tsx`) e `arquivada` vem no proprio registro. Nas contas as
   * duas listas existem porque `contasDoMes` tem outro consumidor — ela
   * alimenta `calcularResumo`, as colunas e os chips.
   */
  const categoriasOferecidas = editando
    ? categorias.filter((c) => !c.arquivada || c.id === editando.linha.categoriaId)
    : categorias.filter((c) => !c.arquivada);

  // Rastreiam data e conta so para recalcular a dica de competencia a cada
  // mudanca — os proprios campos continuam nao controlados (defaultValue),
  // comportamento 2: um re-render vindo do `revalidatePath` do server action
  // nao apaga o que a pessoa digitou.
  const [dataCompra, setDataCompra] = useState(editando?.linha.dataCompra ?? '');
  const [contaId, setContaId] = useState(editando?.linha.contaId ?? contasOferecidas[0]?.id ?? '');

  const dica = calcularDica(dataCompra, contaId, contasOferecidas);

  // ATENCAO, terceiro caso da mesma familia, hoje inalcancavel: `membros` chega
  // so com os ativos (`where: { ativo: true }` em `despesas/page.tsx`), e
  // `editando.linha.membroId` pode apontar para alguem fora dessa lista. Se um
  // dia existir "desativar pessoa", este select precisa do mesmo tratamento de
  // `contasOferecidas` e `categoriasOferecidas` — no modo editar, os ativos MAIS
  // o membro do proprio lancamento —, senao editar um lancamento antigo troca o
  // escopo dele para a primeira pessoa da lista, em silencio. Nao e alcancavel
  // agora porque desativar pessoa nao existe: `editarMembro` grava so `nome` e
  // `cor`, e `Membro.ativo` e apenas rotulo na lista de Configuracoes. Fica
  // anotado porque foi a falta desta anotacao que deixou o caso da conta passar
  // despercebido enquanto ainda era teorico.
  const escopoPadrao = editando
    ? editando.linha.escopo === 'CONJUNTO'
      ? 'CONJUNTO'
      : (editando.linha.membroId ?? membros[0]?.id ?? 'CONJUNTO')
    : (membros[0]?.id ?? 'CONJUNTO');

  /**
   * `onSubmit` com `preventDefault`, e NAO `action={enviar}`: com `action`, o
   * React 19 reseta os campos nao controlados assim que a transicao do envio
   * termina. Medido numa reproducao com este mesmo arranjo (`action={fn}`,
   * funcao sincrona delegando a um `useTransition` interno): o campo voltou ao
   * valor gravado em t=806ms, no MESMO instante em que a mensagem de recusa
   * apareceu; o caso de controle com `onSubmit` + `preventDefault` preservou o
   * que estava digitado ate o fim da amostragem (t=2001ms). Ou seja, com
   * `action` a pessoa perde o que digitou justamente em CONFLITO e
   * FATURA_TRAVADA — as recusas em que a tela manda tentar de novo — e perde
   * tudo no modo criar. Mesma forma e mesmo motivo de `lista-categorias.tsx`.
   * Nao "simplifique" de volta para `action={}`. (comportamento 1)
   *
   * A validacao do navegador nao muda com isso: `required`, `min` e `max`
   * barram o envio antes de este handler existir.
   */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // O FormData sai do formulario AGORA, sincronamente: `currentTarget` e nulo
    // depois que o handler retorna, e o que vale e o que estava digitado no
    // momento do envio — nada aqui para baixo le o formulario de novo.
    // (comportamento 2, e a captura unica de que o comportamento 4 depende)
    const dados = new FormData(evento.currentTarget);

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
    const camposComuns: CamposComuns = {
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
      // Avisa antes de mandar pro servidor, nao depois — abrindo o
      // AlertDialog abaixo em vez do antigo dialogo sincrono do navegador,
      // que bloqueava a thread inteira. `camposComuns`, ja montado ali em
      // cima a partir do FormData, vai pro estado exatamente como esta:
      // `confirmarRegeracao` (mais abaixo) reenvia esse mesmo objeto, nunca
      // um recalculado depois da decisao. Nada e enviado ao servidor daqui
      // pra baixo — so decide esperar (`return`) ou seguir direto.
      // (comportamento 4)
      if (editando.linha.numeroParcelas > 1) {
        setConfirmacaoRegeracao(camposComuns);
        return;
      }

      enviarEdicao(camposComuns);
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

  // O envio de fato de uma edicao — extraida de `enviar` porque agora tem
  // dois jeitos de chegar aqui: direto (uma parcela so) ou so depois que
  // `confirmarRegeracao` recebe o aceite do AlertDialog (mais de uma). Em
  // qualquer um dos dois `campos` e o mesmo objeto que `enviar` capturou do
  // FormData — esta funcao nunca le o formulario de novo.
  function enviarEdicao(campos: CamposComuns) {
    if (!editando) return;

    iniciar(async () => {
      try {
        const resultado = await acaoEditarLancamento(editando.linha.lancamentoId, editando.linha.versao, {
          ...campos,
          // origemValor viaja escondido, igual ao que ja estava gravado — o
          // formulario nao oferece troca-lo. (comportamento 5)
          origemValor: editando.linha.origemValor,
        });

        if (!resultado.ok) {
          // Em caso de recusa o formulario nunca reseta — so a mensagem
          // (e o conflito, se for o caso) aparecem. Quem garante isso e o
          // `onSubmit` la em cima: com `action={}` o React reseta os campos
          // ao fim da transicao e a recusa chegava com o formulario ja em
          // branco (ver o comentario de `enviar`). (comportamento 1)
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
  }

  // A pessoa aceitou no AlertDialog: fecha a confirmacao e manda pro
  // servidor o MESMO `campos` que estava guardado — nao le o formulario de
  // novo. (comportamento 4)
  function confirmarRegeracao() {
    if (!confirmacaoRegeracao) return;
    const campos = confirmacaoRegeracao;
    setConfirmacaoRegeracao(null);
    enviarEdicao(campos);
  }

  // Mesmo padrao de guarda de `PainelLancamento` (achado 1 da revisao de
  // bc54df3) e de `DialogoExclusao`: Esc e o Cancelar pedem fechar via
  // `onOpenChange` direto (clique fora o proprio AlertDialogContent do
  // radix-ui ja recusa sozinho, incondicionalmente). Na pratica esse dialogo
  // nunca chega a ficar aberto com `pendente` verdadeiro — ele fecha antes
  // de `confirmarRegeracao` chamar `enviarEdicao`/`iniciar`, do mesmo jeito
  // que o antigo dialogo sincrono do navegador ja tinha retornado antes do
  // `iniciar` original rodar — mas a guarda fica, pelo mesmo motivo do resto
  // do arquivo: nunca fechar em cima de uma gravacao em voo.
  function aoMudarConfirmacao(aberto: boolean) {
    if (!aberto && pendente) return;
    if (!aberto) setConfirmacaoRegeracao(null);
  }

  return (
    <form onSubmit={enviar} className="flex h-full flex-col overflow-hidden">
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
              defaultValue={editando?.linha.contaId ?? contasOferecidas[0]?.id ?? ''}
              onValueChange={setContaId}
            >
              <SelectTrigger id="campo-conta" className="w-full">
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
            <Label htmlFor="campo-categoria">Categoria</Label>
            <Select
              name="categoriaId"
              required
              defaultValue={editando?.linha.categoriaId ?? categoriasOferecidas[0]?.id ?? ''}
            >
              <SelectTrigger id="campo-categoria" className="w-full">
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

      {/* Confirmacao de que editar regera as parcelas (comportamento 4). So
         existe no modo editar — `confirmacaoRegeracao` nunca fica setado no
         modo criar. Fica dentro do <form> na leitura do codigo, mas o
         AlertDialog em si nao desenha nada na propria posicao (so contexto)
         e o AlertDialogContent e portalizado pelo radix-ui: nada disto
         aninha elemento nenhum dentro do <form> no DOM real. */}
      {editando && (
        <AlertDialog open={confirmacaoRegeracao !== null} onOpenChange={aoMudarConfirmacao}>
          <AlertDialogContent
            onEscapeKeyDown={(evento) => {
              if (pendente) evento.preventDefault();
            }}
            onCloseAutoFocus={(evento) => {
              // Sem AlertDialogTrigger (o dialogo abre por causa do submit
              // do formulario, nao de um clique num gatilho fixo), o
              // fallback padrao do radix-ui — focar quem abriu — nao acha
              // nada pra focar. Devolve pro primeiro campo do formulario,
              // que continua montado e habilitado tanto na recusa quanto na
              // aceitacao. (a armadilha de foco de dialogo dentro de
              // dialogo avisada para esta tarefa)
              evento.preventDefault();
              document.getElementById('campo-descricao')?.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Editar lançamento parcelado</AlertDialogTitle>
              <AlertDialogDescription>
                {`Editar "${editando.linha.descricao}" regera as ${editando.linha.numeroParcelas} parcelas deste lançamento. Continuar?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={pendente}
                onClick={(evento) => {
                  evento.preventDefault();
                  confirmarRegeracao();
                }}
              >
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </form>
  );
}

type Props = {
  estado: ModoPainel | null;
  /** As duas listas vem da pagina e chegam aqui sem se misturar: quem decide
   * qual delas o select usa e o modo do painel (`contasOferecidas`). */
  contasAtivas: Conta[];
  contasDoMes: Conta[];
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
export function PainelLancamento({
  estado,
  contasAtivas,
  contasDoMes,
  categorias,
  membros,
  onFechar,
}: Props) {
  const [pendente, iniciar] = useTransition();

  // Guarda o ALVO do foco no momento em que o painel ABRE, nao no momento em
  // que fecha: `onFechar` zera `estado` antes da animacao de fechar terminar,
  // entao ler `estado` direto dentro de `onCloseAutoFocus` so acharia o modo
  // criar (ja de volta a null) e nunca a linha editada. O ref sobrevive a
  // essa troca. (achado 2 da revisao de bc54df3)
  const focoAoFecharRef = useRef(ID_BOTAO_NOVO_LANCAMENTO);

  useEffect(() => {
    if (estado === null) return;
    focoAoFecharRef.current =
      estado.modo === 'editar' ? idBotaoEditar(estado.linha.parcelaId) : ID_BOTAO_NOVO_LANCAMENTO;
  }, [estado]);

  return (
    <Sheet
      open={estado !== null}
      onOpenChange={(aberto) => {
        // Esc, clique fora e o X do SheetContent pedem fechar por aqui — o X
        // (`Dialog.Close` do radix-ui) chama `onOpenChange(false)` direto,
        // sem passar pelos handlers de baixo, entao SO da pra barra-lo aqui.
        // Ignorar o pedido enquanto `pendente` e o que evita desmontar o
        // formulario com uma gravacao em voo: se o servidor recusar depois
        // (CONFLITO ou FATURA_TRAVADA), a mensagem ainda precisa de alguem
        // montado pra mostrar — o dado nao se perde (o lock otimista continua
        // correto), o aviso e o que se perderia. (achado 1 da revisao de
        // bc54df3)
        if (!aberto && !pendente) onFechar();
      }}
    >
      <SheetContent
        className="flex flex-col gap-0 data-[side=right]:sm:max-w-md"
        onEscapeKeyDown={(evento) => {
          if (pendente) evento.preventDefault();
        }}
        onInteractOutside={(evento) => {
          if (pendente) evento.preventDefault();
        }}
        onCloseAutoFocus={(evento) => {
          // Devolve o foco a quem abriu o painel: o botao "Novo lancamento"
          // no modo criar, ou o lapis da linha editada no modo editar. Se
          // essa linha nao existir mais no DOM (saiu da grade depois de
          // salvar), `getElementById` volta null e o fallback pega o botao
          // fixo — nunca fica sem foco nenhum. (achado 2 da revisao de
          // bc54df3)
          evento.preventDefault();
          const alvo =
            document.getElementById(focoAoFecharRef.current) ?? document.getElementById(ID_BOTAO_NOVO_LANCAMENTO);
          alvo?.focus();
        }}
      >
        {estado && (
          <Formulario
            estado={estado}
            contasAtivas={contasAtivas}
            contasDoMes={contasDoMes}
            categorias={categorias}
            membros={membros}
            pendente={pendente}
            iniciar={iniciar}
            onFechar={onFechar}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
