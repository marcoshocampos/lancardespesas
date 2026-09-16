'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { CampoCor, CampoNome } from '@/components/configuracoes/campos-nome-e-cor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  acaoEditarConta,
  type CampoDeCartao,
  type ResultadoEdicaoConta,
} from '@/server/actions/configuracao';

/**
 * So o que a tela usa. `ordem` fica de fora junto com `tipo`: o repositorio
 * (`editarConta`) nao grava nenhum dos dois de proposito, e campo que a
 * gravacao ignora nao entra em formulario.
 */
type Conta = {
  id: string;
  nome: string;
  tipo: 'CARTAO' | 'EXTERNA';
  cor: string;
  ativa: boolean;
  diaFechamento: number | null;
  diaVencimento: number | null;
};

/**
 * Os motivos de recusa saem do tipo da action, nao de uma copia escrita a mao
 * aqui — mesma razao de `lista-categorias.tsx`: motivo novo la vira erro de
 * compilacao no `switch` abaixo, que nao tem `default`.
 *
 * `acaoEditarConta` devolve uma uniao mais larga que a das outras acoes
 * (`ResultadoEdicaoConta`, e nao `ResultadoConfiguracao`): alem de
 * NOME_DUPLICADO e NAO_ENCONTRADO, ela recusa com CARTAO_SEM_DIAS, que vem com
 * `campos` e `mensagem` proprios.
 */
type RecusaDeConta = Extract<ResultadoEdicaoConta, { ok: false }>;

/** Os campos deste formulario que uma recusa consegue apontar. */
type CampoDeConta = 'nome' | CampoDeCartao;

/** Mensagem de recusa, mais em quais campos ela se ancora. */
type ErroDeFormulario = { mensagem: string; campos: readonly CampoDeConta[] };

/** Menor e maior dia do mes aceitos pela action (`z.number().int().min(1).max(31)`). */
const PRIMEIRO_DIA = 1;
const ULTIMO_DIA = 31;

/**
 * Mensagem de cada recusa, e em que campo ela se ancora. `switch` sem
 * `default`: motivo novo quebra a compilacao em vez de virar um "deu erro"
 * generico na tela.
 *
 * CARTAO_SEM_DIAS ja traz a mensagem pronta e a lista de campos que faltam —
 * usar os dois e o ponto de a Tarefa 3 ter feito a recusa assim, em vez de
 * deixar a excecao subir: o conserto depende de a pessoa saber QUAL dia falta.
 *
 * NOME_DUPLICADO nao e alcancavel aqui: `Conta.nome` nao e @unique no schema, e
 * duas contas com o mesmo nome, uma de cada pessoa, sao dado legitimo
 * (`repositorios/configuracao.ts`). O motivo existe no tipo porque `Categoria`
 * precisa dele, e e tratado porque a alternativa seria um `as` ou um `default`
 * engolindo o que nao esperamos.
 */
function erroDeRecusa(recusa: RecusaDeConta): ErroDeFormulario {
  switch (recusa.motivo) {
    case 'CARTAO_SEM_DIAS':
      return { mensagem: recusa.mensagem, campos: recusa.campos };
    case 'NOME_DUPLICADO':
      return { mensagem: 'Já existe uma conta com esse nome.', campos: ['nome'] };
    case 'NAO_ENCONTRADO':
      return {
        mensagem:
          'Essa conta não existe mais. Atualize a página para ver a lista como ela está agora.',
        campos: [],
      };
  }
}

/** Falha, nao recusa: banco fora do ar, Neon hibernando, rede caindo no meio. */
function mensagemDeFalha(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Não foi possível salvar.';
}

/** Id previsivel do botao de editar de cada linha — mesma ideia de `idBotaoEditar` na grade. */
function idBotaoEditarConta(contaId: string): string {
  return `editar-conta-${contaId}`;
}

/** So as chaves que existem: com `exactOptionalPropertyTypes`, `undefined` explicito nao passa. */
type MarcacaoDeCampo = { 'aria-invalid'?: true; 'aria-describedby'?: string };

/**
 * Marca no input o campo que a recusa apontou. E para isto que
 * `RecusaDiasDeCartao` carrega `campos`: sem ele, a tela so teria um paragrafo
 * dizendo que falta um dia, e a pessoa procuraria qual.
 */
function marcacaoDoCampo(
  campo: CampoDeConta,
  erro: ErroDeFormulario | null,
  idErro: string,
): MarcacaoDeCampo {
  if (!erro?.campos.includes(campo)) return {};
  return { 'aria-invalid': true, 'aria-describedby': idErro };
}

/**
 * O dia como a action o espera: numero inteiro ou `null`.
 *
 * Campo AUSENTE do formulario (conta externa nao mostra nenhum dos dois) vira
 * `null`, que e o valor correto ali — conta sem fatura nao tem fechamento nem
 * vencimento. Para cartao os dois campos existem, sao `required` e tem `min` e
 * `max`, entao o navegador ja barra vazio e fora de faixa; se ainda assim
 * chegar vazio, `null` faz a action responder CARTAO_SEM_DIAS, que a tela sabe
 * mostrar. O que nao pode acontecer e virar `0` — `Number('')` e zero, passaria
 * pelo `.nullable()` e morreria no `.min(1)` como excecao opaca.
 */
function diaDoFormulario(valor: FormDataEntryValue | null): number | null {
  if (valor === null) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  const numero = Number(texto);
  return Number.isInteger(numero) ? numero : null;
}

/** O resumo da conta em repouso: o que ela e, e quando a fatura dela fecha e vence. */
function descricaoDaConta(conta: Conta): string {
  if (conta.tipo !== 'CARTAO') return 'Conta externa';
  // Cartao sem dia so existe em dado antigo ou vindo do prisma studio; mostrar
  // o buraco e melhor do que esconde-lo, porque e ele que derruba o calculo da
  // competencia na hora de lancar.
  const fecha =
    conta.diaFechamento === null ? 'sem dia de fechamento' : `fecha dia ${conta.diaFechamento}`;
  const vence =
    conta.diaVencimento === null ? 'sem dia de vencimento' : `vence dia ${conta.diaVencimento}`;
  return `Cartão · ${fecha} · ${vence}`;
}

const CLASSE_ROTULO = 'text-xs font-normal text-tinta-fraca';

/**
 * O formulario de edicao, que substitui a linha enquanto esta aberto. Monta e
 * desmonta com ela (a lista so guarda qual id esta sendo editado), entao cada
 * abertura recomeca com `useState` zerado e `defaultValue` lido da conta atual.
 *
 * Ao contrario de `lista-categorias.tsx`, aqui os rotulos ficam VISIVEIS: sao
 * ate cinco campos na mesma linha, e "fecha dia" e "vence dia" sao dois numeros
 * de dois digitos lado a lado — sem rotulo na tela, ninguem distingue um do
 * outro. Em categorias, com nome e cor apenas, o rotulo so no leitor de tela
 * nao custa nada.
 */
function FormularioConta({ conta, onFechar }: { conta: Conta; onFechar: () => void }) {
  const [erro, setErro] = useState<ErroDeFormulario | null>(null);
  // `ativa` e o unico campo controlado: e um booleano, e nao ha `defaultValue`
  // que o React 19 possa restaurar por baixo. Vai para a action direto do
  // estado, sem passar pelo FormData.
  const [ativa, setAtiva] = useState(conta.ativa);
  const [pendente, iniciar] = useTransition();

  const ehCartao = conta.tipo === 'CARTAO';
  const idBase = `conta-${conta.id}`;
  const idNome = `${idBase}-nome`;
  const idCor = `${idBase}-cor`;
  const idFechamento = `${idBase}-fechamento`;
  const idVencimento = `${idBase}-vencimento`;
  const idAtiva = `${idBase}-ativa`;
  const idErro = `${idBase}-erro`;

  /**
   * `onSubmit` com `preventDefault`, e nao `action={...}`: o React 19 chama
   * `requestFormReset` ANTES de rodar a funcao passada em `action`, entao o
   * formulario volta aos `defaultValue` mesmo quando o servidor recusa. A
   * recusa que este formulario existe para mostrar — CARTAO_SEM_DIAS —
   * apareceria com os campos ja de volta ao que esta gravado, sem o que
   * corrigir. O registro da medicao esta em `painel-lancamento.tsx` (funcao
   * `enviar`) e em `lista-categorias.tsx`. Nao "simplifique" de volta.
   *
   * A validacao do navegador nao muda com isso: `required`, `pattern`,
   * `maxLength`, `min` e `max` barram o envio antes de este handler existir.
   */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Lido agora, sincronamente: `currentTarget` e nulo depois que o handler retorna.
    const dados = new FormData(evento.currentTarget);
    const entrada = {
      nome: String(dados.get('nome') ?? ''),
      cor: String(dados.get('cor') ?? ''),
      // Conta externa nao renderiza os dois campos, entao `get` volta null e o
      // envio manda `null` para os dois — que e o que a conta sem fatura deve
      // gravar.
      diaFechamento: diaDoFormulario(dados.get('diaFechamento')),
      diaVencimento: diaDoFormulario(dados.get('diaVencimento')),
      ativa,
    };

    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await acaoEditarConta(conta.id, entrada);

        if (!resultado.ok) {
          // Recusa nunca fecha o formulario nem limpa o campo: fechar aqui
          // faria a tela parecer que gravou (docs/arquitetura.md).
          setErro(erroDeRecusa(resultado));
          return;
        }

        // Sucesso nao leva `toast`: a linha volta ao repouso ja com o nome, a
        // cor e os dias novos, pelo `revalidatePath` da action.
        onFechar();
      } catch (e) {
        setErro({ mensagem: mensagemDeFalha(e), campos: [] });
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor={idCor} className={CLASSE_ROTULO}>
          Cor
        </Label>
        <CampoCor id={idCor} defaultValue={conta.cor} />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor={idNome} className={CLASSE_ROTULO}>
          Nome
        </Label>
        <CampoNome
          id={idNome}
          defaultValue={conta.nome}
          autoFocus
          {...marcacaoDoCampo('nome', erro, idErro)}
        />
      </div>

      {/* Fechamento e vencimento so existem para cartao: conta externa (pix,
          débito, boleto, dinheiro) nao tem fatura, e o dia dela seria um campo
          sem significado. Escondidos, os dois saem do FormData e a gravacao
          manda `null` para ambos. */}
      {ehCartao && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={idFechamento} className={CLASSE_ROTULO}>
              Fecha dia
            </Label>
            <Input
              id={idFechamento}
              name="diaFechamento"
              type="number"
              inputMode="numeric"
              required
              min={PRIMEIRO_DIA}
              max={ULTIMO_DIA}
              step={1}
              defaultValue={conta.diaFechamento ?? ''}
              className="w-20"
              {...marcacaoDoCampo('diaFechamento', erro, idErro)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={idVencimento} className={CLASSE_ROTULO}>
              Vence dia
            </Label>
            <Input
              id={idVencimento}
              name="diaVencimento"
              type="number"
              inputMode="numeric"
              required
              min={PRIMEIRO_DIA}
              max={ULTIMO_DIA}
              step={1}
              defaultValue={conta.diaVencimento ?? ''}
              className="w-20"
              {...marcacaoDoCampo('diaVencimento', erro, idErro)}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pb-1.5">
        <Switch id={idAtiva} checked={ativa} onCheckedChange={setAtiva} />
        <Label htmlFor={idAtiva} className={CLASSE_ROTULO}>
          Ativa
        </Label>
      </div>

      <Button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar'}
      </Button>
      <Button type="button" variant="outline" onClick={onFechar} disabled={pendente}>
        Cancelar
      </Button>

      {/* `w-full` joga a mensagem para a linha de baixo do flex, sob os campos.
          O `aria-describedby` dos campos marcados aponta para este paragrafo. */}
      {erro && (
        <p id={idErro} role="alert" className="w-full text-sm text-negativo">
          {erro.mensagem}
        </p>
      )}
    </form>
  );
}

/** A linha em repouso: amostra da cor, nome, o que a conta e, e o botao de editar. */
function LinhaConta({ conta, onEditar }: { conta: Conta; onEditar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Cor vinda do banco e dado — a unica excecao a proibicao de cor literal. */}
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: conta.cor }}
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          conta.ativa ? 'text-tinta' : 'text-tinta-fraca'
        }`}
      >
        {conta.nome}
        {!conta.ativa && <span className="ml-2 text-xs">(inativa)</span>}
      </span>

      <span className="shrink-0 text-xs text-tinta-fraca">{descricaoDaConta(conta)}</span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        id={idBotaoEditarConta(conta.id)}
        onClick={onEditar}
        aria-label={`Editar ${conta.nome}`}
      >
        <Pencil aria-hidden="true" />
        Editar
      </Button>
    </div>
  );
}

const CLASSE_LINHA = 'border-b border-borda-suave px-5 py-2.5 last:border-0';

/**
 * A lista de contas: so editar. Nome, cor, dia de fechamento, dia de vencimento
 * e se a conta esta ativa.
 *
 * Nao ha "nova conta" de proposito. Conta nova tem consequencia sobre as
 * faturas e sobre as colunas da matriz do Resumo — e decisao de produto, nao de
 * configuracao.
 *
 * Recebe TODAS as contas, inativas inclusive: `/despesas` e `/resumo` filtram
 * `ativa: true`, e e desta tela que se volta atras.
 */
export function ListaContas({ contas }: { contas: Conta[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const ultimaEdicaoRef = useRef<string | null>(null);

  // Sair do modo de edicao desmonta o formulario, e com ele o campo que estava
  // com o foco — sem isto o foco cairia no `body`. Devolve para o botao
  // "Editar" da propria linha, que volta a existir no mesmo render. Mesma ideia
  // de `lista-categorias.tsx` e do `focoAoFecharRef` de `painel-lancamento.tsx`.
  useEffect(() => {
    if (editandoId !== null) {
      ultimaEdicaoRef.current = editandoId;
      return;
    }
    const alvo = ultimaEdicaoRef.current;
    if (alvo === null) return;
    ultimaEdicaoRef.current = null;
    document.getElementById(idBotaoEditarConta(alvo))?.focus();
  }, [editandoId]);

  return (
    <section
      aria-labelledby="titulo-contas"
      className="rounded-caixa border border-borda bg-superficie"
    >
      <div className="border-b border-borda px-5 py-4">
        <h2 id="titulo-contas" className="text-sm font-medium text-tinta">
          Contas
        </h2>
        <p className="mt-1 text-xs text-tinta-fraca">
          De onde o dinheiro sai. Aqui só se edita o que já existe: conta nova mexe nas faturas e
          nas colunas do Resumo, e o tipo — cartão ou externa — não muda depois de criada.
        </p>
        <p className="mt-1 text-xs text-tinta-fraca">
          Desativar tira a conta das opções de lançamento novo e das colunas do Resumo. Desative
          só conta sem lançamento nenhum: enquanto houver, o mês em que ela aparece deixa de
          abrir.
        </p>
      </div>

      {contas.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tinta-fraca">Nenhuma conta cadastrada.</p>
      ) : (
        <ul>
          {contas.map((conta) => (
            <li key={conta.id} className={conta.ativa ? CLASSE_LINHA : `${CLASSE_LINHA} opacity-60`}>
              {editandoId === conta.id ? (
                <FormularioConta conta={conta} onFechar={() => setEditandoId(null)} />
              ) : (
                <LinhaConta conta={conta} onEditar={() => setEditandoId(conta.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
