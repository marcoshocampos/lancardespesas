'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type TransitionStartFunction,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { formatarCompetencia, mesesAoRedor } from '@/domain/competencia';
import {
  MAXIMO_DE_PARCELAS,
  alcanceDaFaixa,
  descreverLimitesDeParcelas,
  limitesDeParcelas,
  type Alcance,
  type LimitesDeParcelas,
} from '@/domain/divisao';
import {
  RAIO_DA_FATURA,
  competenciasTravadasDaConta,
  descreverTrava,
  divergenciaDaData,
  type FaturaTravada,
} from '@/domain/trava';
import { formatarBRL, reaisParaCentavos } from '@/domain/money';
import { acaoCriarLancamento, acaoEditarLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import { alcanceInicial, faixaDaLinha, opcoesDeAlcance, temAlcance, travaDoAlcance } from './alcance-da-linha';
import { ControleAlcance } from './controle-alcance';

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

/**
 * `estado === null` fecha o painel. Um componente, dois modos — nunca dois componentes.
 *
 * `focoAoFechar` existe porque criar tem DOIS gatilhos: o botao do topo e o
 * flutuante que acompanha a rolagem. Sem ele, abrir pelo flutuante e fechar
 * devolvia o foco ao botao do topo — que esta fora de vista, entao o navegador
 * rolava a pagina ate la. Era o mesmo salto que o flutuante existe para evitar.
 */
export type ModoPainel =
  | { modo: 'criar'; focoAoFechar?: string }
  | { modo: 'editar'; linha: LinhaGrade };

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

// O que `enviar` monta, comum a criar e editar (so `origemValor` fica de fora — cada modo o resolve do seu jeito).
type CamposComuns = {
  descricao: string;
  valorCentavos: number;
  dataCompra: string;
  numeroParcelas: number;
  escopo: 'CONJUNTO' | 'PESSOAL';
  contaId: string;
  categoriaId: string;
  membroId?: string;
  ehReembolso: boolean;
  devedorNome?: string;
  fatura: string;
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
 * O aviso de que a data aponta outra Fatura. Nao impede nada: a Fatura e quem
 * decide o mes, e a data e informacao. Diz o porque — o dia do fechamento, ou
 * o mes do pagamento —, como a antiga dica de competencia dizia.
 */
function avisoDaData(pelaData: string, numero: number, conta: Conta): string {
  const quem = numero > 1 ? `a parcela ${numero} cairia` : 'cairia';
  const porque =
    conta.tipo === 'CARTAO' && conta.diaFechamento !== null
      ? `o ${conta.nome} fecha dia ${conta.diaFechamento}`
      : 'é o mês do pagamento';
  return `Pela data, ${quem} na fatura de ${formatarCompetencia(pelaData)} — ${porque}.`;
}

/**
 * Em "so esta", os campos fora o valor ficam desabilitados e nao vao no
 * FormData: saem da propria linha. O servidor copia tudo do original de
 * qualquer jeito; isto existe porque o esquema da action exige o formato
 * inteiro.
 */
function camposDaLinha(linha: LinhaGrade, fatura: string): Omit<CamposComuns, 'valorCentavos'> {
  return {
    descricao: linha.descricao,
    dataCompra: linha.dataCompra,
    numeroParcelas: linha.numeroParcelas,
    escopo: linha.escopo,
    contaId: linha.contaId,
    categoriaId: linha.categoriaId,
    ...(linha.escopo === 'PESSOAL' && linha.membroId ? { membroId: linha.membroId } : {}),
    ehReembolso: linha.ehReembolso,
    ...(linha.ehReembolso && linha.devedorNome ? { devedorNome: linha.devedorNome } : {}),
    fatura,
  };
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
  /** O mes aberto na tela: e a Fatura inicial, e o mes da linha editada. */
  competencia: string;
  /** Faturas travadas perto da tela, de todas as contas. */
  travadas: readonly FaturaTravada[];
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
  competencia,
  travadas,
  pendente,
  iniciar,
  onFechar,
}: FormularioProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<EstadoAtual | null>(null);

  const editando = estado.modo === 'editar' ? estado : null;

  // Alcance: so existe editando uma linha de parcelado com mais de uma parcela
  // na faixa. O padrao e o primeiro livre, do menos ao mais abrangente. Valor
  // TOTAL so se edita inteiro (o campo mostra o total da compra; ver a spec).
  const opcoes = editando
    ? opcoesDeAlcance(editando.linha, competencia, travadas).map((o) =>
        editando.linha.origemValor === 'TOTAL' && o.valor !== 'TODAS' && o.bloqueio === null
          ? { ...o, bloqueio: 'O valor foi digitado como total da compra: só dá para editar todas as parcelas.' }
          : o,
      )
    : [];
  const mostraAlcance = editando !== null && temAlcance(editando.linha);
  const [alcance, setAlcance] = useState<Alcance>(
    mostraAlcance ? (alcanceInicial(opcoes) ?? 'SO_ESTA') : 'TODAS',
  );
  /** O mes da propria linha esta travado: nada aqui pode ser salvo. */
  const travaDaLinha = editando ? travaDoAlcance(editando.linha, competencia, travadas, 'SO_ESTA') : null;
  /** Em "so esta" so o valor muda; os outros campos ficam desabilitados. */
  const soValor = mostraAlcance && alcance === 'SO_ESTA';
  /** Nenhum alcance pode ser escolhido (ex.: valor TOTAL com uma parcela travada): nao ha o que salvar. */
  const semAlcance = mostraAlcance && alcanceInicial(opcoes) === null;
  const motivoSemAlcance = opcoes.find((o) => o.valor === 'TODAS')?.bloqueio ?? null;

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

  // A Fatura: comeca no mes da tela. Na edicao, o mes da tela e o da linha.
  const [fatura, setFatura] = useState(competencia);
  // Rastreados so para o seletor de parcela inicial e o `min` das parcelas;
  // o campo de parcelas continua nao controlado, como os outros.
  const [numeroParcelas, setNumeroParcelas] = useState(editando?.linha.numeroParcelas ?? 1);
  const [parcelaInicial, setParcelaInicial] = useState(1);

  /**
   * Marca de "alguem de fora vai devolver". Mora em estado, e nao no FormData,
   * porque o Switch do shadcn e um `button[role=switch]` — nao e campo de
   * formulario e nao aparece no `FormData`.
   */
  const [ehReembolso, setEhReembolso] = useState(editando?.linha.ehReembolso ?? false);

  /**
   * A categoria precisou virar CONTROLADA, ao contrario dos outros campos.
   *
   * Ligar a marca de terceiros preenche a categoria com "Terceiros", e campo
   * nao controlado nao aceita ser preenchido de fora: `defaultValue` so vale na
   * montagem. O custo e conhecido e esta no comentario do `onSubmit` logo
   * abaixo — campo controlado volta ao valor do estado num re-render —, mas
   * aqui o estado E a verdade, entao nao ha o que perder.
   *
   * Preenche, nao trava: o remedio comprado para a tia pode ficar em Medicacao
   * e continuar sendo reembolso. Por isso um `onValueChange` normal convive com
   * o preenchimento automatico.
   */
  const [categoriaId, setCategoriaId] = useState(
    editando?.linha.categoriaId ?? categoriasOferecidas[0]?.id ?? '',
  );

  const categoriaTerceiros = categoriasOferecidas.find(
    (c) => c.nome.trim().toLowerCase() === 'terceiros',
  );

  function alternarReembolso(ligado: boolean) {
    setEhReembolso(ligado);
    // So preenche ao LIGAR, e so se a categoria existir. Desligar nao desfaz a
    // escolha: quem ligou, viu virar Terceiros e desligou provavelmente quis
    // mesmo essa categoria.
    if (ligado && categoriaTerceiros) setCategoriaId(categoriaTerceiros.id);
  }

  const meses = mesesAoRedor(competencia, RAIO_DA_FATURA);
  const travadasDaConta = competenciasTravadasDaConta(travadas, contaId);
  const numeroDaFatura = editando ? editando.linha.numero : parcelaInicial;
  const contaEscolhida = contasOferecidas.find((c) => c.id === contaId);
  const pelaData = contaEscolhida
    ? divergenciaDaData(dataCompra, contaEscolhida, fatura, numeroDaFatura)
    : null;
  const aviso = pelaData && contaEscolhida ? avisoDaData(pelaData, numeroDaFatura, contaEscolhida) : null;
  // As parcelas que o alcance escolhido reescreve, e os totais que elas
  // aceitam. Um pedaco que para antes da ultima parcela da compra nao muda o
  // total: as seguintes estao em outro lancamento (ver `limitesDeParcelas`).
  const alvo = editando ? alcanceDaFaixa(faixaDaLinha(editando.linha), editando.linha.numero, alcance) : null;
  const limitesParcelas: LimitesDeParcelas =
    editando && alvo
      ? limitesDeParcelas(alvo, editando.linha.numeroParcelas)
      : { minimo: 1, maximo: MAXIMO_DE_PARCELAS };
  const totalFixo = limitesParcelas.minimo === limitesParcelas.maximo;
  /** O campo Parcelas nao muda nada: em "so esta", ou com o total fixo. */
  const parcelasBloqueadas = soValor || totalFixo;
  /** Por que o total esta fixo, quando e por haver parcelas em outro lancamento. */
  const motivoTotalFixo =
    editando && alvo && !soValor && alvo.final !== editando.linha.numeroParcelas
      ? `O total fica em ${editando.linha.numeroParcelas}: as parcelas depois da ${alvo.final} estão em outro lançamento.`
      : null;

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
    const camposComuns: CamposComuns =
      soValor && editando
        ? { ...camposDaLinha(editando.linha, competencia), valorCentavos }
        : {
            descricao: String(dados.get('descricao') ?? ''),
            valorCentavos,
            dataCompra: String(dados.get('dataCompra') ?? ''),
            // Campo desabilitado nao vai no FormData: com o total fixo, quem
            // diz o total e a propria linha, e nao o `?? 1` de baixo.
            numeroParcelas:
              totalFixo && editando
                ? editando.linha.numeroParcelas
                : Number(dados.get('numeroParcelas') ?? 1),
            escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
            contaId: String(dados.get('contaId') ?? ''),
            categoriaId,
            ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
            ehReembolso,
            // O nome so viaja junto com a marca ligada. Desligar e salvar tem que
            // limpar o devedor no banco, nao deixa-lo pendurado num lancamento comum.
            ...(ehReembolso ? { devedorNome: String(dados.get('devedorNome') ?? '') } : {}),
            fatura,
          };

    // O alcance ja foi escolhido no topo do painel: nao ha mais o que
    // confirmar antes de mandar. O antigo aviso "regera as N parcelas"
    // existia porque editar regerava tudo, sempre.
    if (editando) {
      enviarEdicao(camposComuns);
      return;
    }

    iniciar(async () => {
      try {
        const resultado = await acaoCriarLancamento({
          ...camposComuns,
          origemValor: 'POR_PARCELA',
          parcelaInicial: camposComuns.numeroParcelas > 1 ? parcelaInicial : 1,
        });

        if (!resultado.ok) {
          setErro(descreverTrava(resultado.travada));
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

  // O envio de uma edicao: `campos` e o objeto que `enviar` capturou do
  // FormData (ou da linha, em "so esta") — esta funcao nunca le o formulario de novo.
  function enviarEdicao(campos: CamposComuns) {
    if (!editando) return;

    iniciar(async () => {
      try {
        const resultado = await acaoEditarLancamento(
          editando.linha.lancamentoId,
          editando.linha.versao,
          {
            ...campos,
            // origemValor viaja escondido, igual ao que ja estava gravado — o
            // formulario nao oferece troca-lo. (comportamento 5)
            origemValor: editando.linha.origemValor,
          },
          alcance,
          editando.linha.numero,
        );

        if (!resultado.ok) {
          // Em caso de recusa o formulario nunca reseta — so a mensagem
          // (e o conflito, se for o caso) aparecem. Quem garante isso e o
          // `onSubmit` la em cima: com `action={}` o React reseta os campos
          // ao fim da transicao e a recusa chegava com o formulario ja em
          // branco (ver o comentario de `enviar`). (comportamento 1)
          if (resultado.motivo === 'FATURA_TRAVADA') {
            setErro(descreverTrava(resultado.travada));
          } else if (resultado.motivo === 'TOTAL_INVALIDO') {
            // O campo ja limita o total; chegar aqui e tela velha, com a
            // faixa do lancamento mudada por outra edicao.
            setErro(descreverLimitesDeParcelas(resultado));
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

  return (
    <form onSubmit={enviar} className="flex h-full flex-col overflow-hidden">
      <SheetHeader>
        <SheetTitle>{editando ? 'Editar lançamento' : 'Novo lançamento'}</SheetTitle>
        <SheetDescription>
          {editando ? `Altere os dados de "${editando.linha.descricao}".` : 'Registre uma despesa nova do casal.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {travaDaLinha && (
          <p role="alert" className="rounded-caixa border border-atencao bg-atencao-fundo p-3 text-sm text-atencao">
            {descreverTrava(travaDaLinha)}
          </p>
        )}

        {semAlcance && !travaDaLinha && motivoSemAlcance && (
          <p role="alert" className="rounded-caixa border border-atencao bg-atencao-fundo p-3 text-sm text-atencao">
            {motivoSemAlcance}
          </p>
        )}

        {mostraAlcance && !travaDaLinha && (
          <ControleAlcance
            nome="alcance-edicao"
            valor={alcance}
            opcoes={opcoes}
            onMudar={setAlcance}
            desabilitado={pendente}
          />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="campo-descricao">Descrição</Label>
          <Input
            id="campo-descricao"
            name="descricao"
            disabled={soValor}
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
              disabled={soValor}
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
            <Select name="escopo" required defaultValue={escopoPadrao} disabled={soValor}>
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
            {/* O `key` remonta o campo ao bloquear: desabilitado, ele tem que
                mostrar o total que vai ser gravado, e nao o que foi digitado
                num alcance anterior. */}
            <Input
              key={parcelasBloqueadas ? 'parcelas-fixas' : 'parcelas-livres'}
              id="campo-parcelas"
              name="numeroParcelas"
              type="number"
              min={limitesParcelas.minimo}
              max={limitesParcelas.maximo}
              defaultValue={editando?.linha.numeroParcelas ?? 1}
              disabled={parcelasBloqueadas}
              aria-describedby={motivoTotalFixo ? 'ajuda-parcelas' : undefined}
              onChange={(evento) => setNumeroParcelas(Number(evento.target.value))}
            />
            {motivoTotalFixo && (
              <p id="ajuda-parcelas" className="text-xs text-tinta-fraca">
                {motivoTotalFixo}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campo-fatura">Fatura</Label>
            {/* Sem `name`: a Fatura mora no estado, e e o estado que vai para a action. */}
            <Select value={fatura} onValueChange={setFatura} disabled={soValor}>
              <SelectTrigger id="campo-fatura" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((mes) => {
                  const travada = travadasDaConta.has(mes);
                  return (
                    <SelectItem key={mes} value={mes} disabled={travada}>
                      {formatarCompetencia(mes)}
                      {travada ? ' · travada' : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {!editando && numeroParcelas > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="campo-parcela-inicial">Começa na parcela</Label>
              <Input
                id="campo-parcela-inicial"
                type="number"
                min={1}
                max={numeroParcelas}
                value={parcelaInicial}
                onChange={(evento) => setParcelaInicial(Number(evento.target.value))}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campo-conta">Conta</Label>
            <Select
              name="contaId"
              required
              defaultValue={editando?.linha.contaId ?? contasOferecidas[0]?.id ?? ''}
              onValueChange={setContaId}
              disabled={soValor}
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
              value={categoriaId}
              onValueChange={setCategoriaId}
              disabled={soValor}
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

        {/* Reembolso de terceiro fecha o formulario porque e a excecao, nao a
            regra: a maioria dos lancamentos e gasto do casal, e um campo sempre
            visivel no meio dos outros sugeriria o contrario. */}
        <div className="mt-4 space-y-3 rounded-caixa border border-borda-suave bg-superficie-alta p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="campo-reembolso" className="text-sm">
                Alguém vai devolver
              </Label>
              <p id="ajuda-reembolso" className="text-xs text-tinta-fraca">
                Continua na fatura do cartão e sai do gasto de vocês, na linha{' '}
                <strong className="font-medium">A receber</strong> do Resumo.
              </p>
            </div>
            <Switch
              id="campo-reembolso"
              checked={ehReembolso}
              disabled={soValor}
              onCheckedChange={alternarReembolso}
              aria-describedby="ajuda-reembolso"
            />
          </div>

          {ehReembolso && (
            <div className="space-y-1.5">
              <Label htmlFor="campo-devedor" className="text-xs font-normal text-tinta-fraca">
                Quem vai devolver
              </Label>
              {/* Nao controlado, como os demais campos de texto: o `key` so
                  existe para o campo reler o valor gravado ao trocar de
                  lancamento sem desmontar o painel. */}
              <Input
                key={editando?.linha.lancamentoId ?? 'novo'}
                id="campo-devedor"
                name="devedorNome"
                disabled={soValor}
                maxLength={80}
                placeholder="Nome ou descrição"
                defaultValue={editando?.linha.devedorNome ?? ''}
              />
            </div>
          )}
        </div>
      </div>

      <SheetFooter className="gap-3 border-t border-borda-suave">
        {aviso && <p className="text-xs text-atencao">{aviso}</p>}
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
          <Button type="submit" disabled={pendente || travaDaLinha !== null || semAlcance}>
            {pendente ? 'Salvando…' : editando ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </SheetFooter>
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
  /** O mes aberto na tela: e a Fatura inicial, e o mes da linha editada. */
  competencia: string;
  /** Faturas travadas perto da tela, de todas as contas. */
  travadas: readonly FaturaTravada[];
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
  competencia,
  travadas,
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
      estado.modo === 'editar'
        ? idBotaoEditar(estado.linha.parcelaId)
        : (estado.focoAoFechar ?? ID_BOTAO_NOVO_LANCAMENTO);
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
            competencia={competencia}
            travadas={travadas}
            pendente={pendente}
            iniciar={iniciar}
            onFechar={onFechar}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
