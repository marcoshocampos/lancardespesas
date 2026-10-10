# Decisões

Escolhas que parecem melhoráveis e não são. Cada uma tem um motivo que o código não conta
sozinho, e todas foram desfeitas ou quase desfeitas por alguém achando que estava
melhorando.

**Antes de mudar qualquer coisa desta lista, leia o motivo.** Se ainda achar que vale mudar,
converse com o usuário — não decida sozinho.

As decisões de produto (o que o sistema é, o que ficou fora de escopo) estão na
[spec](specs/2026-08-08-sistema-despesas-casal-design.md). Aqui ficam as técnicas.

---

## Datas são `String`, não `DateTime`

**Onde:** `prisma/schema.prisma` (`dataCompra`, `competencia`, `dataFechamento`,
`dataVencimento`) e o tipo `DataISO` em `src/domain/data.ts`.

Parece errado usar string para data num banco relacional. É deliberado.

Com `DateTime`, alguma camada — driver, ORM, serialização, o navegador — aplica fuso e move
a compra do dia 04 para o dia 03. No C6, que fecha dia 4, isso joga a compra para a fatura
do mês seguinte. O casal só descobriria meses depois, conferindo contra o extrato, e o bug
seria quase impossível de reproduzir.

Datas aqui não têm hora e não têm fuso: são um rótulo de calendário. `String` é a
representação honesta disso.

## Nenhum `Date` dentro de `src/domain/`

Mesmo motivo, aplicado à camada de cálculo. A aritmética de meses é feita com inteiros
(`ano * 12 + mes - 1`), nunca com objetos de data.

`new Date()` na fronteira da aplicação — para saber que mês é hoje, por exemplo — está
liberado e acontece em `src/app/`. O que não pode é regra de cálculo depender disso, porque
aí ela deixa de ser testável e passa a depender do relógio da máquina.

## Prisma 6 em vez do 7

**Versão fixada:** `6.19.3`, com o `7.9.1` já publicado.

O Prisma 7 muda três coisas de uma vez: exige `prisma.config.ts` com `import "dotenv/config"`
porque não carrega mais o `.env` sozinho, troca o gerador `prisma-client-js` por
`prisma-client`, e **altera a API de query** — `create({ data: {...} })` vira `create({...})`
num cliente de forma diferente.

O código das tarefas 9, 10, 13 e 14 do plano está escrito no estilo 6. Migrar no meio da
execução significaria reescrever quatro tarefas antes de executá-las.

**Isso é adiamento, não recusa.** A migração é trabalho de fronteira de fase: fazer no
começo da Fase 2, quando existirem uns poucos arquivos de query já escritos e revisados. O
domínio, que é onde está o valor, não toca no Prisma e não é afetado.

## Segredos em `.env`, não em `.env.local`

O Next.js lê os dois. O **CLI do Prisma lê só o `.env`** — com os segredos apenas em
`.env.local`, `prisma migrate` não encontra a conexão e falha de um jeito confuso de
diagnosticar, ou exige `dotenv-cli` como remendo.

O `.gitignore` cobre `.env*` com exceção explícita de `.env.example`.

## `npx auth secret` traz a ferramenta errada

Armadilha real, custa tempo. O pacote npm chamado literalmente `auth` é **o CLI do Better
Auth**, e ele gera a variável `BETTER_AUTH_SECRET`. O pacote `@auth/cli` **não existe**.

A documentação do Auth.js escreve `npx auth secret` presumindo que o binário já está
instalado localmente junto do `next-auth`. Num projeto onde o `next-auth` ainda não foi
instalado, o `npx` busca no registro e traz o Better Auth.

O Auth.js v5 lê **`AUTH_SECRET`**. O valor gerado serve; só o nome da variável está errado.

## E-mail verificado antes da allowlist

`loginPermitido` exige que o perfil do Google traga `email_verified === true` **antes** de
conferir a allowlist. Ausência do dado recusa; só o valor booleano verdadeiro passa.

Sem isso, um provedor que devolvesse um e-mail não verificado — ou um perfil sem o campo —
poderia casar com um endereço da lista sem nunca ter provado que o controla. A checagem segue
o mesmo princípio da lista vazia recusar todo mundo: **na dúvida, não entra.**

A regra vive em `src/server/auth-regras.ts`, separada do Auth.js e sem dependência dele, para
poder ser testada sem browser e sem OAuth.

## Não rodar `prisma init`

Ele mexe no `.env` e no `.gitignore`, que já estão prontos e commitados, e pode acrescentar
uma segunda linha `DATABASE_URL` que sobrescreve a primeira. Crie `prisma/schema.prisma` à
mão.

## `passWithNoTests: true` no Vitest

Sem essa opção, `vitest run` sai com código 1 quando não existe nenhum arquivo de teste. Num
projeto recém-criado isso faz o `npm test` falhar antes de existir o primeiro teste, e a
verificação da tarefa de scaffold nunca passaria.

## `AGENTS.md` na raiz existe de propósito

O Next escreve instruções de agente no `CLAUDE.md` quando não encontra um `AGENTS.md`. Com
o arquivo presente, ele pula.

Sem isso, um `npm run dev` qualquer reescreveria o `CLAUDE.md` do usuário — que é mantido à
mão e tem conteúdo que ninguém quer perder. **Não remova o `AGENTS.md`.**

## Sem `@vitejs/plugin-react`

A Fase 1 não tem teste de componente: os testes de domínio rodam em `environment: 'node'` e
os de UI são Playwright. O plugin entra quando o primeiro teste de componente existir.

## A sobra de centavos vai sempre para o mesmo membro

Em `ratear`, o resto da divisão vai para o **primeiro** peso da lista. Nunca alternando.

Alternar seria "mais justo" em tese e tornaria o resultado dependente do histórico, portanto
impossível de conferir na mão. Numa ferramenta que existe para o casal confiar nos números,
poder refazer a conta no papel vale mais do que um centavo de simetria.

Quem é esse "primeiro" é **escolha explícita, marcada no membro** — o campo
`Membro.absorveSobra` — e não mais um acidente da ordem em que o seed criou os registros.
Foi assim no começo (o primeiro peso vinha ordenado por `criadoEm`), até o casal pedir que
fosse sempre o Nick e pudesse ser trocado depois sem mexer em código.

**Onde:** `prisma/schema.prisma` define o campo, `default(false)`. Exatamente um membro deve
ter `true` — não é imposto pelo schema, é uma invariante de dado, conferida a mão. A leitura,
em `src/server/repositorios/resumo.ts`, ordena os rateios com `absorveSobra: 'desc'` primeiro
e `criadoEm: 'asc'` como desempate — o desempate existe para o dia (que não deveria acontecer)
em que dois membros tiverem `true` ao mesmo tempo; sem ele a ordem volta a depender do
Postgres, que foi um bug já corrigido nesta base. `ratear`, no domínio, continua sem saber
nada disso: só usa a ordem da lista que recebe.

A ordem de **exibição** das colunas na grade e no resumo (`criadoEm asc`, em
`src/app/(app)/despesas/page.tsx` e `src/app/(app)/resumo/page.tsx`) é outra coisa e não muda
com isto — o casal não pediu para inverter quem aparece primeiro na tela.

Desde a Etapa 06 há tela para trocar quem absorve: `definirQuemAbsorveSobra`, na lista de
pessoas de Configurações. Ela é **transacional**, e isso não é zelo: sem a transação, uma
falha entre desmarcar os outros e marcar o novo deixaria zero ou dois membros com `true`, e a
sobra voltaria a depender do desempate por `criadoEm`.

## O rateio é calculado sobre o valor da parcela

Não sobre o valor do lançamento. Um parcelado de conjunto de R$ 303,03 em 3x rateia
R$ 101,01 por mês, não o total.

O banco guarda só os **percentuais** do rateio; o valor de cada cota é calculado na leitura,
por `ratear`, sobre o valor da parcela daquela competência. Errar isso deixa a linha
`METADE` errada por meses seguidos sem ninguém notar.

## A grade mostra parcela, nunca lançamento

É o que faz uma compra em 12x aparecer uma vez em cada um dos doze meses, com o valor da
parcela, em vez do valor cheio todo mês. Toda leitura da tela do mês parte de `Parcela`, com
`join` para o lançamento, nunca o contrário.

## Layout B primeiro, layout A na Fase 2

O casal pediu os dois layouts da tela do mês, alternáveis por preferência de cada pessoa. A
Fase 1 entrega só o **B**, de lista única.

Construir dois renderizadores de grade antes de alguém ter usado o sistema é pagar caro por
uma preferência que ninguém testou. Os dois continuam no escopo — só não no primeiro dia.

## Seções por pessoa não são o layout A

A entrada acima vai **parecer contrariada** pelo redesenho visual: a grade do mês passou a ter
cabeçalho de grupo por pessoa, com subtotal em cada seção, e isso lembra muito o layout A de
painéis lado a lado. Não é ele.

O que existe continua sendo **um renderizador só**, de lista única: `grade-lancamentos.tsx`
monta a tabela, e `secao-pessoa.tsx` desenha um grupo dentro dela — a mesma tabela, com
cabeçalhos no meio. Não há segundo componente de grade, não há seletor entre layouts, e a
tabela `Preferencia` continua sem existir no banco.

O agrupamento em si nem é da tela: `agrupar`, em `src/domain/agrupamento.ts`, devolve grupos
com subtotal e contagem, e o componente só desenha o que recebeu.

**O layout A, em painéis lado a lado, segue adiado**, pelo motivo original: é o segundo
renderizador, e ele custa caro antes de alguém ter usado o sistema. Ver a §2.1 da
[spec do redesenho](specs/2026-09-07-redesenho-visual-e-navegacao-design.md), que decidiu isso
explicitamente para o caso não ser reaberto por engano.

## O escuro não foi construído, e o `prefers-color-scheme` foi removido de propósito

O `globals.css` que veio do template do Next tinha um `@media (prefers-color-scheme: dark)`
trocando `--background` e `--foreground`. Ele foi **removido** (commit `8933f6f`), e a
ausência dele não é regressão — é a decisão.

O tema alvo desta camada é o **claro**. Os tokens nascem prontos para receber um bloco escuro
depois: cada cor é uma variável em `@theme`, e nenhum componente escreve cor literal. Mas o
bloco escuro não foi escrito, e Configurações não ganhou seletor de tema.

O motivo é que a preferência por pessoa depende da tabela `Preferencia`, que é de Fase 2. Um
tema escuro sem onde guardar a escolha — ou guardado só no navegador de um dos dois — é
meio-recurso, e meio-tema é pior que tema nenhum, porque cria a expectativa de que funciona.

Manter o `prefers-color-scheme` antigo junto dos tokens novos seria exatamente isso: um escuro
pela metade, herdado de um CSS de exemplo, decidindo sozinho a aparência do sistema conforme o
ajuste do sistema operacional de quem abrisse. **Não recoloque o bloco achando que sumiu sem
querer.** Ver §2.2 da [spec do redesenho](specs/2026-09-07-redesenho-visual-e-navegacao-design.md).

## A varredura de cor exige dígito, e o Tailwind é preso a `src/`

Duas coisas que parecem detalhe de configuração e têm o mesmo motivo: **manter honesta a
verificação que proíbe cor literal**. Nenhuma das duas foi decidida por opinião; as duas foram
medidas.

**A varredura exige o número da paleta.** A restrição global 1 do plano visual proíbe cor
literal, e a Etapa 07 a verifica por `grep`. A versão antiga do comando era
`grep -rn "neutral-\|zinc-\|gray-\|slate-\|stone-"`, sem exigir dígito depois do hífen — e
`slate-` **casa dentro de `translate-`**. As primitivas do shadcn usam `translate-x-*` e
`translate-y-*` à vontade, então a varredura voltava cheia de falso positivo **com o código
limpo**. Medido hoje, em `966a6a0`: a versão antiga acha **11 ocorrências, todas `slate-`,
em 4 arquivos** (`ui/alert-dialog.tsx`, `ui/button.tsx`, `ui/select.tsx`, `ui/switch.tsx`) —
todas dentro de `translate-`. A versão de hoje, no mesmo código, volta **vazia**. A versão
corrigida é `-E` com
`(neutral|zinc|...)-[0-9]{2,3}`, e a lista de cores foi completada: a antiga não olhava para
`red-700` nem `amber-700`, que existiam no código da Fase 1.

Uma verificação que grita sempre é pior que nenhuma — ensina quem a roda a ignorá-la.

**O `globals.css` importa o Tailwind com escopo:** `@import "tailwindcss" source("../")`, onde
`../` é `src/`. Sem isso, a detecção automática de classes varre o projeto inteiro a partir da
raiz, **inclusive `docs/`** — e os documentos do plano *citam* cor literal justamente para
proibi-la, além de `plans/fase-1/04-telas.md` guardar o código antigo por inteiro. O texto que
proibia a cor literal era o que a injetava no bundle.

**Medido por diff dos dois CSS compilados** (commit `6a9c8cb`): saíam **21 seletores**, entrava
nenhum, e os 21 tinham **zero uso em `src/`**, conferidos um a um. Entre eles `bg-zinc-900`,
`bg-neutral-900`, `bg-neutral-50`, `border-neutral-300`, `text-neutral-500` e
`text-neutral-600`.

Enquanto durasse, "essa classe está no CSS?" não servia de teste da varredura de cor — que é
justamente o teste que a Etapa 07 existe para ter. Nada fora de `src/` tem classe do Tailwind:
`public/` só tem SVG, e `e2e/` e `scripts/` são código sem tela.

## Commits durante execução de plano

A regra geral do projeto é não commitar sem consultar o usuário. Durante a execução de um
plano, **em branch de trabalho**, os subagentes commitam livremente: o processo de revisão
compara faixas de commit e o registro de progresso guarda os hashes.

A consulta continua obrigatória para `main` e para qualquer `push`. O commit que o usuário
revisa é o merge.

## O reembolso sai do gasto e fica na fatura, numa linha própria

**Onde:** `ResumoMes.reembolso` em `src/domain/totais.ts`, a banda *Resultado* em
`matriz-resumo.tsx`, e `statusReembolso` em `prisma/schema.prisma`.

A regra sempre disse as duas coisas (`regras-de-negocio.md`, seção 6): reembolso **entra na
fatura**, porque o dinheiro saiu da conta e ignorar isso quebraria a conferência contra o
extrato; e **sai do gasto do casal**, porque não é gasto deles. O cálculo não fazia nem um
nem outro — `ParcelaResumo` não tinha campo de reembolso, então `calcularResumo` não tinha
como saber. O selo existia só na grade, decorativo.

Cumprir a regra **quebra a identidade contábil herdada da planilha**. Na planilha o `SOMADO`
fechava com a soma dos `TOTAL GERAL`, porque lá não havia reembolso em lugar nenhum. Aqui a
identidade passa a ser:

```
somado = soma dos totalGeral + soma dos reembolso
```

Foi escolha explícita do usuário entre duas opções: linha nova no Resumo, ou deixar o Resumo
como está e excluir reembolso só nos Gráficos quando existirem. **Escolheu a linha nova** — a
alternativa deixaria a mesma pergunta respondida de dois jeitos em duas telas.

As linhas *A receber* aparecem só no mês que tem reembolso, e em bloco. É a única exceção à
regra de que a matriz mostra toda linha com travessão quando zero, e tem motivo: sem
reembolso o `Somado` fecha com a soma dos *Cabe a*, e duas linhas vazias permanentes
sugeririam uma lacuna inexistente.

### O status é por lançamento, não por parcela

A seção 6 descrevia status **por parcela**, marcado `[a confirmar]`, com o argumento de um
parcelado que a pessoa devolve mês a mês. O schema sempre teve `statusReembolso` em
`Lancamento`. **O usuário confirmou por lançamento**, e a regra se ajustou ao schema em vez do
contrário — não há migration aqui.

Consequência aceita: um reembolso parcelado é reembolso em **todas** as parcelas dele, de uma
vez. Não há como marcar recebida a parcela 3 e pendente a 4. Se um dia isso incomodar, é
migration de `statusReembolso` para `Parcela`, e aí a leitura em `carregarParcelasDaCompetencia`
passa a vir da parcela e não do lançamento.

Qualquer status tira do gasto, `PENDENTE` ou `RECEBIDO`. Receber não transforma a despesa em
gasto do casal: só encerra a cobrança.

## Travar fatura exige o extrato preenchido

**Onde:** `travarFatura` em `src/server/repositorios/fatura.ts`, e o botão desabilitado em
`trava-fatura.tsx`.

Travar significa **"conferi este mês contra o extrato e fechei"** — não "não quero mais mexer
aqui". Sem o valor do extrato registrado, `travarFatura` recusa com `SEM_EXTRATO` e o botão
nem habilita, explicando por quê no `title`.

Deixar travar sem conferir permitiria congelar um mês com erro dentro, e aí destravar viraria
rotina em vez de exceção — o que esvazia a trava. Foi escolha explícita do usuário entre as
duas opções.

Os **dois** gestos pedem confirmação, não só o destravar. O invariante 5 exige explicitude ao
destravar; travar também é consequente, porque deixa o mês inteiro somente-leitura, e descobrir
isso por acidente ao tentar lançar é pior que um diálogo a mais.

## `CONFERIDA` é automática, e desfeita quando o valor muda

**Onde:** `statusPeloExtrato` em `src/server/repositorios/fatura.ts`.

O enum `StatusFatura` sempre teve `ABERTA`, `CONFERIDA` e `TRAVADA`, e **nada escrevia
`CONFERIDA`** — ela só chegaria por SQL. O enum mentia sobre o que o sistema fazia.

Agora `registrarValorReal` grava o status junto com o valor, na mesma transação: `CONFERIDA`
quando `conferir()` diz `BATE`, `ABERTA` quando não. O ponto que não é óbvio é o **desfazer**:
corrigir o extrato para um número que não bate tem que voltar para `ABERTA`, senão a fatura
fica marcada como conferida exibindo uma diferença — dois fatos contraditórios na mesma faixa.

`TRAVADA` nunca sai daí: travar é gesto humano, e é a única das três que uma pessoa escolhe.

Por isso `destravarFatura` **não** volta para `ABERTA` por decreto — recalcula. Um mês que
batia continua `CONFERIDA` depois de reaberto, porque continua batendo.

O somado usado na comparação é calculado **no servidor** (`somadoDaConta`), nunca recebido da
tela: quem confere e quem grava têm que somar do mesmo lugar.

## O membro que travou vem da sessão, não da tela

**Onde:** `src/server/membro-da-sessao.ts`, usado pelas actions de travar e destravar.

O vínculo entre a identidade do Google e o `Membro` do sistema é o e-mail — `Membro.email` é
único no schema e o seed já gravou os dois da allowlist. A action resolve isso no servidor e
passa o id adiante; **a tela não envia quem é**, porque o cliente não deve poder afirmar que
foi outra pessoa que fechou o mês.

Devolve `null` em vez de lançar quando não acha o membro. Travar não deve falhar por não saber
de quem foi o gesto: a trava vale, e a auditoria fica sem o nome.

## A tabela `Auditoria` começou a ser usada por travar e destravar

**Onde:** `auditar` em `src/server/repositorios/fatura.ts`.

A tabela existia desde a primeira migration e **nada escrevia nela**. O invariante 5 diz que
destravar é "ação explícita e auditada", e a auditoria era a metade que faltava.

Grava `tabela`, `registroId`, `acao` (`TRAVAR`/`DESTRAVAR`), `membroId` e um `diff` com o
status de origem, o de destino e o valor do extrato no momento. Fica na mesma transação da
mudança de status: auditoria que pode faltar quando a escrita deu certo não serve de auditoria.

**Escopo deliberadamente estreito:** só fatura. Não foi construído um helper genérico de
auditoria para todas as tabelas — seria inventar requisito. Quem precisar auditar lançamento
depois segue esta forma.

## Os testes de banco rodam em série, e isso não é desperdício

**Onde:** `--no-file-parallelism`, assado em `scripts/testar-banco.mjs`.

O Vitest roda **arquivos** em paralelo, e os três arquivos de teste de banco compartilham um
banco só. O `limpar()` de `lancamento.test.ts` faz `deleteMany()` em lançamento, parcela,
rateio e fatura — enquanto `resumo.test.ts`, noutro worker, está no meio de um caso.

Não é teoria. Na **primeira** execução da suíte, 2 de 130 falharam:

- uma leitura devolvendo *"No record was found"* logo depois de uma gravação que havia
  retornado `ok`;
- a sobra de centavos indo para o membro **errado**.

As duas pareciam bug grave e gastaram investigação. Em série, os mesmos 130 passam.

Onze segundos em série custam menos que uma tarde atrás de um bug que não existe. **Trocar por
paralelismo exige dar a cada arquivo o seu próprio banco** — no Neon isso é uma branch por
arquivo, e aí volta a valer a pena. Antes disso, não.

## A suíte de banco lê `DATABASE_URL_TESTE`, nunca a `DATABASE_URL`

**Onde:** `scripts/testar-banco.mjs`, e a chave nova no `.env` e no `.env.example`.

Antes, ligar os testes de banco era exportar `TESTE_DESTRUTIVO=1` e trocar a `DATABASE_URL` na
mão. A suíte apaga todo lançamento que encontra, e errar essa variável apagava a finança real
do casal. A guarda que existia — recusar banco que já tem lançamento — protege o **conteúdo**;
nada protegia o **endereço**.

O runner inverte isso: lê `DATABASE_URL_TESTE`, **ignora** a `DATABASE_URL` de verdade, recusa
rodar se a variável de teste não existir (em vez de cair num padrão), e recusa rodar se as duas
apontarem para o mesmo endpoint do Neon. As três recusas foram verificadas com `.env` falso num
diretório temporário.

As duas guardas erram de formas diferentes, então as duas ficam.

Sem dependência nova: `dotenv` e `cross-env` não estão no projeto, e ler uma chave de um arquivo
de texto não justifica instalar nada. O runner também **não** usa `npx` com `shell: true` —
monta o caminho do `vitest.mjs` e chama com o próprio Node. O Node avisa (DEP0190) que
argumento passado com shell não é escapado, e aqui chegam argumentos da linha de comando.

**Branch do Neon nasce como cópia do pai**, então a de teste vem com os dados reais dentro. Os
lançamentos têm de ser apagados dela antes do primeiro uso; categorias, membros e contas ficam,
porque a suíte os lê como fixture pelo `findFirstOrThrow`.
