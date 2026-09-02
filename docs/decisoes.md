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
`src/app/despesas/page.tsx` e `src/app/resumo/page.tsx`) é outra coisa e não muda com isto —
o casal não pediu para inverter quem aparece primeiro na tela.

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

## Commits durante execução de plano

A regra geral do projeto é não commitar sem consultar o usuário. Durante a execução de um
plano, **em branch de trabalho**, os subagentes commitam livremente: o processo de revisão
compara faixas de commit e o registro de progresso guarda os hashes.

A consulta continua obrigatória para `main` e para qualquer `push`. O commit que o usuário
revisa é o merge.
