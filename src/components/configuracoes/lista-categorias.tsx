'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { CampoCor, CampoNome } from '@/components/configuracoes/campos-nome-e-cor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  acaoArquivarCategoria,
  acaoCriarCategoria,
  acaoEditarCategoria,
} from '@/server/actions/configuracao';
import type { ResultadoConfiguracao } from '@/server/repositorios/configuracao';

/** So o que a tela usa. `icone` existe no schema e continua sem uso em lugar nenhum. */
type Categoria = { id: string; nome: string; cor: string; arquivada: boolean };

/**
 * Os motivos de recusa saem do tipo do repositorio, nao de uma copia escrita a
 * mao aqui: motivo novo la vira erro de compilacao no `switch` abaixo, que nao
 * tem `default`. Repetir a uniao deixaria o `switch` exaustivo sobre uma copia
 * velha, e a recusa nova cairia no vazio — que e exatamente o caso que
 * docs/arquitetura.md proibe (recusa engolida como sucesso).
 */
type MotivoDeRecusa = Extract<ResultadoConfiguracao<unknown>, { ok: false }>['motivo'];

/** Mensagem de recusa, mais em qual campo ela se ancora. */
type ErroDeFormulario = { mensagem: string; noCampoNome: boolean };

/**
 * Cor inicial de categoria nova. E DADO, nao estilo: vai para `Categoria.cor`
 * no banco e volta por `style` inline, como toda cor gravada — os tokens de
 * `globals.css` sao superficie, tinta e semantica, e nenhum deles identifica
 * categoria. O cinza e o mesmo que `prisma/seed.ts` ja usa em "Terceiros":
 * discreto o bastante para ninguem confundir com escolha deliberada.
 */
const COR_INICIAL = '#7A7A7A';

/**
 * Mensagem de cada recusa. `switch` sem `default`, como `textoDoEstado` em
 * `conferencia-fatura.tsx`: motivo novo quebra a compilacao em vez de virar um
 * "deu erro" generico na tela.
 *
 * NOME_DUPLICADO e o motivo desta tela inteira — a pessoa precisa saber que o
 * nome ja existe, e nao que houve um erro. NAO_ENCONTRADO e raro e e real: sao
 * duas pessoas no mesmo sistema, e a categoria pode ter sumido enquanto esta
 * tela estava aberta. Em arquivar so NAO_ENCONTRADO e alcancavel (a gravacao
 * mexe so no booleano, e nenhuma constraint unica olha para ele), mas o tipo
 * traz os dois e os dois sao tratados — a alternativa seria um `as` ou um
 * `default` engolindo o que nao esperamos.
 */
function mensagemDeRecusa(motivo: MotivoDeRecusa): string {
  switch (motivo) {
    case 'NOME_DUPLICADO':
      return 'Já existe uma categoria com esse nome.';
    case 'NAO_ENCONTRADO':
      return 'Essa categoria não existe mais. Atualize a página para ver a lista como ela está agora.';
  }
}

/** Falha, nao recusa: banco fora do ar, Neon hibernando, rede caindo no meio. */
function mensagemDeFalha(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Não foi possível salvar.';
}

/** Id previsivel do botao de editar de cada linha — mesma ideia de `idBotaoEditar` na grade. */
function idBotaoEditarCategoria(categoriaId: string): string {
  return `editar-categoria-${categoriaId}`;
}

/** O mesmo id nos dois blocos: e o que permite reencontrar o botao depois de a linha mudar de bloco. */
function idBotaoArquivarCategoria(categoriaId: string): string {
  return `arquivar-categoria-${categoriaId}`;
}

type PropsCampos = {
  idNome: string;
  idCor: string;
  idErro: string;
  nome: string;
  cor: string;
  rotuloNome: string;
  rotuloCor: string;
  /** Criar mostra os rotulos; editar, inline na linha, os deixa so para leitor de tela. */
  rotulosVisiveis: boolean;
  focoAoMontar: boolean;
  erro: ErroDeFormulario | null;
};

/**
 * Os dois campos que criar e editar tem em comum, num lugar so — nao por
 * economia de linhas, mas porque os dois modos precisam sair identicos.
 *
 * As travas dos campos (`required`, `pattern`, `maxLength`, `type="color"`)
 * nao estao aqui: moram em `campos-nome-e-cor.tsx`, que e o mesmo modulo que
 * contas e pessoas usam. Este componente cuida so do rotulo e do arranjo, que
 * e o que varia entre criar e editar.
 */
function CamposNomeECor({
  idNome,
  idCor,
  idErro,
  nome,
  cor,
  rotuloNome,
  rotuloCor,
  rotulosVisiveis,
  focoAoMontar,
  erro,
}: PropsCampos) {
  const classeRotulo = rotulosVisiveis ? 'text-xs font-normal text-tinta-fraca' : 'sr-only';
  // `space-y` empurra o campo para baixo do rotulo; com o rotulo so no leitor
  // de tela nao ha nada acima para abrir espaco.
  const classeGrupo = rotulosVisiveis ? 'space-y-1.5' : '';

  return (
    <>
      <div className={classeGrupo}>
        <Label htmlFor={idCor} className={classeRotulo}>
          {rotuloCor}
        </Label>
        <CampoCor id={idCor} defaultValue={cor} />
      </div>

      <div className={`min-w-0 flex-1 ${classeGrupo}`}>
        <Label htmlFor={idNome} className={classeRotulo}>
          {rotuloNome}
        </Label>
        <CampoNome
          id={idNome}
          defaultValue={nome}
          autoFocus={focoAoMontar}
          placeholder="Ex.: Mercado"
          aria-invalid={erro?.noCampoNome ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
        />
      </div>
    </>
  );
}

/** `modo: 'criar'` e `modo: 'editar'` — um componente, dois modos, como `ModoPainel`. */
type PropsFormulario =
  | { modo: 'criar' }
  | { modo: 'editar'; categoria: Categoria; onFechar: () => void };

/**
 * O formulario de nome e cor, servindo aos dois modos. Em edicao ele monta e
 * desmonta com a linha (a lista so guarda qual id esta sendo editado), entao
 * cada abertura recomeca com `useState` zerado e `defaultValue` lido da
 * categoria atual — mesma razao do `Formulario` dentro de `painel-lancamento.tsx`.
 */
function FormularioCategoria(props: PropsFormulario) {
  const [erro, setErro] = useState<ErroDeFormulario | null>(null);
  const [pendente, iniciar] = useTransition();

  const editando = props.modo === 'editar' ? props : null;
  const idBase = editando ? `categoria-${editando.categoria.id}` : 'categoria-nova';
  const idNome = `${idBase}-nome`;
  const idCor = `${idBase}-cor`;
  const idErro = `${idBase}-erro`;

  /**
   * `onSubmit` com `preventDefault`, e nao `action={...}`: o React 19 chama
   * `requestFormReset` ANTES de rodar a funcao passada em `action`
   * (`startHostTransition`, em react-dom), entao o formulario volta aos
   * `defaultValue` mesmo quando o servidor recusa. A recusa que esta tela
   * existe para mostrar — NOME_DUPLICADO — apareceria com o campo ja em
   * branco, sem o nome que a pessoa digitou e sem o que corrigir. Aqui o
   * `reset` acontece uma vez so, e so no sucesso de criar.
   *
   * A validacao do navegador nao muda com isso: `required`, `pattern` e
   * `maxLength` barram o envio antes de este handler existir.
   */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Lido agora, sincronamente: `currentTarget` e nulo depois que o handler retorna.
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const entrada = { nome: String(dados.get('nome') ?? ''), cor: String(dados.get('cor') ?? '') };

    setErro(null);
    iniciar(async () => {
      try {
        const resultado = editando
          ? await acaoEditarCategoria(editando.categoria.id, entrada)
          : await acaoCriarCategoria(entrada);

        if (!resultado.ok) {
          // Recusa nunca fecha o formulario nem limpa o campo: fechar aqui
          // faria a tela parecer que gravou (docs/arquitetura.md).
          setErro({
            mensagem: mensagemDeRecusa(resultado.motivo),
            noCampoNome: resultado.motivo === 'NOME_DUPLICADO',
          });
          return;
        }

        // Sucesso nao leva `toast`: a linha aparece, muda de nome ou muda de
        // cor na propria lista, pelo `revalidatePath` da action. O aviso seria
        // ruido em cima do que ja esta visivel (regra da Etapa 04).
        if (editando) {
          editando.onFechar();
          return;
        }

        formulario.reset();
        document.getElementById(idNome)?.focus();
      } catch (e) {
        setErro({ mensagem: mensagemDeFalha(e), noCampoNome: false });
      }
    });
  }

  const rotuloDoBotao = pendente
    ? editando
      ? 'Salvando…'
      : 'Adicionando…'
    : editando
      ? 'Salvar'
      : 'Adicionar';

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <CamposNomeECor
        idNome={idNome}
        idCor={idCor}
        idErro={idErro}
        nome={editando?.categoria.nome ?? ''}
        cor={editando?.categoria.cor ?? COR_INICIAL}
        rotuloNome={editando ? `Nome da categoria ${editando.categoria.nome}` : 'Nome'}
        rotuloCor={editando ? `Cor da categoria ${editando.categoria.nome}` : 'Cor'}
        rotulosVisiveis={editando === null}
        focoAoMontar={editando !== null}
        erro={erro}
      />

      <Button type="submit" disabled={pendente}>
        {rotuloDoBotao}
      </Button>

      {editando && (
        <Button type="button" variant="outline" onClick={editando.onFechar} disabled={pendente}>
          Cancelar
        </Button>
      )}

      {/* `w-full` joga a mensagem para a linha de baixo do flex, sob os campos.
          `aria-describedby` do campo de nome aponta para este paragrafo. */}
      {erro && (
        <p id={idErro} role="alert" className="w-full text-sm text-negativo">
          {erro.mensagem}
        </p>
      )}
    </form>
  );
}

type PropsLinha = {
  categoria: Categoria;
  /** Anota na lista qual linha acabou de trocar de bloco, para o foco a reencontrar. */
  onArquivado: () => void;
  /** Ausente no bloco de arquivadas: la a unica acao e desarquivar. */
  onEditar?: () => void;
};

/** A linha em repouso: amostra da cor, nome, e as acoes que nao abrem formulario. */
function LinhaCategoria({ categoria, onArquivado, onEditar }: PropsLinha) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const arquivando = !categoria.arquivada;
  const acao = arquivando ? 'Arquivar' : 'Desarquivar';
  // O rotulo muda com a gravacao em voo; o `aria-label` fica no infinitivo,
  // para o nome acessivel do botao nao trocar no meio do clique.
  const rotuloDoBotao = pendente ? (arquivando ? 'Arquivando…' : 'Desarquivando…') : acao;

  function alternarArquivamento() {
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await acaoArquivarCategoria(categoria.id, arquivando);
        if (!resultado.ok) {
          setErro(mensagemDeRecusa(resultado.motivo));
          return;
        }
        // Sem `toast`: a linha troca de bloco na tela, o que ja e o retorno.
        onArquivado();
      } catch (e) {
        setErro(mensagemDeFalha(e));
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Cor vinda do banco e dado — a unica excecao a proibicao de cor literal. */}
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: categoria.cor }}
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          categoria.arquivada ? 'text-tinta-fraca' : 'text-tinta'
        }`}
      >
        {categoria.nome}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {onEditar && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            id={idBotaoEditarCategoria(categoria.id)}
            onClick={onEditar}
            disabled={pendente}
            aria-label={`Editar ${categoria.nome}`}
          >
            <Pencil aria-hidden="true" />
            Editar
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          id={idBotaoArquivarCategoria(categoria.id)}
          onClick={alternarArquivamento}
          disabled={pendente}
          aria-label={`${acao} ${categoria.nome}`}
        >
          {arquivando ? <Archive aria-hidden="true" /> : <ArchiveRestore aria-hidden="true" />}
          {rotuloDoBotao}
        </Button>
      </div>

      {erro && (
        <p role="alert" className="w-full text-sm text-negativo">
          {erro}
        </p>
      )}
    </div>
  );
}

const CLASSE_LINHA = 'border-b border-borda-suave px-5 py-2.5 last:border-0';

/**
 * A lista de categorias: criar, renomear, trocar cor, arquivar e desarquivar.
 * Recebe TODAS as categorias, arquivadas inclusive — esta e a unica tela que as
 * mostra, e a unica de onde se volta atras.
 *
 * Arquivar nao toca em lancamento nenhum: a categoria some das opcoes de
 * lancamento novo (o `where: { arquivada: false }` de `/despesas`) e continua
 * aparecendo nos lancamentos antigos.
 */
export function ListaCategorias({ categorias }: { categorias: Categoria[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const ultimaEdicaoRef = useRef<string | null>(null);
  const ultimoArquivamentoRef = useRef<string | null>(null);

  // Sair do modo de edicao desmonta o formulario, e com ele o campo que estava
  // com o foco — sem isto o foco cairia no `body`. Devolve para o botao
  // "Editar" da propria linha, que volta a existir no mesmo render; se a linha
  // tiver sumido enquanto isso, `getElementById` volta null e o foco so fica
  // onde esta. Mesma ideia do `focoAoFecharRef` de `painel-lancamento.tsx`.
  useEffect(() => {
    if (editandoId !== null) {
      ultimaEdicaoRef.current = editandoId;
      return;
    }
    const alvo = ultimaEdicaoRef.current;
    if (alvo === null) return;
    ultimaEdicaoRef.current = null;
    document.getElementById(idBotaoEditarCategoria(alvo))?.focus();
  }, [editandoId]);

  // Arquivar move a linha de um `<ul>` para o outro: o React destroi o no
  // antigo e cria um novo no bloco de destino, levando junto o botao que
  // acabou de ser clicado — o foco cairia no `body`. O id do botao e o mesmo
  // nos dois blocos, entao basta reencontra-lo DEPOIS que a lista nova chega.
  // Dai a dependencia ser `categorias` (identidade nova a cada resposta do
  // servidor) e nao o clique: focar antes pegaria o no que esta para morrer.
  useEffect(() => {
    const alvo = ultimoArquivamentoRef.current;
    if (alvo === null) return;
    ultimoArquivamentoRef.current = null;
    document.getElementById(idBotaoArquivarCategoria(alvo))?.focus();
  }, [categorias]);

  const ativas = categorias.filter((c) => !c.arquivada);
  const arquivadas = categorias.filter((c) => c.arquivada);

  return (
    <section
      aria-labelledby="titulo-categorias"
      className="rounded-caixa border border-borda bg-superficie"
    >
      <div className="border-b border-borda px-5 py-4">
        <h2 id="titulo-categorias" className="text-sm font-medium text-tinta">
          Categorias
        </h2>
        <p className="mt-1 text-xs text-tinta-fraca">
          A cor identifica a categoria na grade de despesas. Arquivar tira a categoria das opções
          de lançamento novo e não mexe no que já foi lançado.
        </p>
      </div>

      {ativas.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tinta-fraca">Nenhuma categoria em uso.</p>
      ) : (
        <ul>
          {ativas.map((categoria) => (
            <li key={categoria.id} className={CLASSE_LINHA}>
              {editandoId === categoria.id ? (
                <FormularioCategoria
                  modo="editar"
                  categoria={categoria}
                  onFechar={() => setEditandoId(null)}
                />
              ) : (
                <LinhaCategoria
                  categoria={categoria}
                  onArquivado={() => {
                    ultimoArquivamentoRef.current = categoria.id;
                  }}
                  onEditar={() => setEditandoId(categoria.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-borda px-5 py-4">
        <h3 className="text-xs font-medium tracking-wide text-tinta-fraca uppercase">
          Nova categoria
        </h3>
        <div className="mt-2">
          <FormularioCategoria modo="criar" />
        </div>
      </div>

      {arquivadas.length > 0 && (
        <div className="border-t border-borda">
          <h3 className="px-5 pt-4 pb-1 text-xs font-medium tracking-wide text-tinta-fraca uppercase">
            Arquivadas
          </h3>
          <ul>
            {arquivadas.map((categoria) => (
              <li key={categoria.id} className={`${CLASSE_LINHA} opacity-60`}>
                <LinhaCategoria
                  categoria={categoria}
                  onArquivado={() => {
                    ultimoArquivamentoRef.current = categoria.id;
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
