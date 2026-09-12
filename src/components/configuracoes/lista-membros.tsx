'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { CampoCor, CampoNome } from '@/components/configuracoes/campos-nome-e-cor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { acaoDefinirQuemAbsorveSobra, acaoEditarMembro } from '@/server/actions/configuracao';
import type { ResultadoConfiguracao } from '@/server/repositorios/configuracao';

/**
 * So o que a tela usa. `email` fica de fora de proposito: e a chave da
 * allowlist do login, e `editarMembro` nao o grava — trocar o e-mail por aqui
 * tiraria a pessoa do proprio sistema.
 */
type Membro = { id: string; nome: string; cor: string; ativo: boolean; absorveSobra: boolean };

/**
 * Os motivos de recusa saem do tipo do repositorio, nao de uma copia escrita a
 * mao aqui: motivo novo la vira erro de compilacao no `switch` abaixo, que nao
 * tem `default`. Mesma construcao de `lista-categorias.tsx`.
 */
type MotivoDeRecusa = Extract<ResultadoConfiguracao<unknown>, { ok: false }>['motivo'];

/** Mensagem de recusa, mais se ela se ancora no campo de nome. */
type ErroDeFormulario = { mensagem: string; noCampoNome: boolean };

/**
 * Mensagem de cada recusa. `switch` sem `default`: motivo novo quebra a
 * compilacao em vez de virar um "deu erro" generico na tela.
 *
 * NOME_DUPLICADO nao e alcancavel aqui — `Membro.nome` nao e @unique no schema
 * (`repositorios/configuracao.ts`), e `editarMembro` nao toca no `email`, que
 * e o unico campo unico da tabela. O motivo existe no tipo porque `Categoria`
 * precisa dele, e e tratado porque a alternativa seria um `as` ou um `default`
 * engolindo o que nao esperamos. NAO_ENCONTRADO e raro e e real: sao duas
 * pessoas no mesmo sistema.
 */
function mensagemDeRecusa(motivo: MotivoDeRecusa): string {
  switch (motivo) {
    case 'NOME_DUPLICADO':
      return 'Já existe uma pessoa com esse nome.';
    case 'NAO_ENCONTRADO':
      return 'Essa pessoa não existe mais. Atualize a página para ver a lista como ela está agora.';
  }
}

/** Falha, nao recusa: banco fora do ar, Neon hibernando, rede caindo no meio. */
function mensagemDeFalha(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Não foi possível salvar.';
}

/** Id previsivel do botao de editar de cada linha — mesma ideia de `idBotaoEditar` na grade. */
function idBotaoEditarMembro(membroId: string): string {
  return `editar-membro-${membroId}`;
}

/** O paragrafo que explica o que a escolha da sobra significa, apontado por cada radio. */
const ID_EXPLICACAO_DA_SOBRA = 'explicacao-absorve-sobra';

/**
 * O formulario de nome e cor, que substitui a linha enquanto esta aberto. Monta
 * e desmonta com ela (a lista so guarda qual id esta sendo editado), entao cada
 * abertura recomeca com `useState` zerado e `defaultValue` lido do membro
 * atual — mesma razao do `Formulario` dentro de `painel-lancamento.tsx`.
 *
 * Rotulos so para leitor de tela, como no modo de edicao de
 * `lista-categorias.tsx`: sao dois campos apenas, um deles o seletor de cor, e
 * o nome ja aparece escrito dentro do proprio campo. `lista-contas.tsx` faz o
 * contrario porque la sao cinco campos, dois deles numeros de dois digitos
 * lado a lado.
 */
function FormularioMembro({ membro, onFechar }: { membro: Membro; onFechar: () => void }) {
  const [erro, setErro] = useState<ErroDeFormulario | null>(null);
  const [pendente, iniciar] = useTransition();

  const idBase = `membro-${membro.id}`;
  const idNome = `${idBase}-nome`;
  const idCor = `${idBase}-cor`;
  const idErro = `${idBase}-erro`;

  /**
   * `onSubmit` com `preventDefault`, e nao `action={...}`: o React 19 chama
   * `requestFormReset` ANTES de rodar a funcao passada em `action`, entao o
   * formulario volta aos `defaultValue` mesmo quando o servidor recusa, e a
   * pessoa perde o que digitou justamente na hora de corrigir. O registro da
   * medicao esta em `painel-lancamento.tsx` (funcao `enviar`) e em
   * `lista-categorias.tsx`. Nao "simplifique" de volta.
   *
   * A validacao do navegador nao muda com isso: `required`, `pattern` e
   * `maxLength` barram o envio antes de este handler existir.
   */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Lido agora, sincronamente: `currentTarget` e nulo depois que o handler retorna.
    const dados = new FormData(evento.currentTarget);
    const entrada = { nome: String(dados.get('nome') ?? ''), cor: String(dados.get('cor') ?? '') };

    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await acaoEditarMembro(membro.id, entrada);

        if (!resultado.ok) {
          // Recusa nunca fecha o formulario nem limpa o campo: fechar aqui
          // faria a tela parecer que gravou (docs/arquitetura.md).
          setErro({
            mensagem: mensagemDeRecusa(resultado.motivo),
            noCampoNome: resultado.motivo === 'NOME_DUPLICADO',
          });
          return;
        }

        // Sem `toast`: a linha volta ao repouso ja com o nome e a cor novos,
        // pelo `revalidatePath` da action, e a faixa colorida muda na grade e
        // no resumo.
        onFechar();
      } catch (e) {
        setErro({ mensagem: mensagemDeFalha(e), noCampoNome: false });
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor={idCor} className="sr-only">
          {`Cor de ${membro.nome}`}
        </Label>
        <CampoCor id={idCor} defaultValue={membro.cor} />
      </div>

      <div className="min-w-0 flex-1">
        <Label htmlFor={idNome} className="sr-only">
          {`Nome de ${membro.nome}`}
        </Label>
        <CampoNome
          id={idNome}
          defaultValue={membro.nome}
          autoFocus
          aria-invalid={erro?.noCampoNome ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
        />
      </div>

      <Button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar'}
      </Button>
      <Button type="button" variant="outline" onClick={onFechar} disabled={pendente}>
        Cancelar
      </Button>

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

/** A linha em repouso: amostra da cor, nome e o botao de editar. */
function LinhaMembro({ membro, onEditar }: { membro: Membro; onEditar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Cor vinda do banco e dado — a unica excecao a proibicao de cor literal. */}
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: membro.cor }}
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          membro.ativo ? 'text-tinta' : 'text-tinta-fraca'
        }`}
      >
        {membro.nome}
        {/* Nao ha como reativar por aqui: `editarMembro` grava nome e cor, e
            nada mais. Mostrar o estado e melhor do que esconde-lo — uma pessoa
            inativa some de `/despesas` e de `/resumo`. */}
        {!membro.ativo && <span className="ml-2 text-xs">(inativa)</span>}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        id={idBotaoEditarMembro(membro.id)}
        onClick={onEditar}
        aria-label={`Editar ${membro.nome}`}
      >
        <Pencil aria-hidden="true" />
        Editar
      </Button>
    </div>
  );
}

/**
 * Quem fica com o centavo de sobra do rateio 50/50, como escolha unica.
 *
 * Um grupo de radio, e nao um `Switch` por linha: dois interruptores
 * independentes permitem marcar zero ou dois, e a invariante e que
 * EXATAMENTE UM membro absorva a sobra (docs/decisoes.md). O radio nativo ja
 * carrega essa regra — o navegador desmarca o outro sozinho, e o leitor de tela
 * anuncia "1 de 2". O `radio-group` do shadcn nao foi instalado, e nao vale
 * acrescentar um componente gerado por um unico uso: `accent-acento` pinta o
 * controle nativo com o token da casa.
 *
 * A gravacao e imediata, no `onChange`, como o botao de arquivar de
 * `lista-categorias.tsx` — nao ha "salvar" a apertar depois. Por isso o valor
 * exibido e otimista: o radio marcado vem do servidor (`absorveSobra`), e
 * `useOptimistic` segura a escolha nova durante a transicao. Sem ele o React
 * devolveria o radio ao valor antigo no primeiro render da transicao, e o
 * clique pareceria nao ter pegado. Quando a transicao termina, o valor volta a
 * ser o do servidor: o novo, se gravou; o antigo, se recusou — e ai a mensagem
 * ao lado explica.
 */
function EscolhaDaSobra({ membros }: { membros: Membro[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // `?? null` porque zero membros marcados e estado possivel no banco — e uma
  // das razoes de esta tela existir. Nesse caso nenhum radio fica marcado, e o
  // aviso abaixo pede a escolha.
  const doServidor = membros.find((membro) => membro.absorveSobra)?.id ?? null;
  const [escolhido, escolherOtimista] = useOptimistic(doServidor);

  function escolher(membroId: string) {
    setErro(null);
    iniciar(async () => {
      escolherOtimista(membroId);
      try {
        const resultado = await acaoDefinirQuemAbsorveSobra(membroId);
        if (!resultado.ok) {
          setErro(mensagemDeRecusa(resultado.motivo));
          return;
        }
        // Sem `toast`: o radio marcado E o retorno.
      } catch (e) {
        setErro(mensagemDeFalha(e));
      }
    });
  }

  return (
    <div className="border-t border-borda px-5 py-4">
      <fieldset>
        <legend className="text-xs font-medium tracking-wide text-tinta-fraca uppercase">
          Sobra do rateio
        </legend>
        <p id={ID_EXPLICACAO_DA_SOBRA} className="mt-1 text-xs text-tinta-fraca">
          Quem fica com o centavo de sobra quando o rateio 50/50 não divide exato.
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-4">
          {membros.map((membro) => (
            <Label key={membro.id} className="cursor-pointer text-sm font-normal text-tinta">
              <input
                type="radio"
                name="absorve-sobra"
                value={membro.id}
                checked={escolhido === membro.id}
                onChange={() => escolher(membro.id)}
                aria-describedby={ID_EXPLICACAO_DA_SOBRA}
                className="size-4 cursor-pointer accent-acento"
              />
              {membro.nome}
            </Label>
          ))}

          {/* O unico aviso de gravacao em voo deste grupo: aqui nao ha botao
              cujo rotulo possa carregar o "Salvando…", como fazem os
              formularios. `role="status"` para o leitor de tela tambem receber. */}
          {pendente && (
            <span role="status" className="text-xs text-tinta-fraca">
              Salvando…
            </span>
          )}
        </div>

        {escolhido === null && (
          <p className="mt-2 text-sm text-atencao">
            Ninguém está marcado — escolha quem absorve a sobra.
          </p>
        )}

        {erro && (
          <p role="alert" className="mt-2 text-sm text-negativo">
            {erro}
          </p>
        )}
      </fieldset>
    </div>
  );
}

const CLASSE_LINHA = 'border-b border-borda-suave px-5 py-2.5 last:border-0';

/**
 * A lista de pessoas: nome, cor, e quem absorve a sobra do rateio.
 *
 * Nao ha "nova pessoa" nem exclusao: sao duas, fixadas pela allowlist de
 * e-mails do login (`src/server/auth.ts`). Cadastrar aqui criaria alguem que
 * nao consegue entrar.
 */
export function ListaMembros({ membros }: { membros: Membro[] }) {
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
    document.getElementById(idBotaoEditarMembro(alvo))?.focus();
  }, [editandoId]);

  return (
    <section
      aria-labelledby="titulo-membros"
      className="rounded-caixa border border-borda bg-superficie"
    >
      <div className="border-b border-borda px-5 py-4">
        <h2 id="titulo-membros" className="text-sm font-medium text-tinta">
          Pessoas
        </h2>
        <p className="mt-1 text-xs text-tinta-fraca">
          O nome e a cor identificam cada pessoa na grade de despesas e no resumo. O e-mail não
          muda por aqui: é ele que autoriza a entrada no sistema.
        </p>
      </div>

      {membros.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tinta-fraca">Nenhuma pessoa cadastrada.</p>
      ) : (
        <>
          <ul>
            {membros.map((membro) => (
              <li
                key={membro.id}
                className={membro.ativo ? CLASSE_LINHA : `${CLASSE_LINHA} opacity-60`}
              >
                {editandoId === membro.id ? (
                  <FormularioMembro membro={membro} onFechar={() => setEditandoId(null)} />
                ) : (
                  <LinhaMembro membro={membro} onEditar={() => setEditandoId(membro.id)} />
                )}
              </li>
            ))}
          </ul>

          <EscolhaDaSobra membros={membros} />
        </>
      )}
    </section>
  );
}
