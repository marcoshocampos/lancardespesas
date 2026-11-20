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

## O tema escuro guarda a escolha num COOKIE, não no `localStorage`

**Esta seção substitui a decisão anterior, que era não construir o escuro.** O argumento de lá
continua registrado logo abaixo, porque explica por que o botão tem três estados.

A escolha mora em cookie por um motivo que custou uma implementação inteira: **o servidor
consegue ler cookie**, e com isso renderiza `data-tema` já no HTML.

O caminho comum — guardar no `localStorage` e aplicar por script inline antes da primeira
pintura — **foi construído e descartado**. Ele resolve o lampejo de tema errado, mas o atributo
aparece no `<html>` antes de o React hidratar e o HTML do servidor não o tem: erro de
hidratação no console a cada carregamento. **`suppressHydrationWarning` no `<html>` não
suprime esse caso no Next 16** — testado, com o servidor reiniciado, e o erro continuou.

Com cookie não há divergência a suprimir nem script a correr antes da pintura. O custo é que
ler cookie torna o layout raiz dinâmico, e `/entrar` deixa de ser pré-renderizado — irrelevante
num sistema em que todo o resto já é dinâmico por depender de sessão.

O contrato mínimo entre servidor e cliente mora em `casco/tema-compartilhado.ts`, sem
`'use client'`: `layout.tsx` é componente de servidor e não pode importar de módulo de
cliente, e duplicar o nome do cookie convidaria as duas pontas a divergir em silêncio.

### Três estados, e por que o antigo argumento continua valendo

O botão cicla **sistema → claro → escuro**. Com dois estados, "voltar a seguir o sistema"
sumiria no primeiro clique.

E seguir o sistema importa porque a escolha forçada é **por aparelho e por navegador**: o
celular e o notebook guardam cookies separados. Guardar por pessoa exige a tabela
`Preferencia`, que é de Fase 2 — a mesma que segura o layout A da grade.

Era esse o argumento original para não construir nada: *"um tema escuro sem onde guardar a
escolha é meio-recurso, e meio-tema é pior que tema nenhum, porque cria a expectativa de que
funciona"*. Ele foi respeitado, não ignorado: **o padrão que funciona em qualquer aparelho é
seguir o sistema**, e o forçado é uma sobreposição local, não uma preferência que promete
seguir a pessoa. Quando `Preferencia` existir, o cookie vira o atalho e o banco vira a verdade.

### O `@media (prefers-color-scheme: dark)` do template continua removido

O bloco que veio do Next trocava `--background` e `--foreground`, variáveis que não existem
mais. A remoção (`8933f6f`) segue valendo — o escuro de hoje é escrito sobre os tokens da casa,
com paleta **quente** combinando com a clara e com os semânticos refeitos, porque verde e
vermelho de fundo claro perdem contraste no escuro.

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

### Ser reembolso é do lançamento; ter sido devolvido é da parcela

**Onde:** `Parcela.reembolsoRecebido`, `marcarReembolso` e `gravarFilhos` em
`repositorios/lancamento.ts`, e `carregarReembolsosDaCompetencia`.

Foi por lançamento até 2026-11-17. A seção 6 já pedia **por parcela**, pelo argumento de um
parcelado devolvido mês a mês, mas o schema tinha `statusReembolso` só em `Lancamento`, e o
usuário aceitou a consequência: não havia como marcar recebida a parcela 3 e pendente a 4. **No
uso, incomodou** — marcar outubro como recebido marcava novembro junto, e desmarcar um
desmarcava todos. A migration `reembolso_recebido_por_parcela` levou a marca para a parcela.

Ficaram duas coisas em dois lugares, e de propósito:

- **Ser reembolso** é do lançamento (`statusReembolso` não nulo): é da compra, vale para todas
  as parcelas, e é o que tira o valor do gasto do casal.
- **Já ter sido devolvido** é da parcela (`reembolsoRecebido`): é de cada mês.

**`RECEBIDO` continua no enum, e nada o grava nem lê.** A migration passou todo lançamento
`RECEBIDO` para `PENDENTE`, depois de marcar recebidas todas as parcelas dele — o que a tela já
mostrava. Tirar o valor do enum, ou trocar a coluna por um booleano `ehReembolso`, seria a
forma limpa, e não foi feito pela ordem do deploy: a migration vai para o banco **antes** do
código (armadilha 23), e o código ainda no ar lê e grava `statusReembolso` com os dois valores.
Uma migration que mexesse no que ele usa o derrubaria na janela entre as duas coisas. Esta só
acrescenta uma coluna, e o código velho segue funcionando até o novo entrar. Se um dia valer a
limpeza, é migration própria, com o código que já não usa `RECEBIDO` no ar antes dela.

**O lock continua sendo o do lançamento.** Marcar a parcela de novembro gasta a versão do
lançamento, e quem estiver com outubro aberto numa versão velha recebe conflito. É raro — o
mesmo lançamento aparece uma vez por mês —, e é o que o invariante 7 pede de toda gravação de
lançamento.

**A edição preserva o recebido pelo número da parcela**, como já preservava o cancelamento:
`gravarFilhos` recria as parcelas do zero, e sem isso corrigir a descrição faria quem já
devolveu voltar a dever. Desligar a marca de reembolso apaga o recebido junto, como apaga o
devedor.

Ser reembolso tira do gasto, devolvida a parcela ou não. Receber não transforma a despesa em
gasto do casal: só encerra a cobrança daquele mês.

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

## O seletor de categoria é controlado, e só ele

**Onde:** `categoriaId` em `painel-lancamento.tsx`.

Todos os campos do painel são **não controlados** (`defaultValue` + leitura do `FormData` no
envio), por um motivo medido e registrado no próprio arquivo: com campo controlado ou com
`action={}`, o React 19 devolve o campo ao valor do estado quando a transição termina, e a
pessoa perde o que digitou justamente nas recusas — `CONFLITO` e `FATURA_TRAVADA` — em que a
tela manda tentar de novo.

A categoria é a exceção porque **ligar a marca de terceiros a preenche com "Terceiros"**, e
campo não controlado não aceita ser preenchido de fora: `defaultValue` só vale na montagem.

O custo não se aplica aqui: o estado **é** a verdade para esse campo, então não há valor
digitado a perder. Preenche, não trava — o remédio comprado para a tia pode ficar em Medicação
e continuar sendo reembolso.

**Não transforme os outros campos em controlados "para ficar consistente".** A inconsistência é
deliberada e o motivo de cada lado está escrito onde ele vale.

## Criar lançamento não apaga filho que não existe

**Onde:** o parâmetro `recemCriado` de `gravarFilhos`, em `repositorios/lancamento.ts`.

`gravarFilhos` serve criar e editar. Na edição ele precisa ler as parcelas canceladas, apagar
as parcelas velhas e apagar os rateios velhos. Na criação **nada disso encontra coisa alguma**:
o lançamento nasceu na linha de cima, dentro da mesma transação.

Eram três consultas sem efeito, mais uma quarta: `competenciaBaseDe` lia a conta no banco duas
vezes por gravação — uma na checagem de fatura travada, outra dentro do `gravarFilhos`. A
`competenciaBase` agora é lida uma vez e passada adiante, e `competenciasDe` virou função pura
de quebra.

Medido contra o banco de teste, com o log de consultas do Prisma:

| | consultas antes | consultas depois |
|---|---|---|
| criar à vista | 10 | **6** |
| criar 12x conjunto | 12 | **8** |
| editar | 14 | 13 |

Cada ida ao Neon custa algo em torno de 45 ms, então a conta fecha. **A edição quase não
melhora, e está certo:** ela precisa mesmo de quase tudo que faz.

**O risco está no sentido contrário:** passar `recemCriado: true` para um lançamento que já
existe duplica parcela, porque o `createMany` roda sem o `deleteMany` antes. Só
`criarLancamento` pode passar `true`, e só porque criou o registro na transação corrente. Os
testes de banco do caminho de gravação são a rede — rode `npm run test:banco` antes de mexer
aqui.

## A seção "A receber" não guarda data, e não atravessa meses

**Onde:** `secao-a-receber.tsx` e `carregarReembolsosDaCompetencia`.

A regra de negócio dizia que marcar como recebido **registra a data**, e o schema nunca teve
onde. Seria uma migration.

**O usuário decidiu que não:** *"dívidas são mais para visualização do que para cálculos, então
dívidas em aberto são apenas informações, não precisam persistir para meses seguintes"*. Uma
dívida de agosto que ninguém pagou **não** reaparece em outubro.

Isso derruba a utilidade da data junto: o mês já é o contexto, e a lista sai de vista quando se
vira a página. A regra foi ajustada ao sistema, como em "editar uma parcela".

Também derruba o que era a parte difícil: **seria a primeira consulta do sistema a atravessar
meses.** Toda leitura hoje é por competência, e uma lista corrente de pendências exigiria outra
forma de consulta, outra tela e outro lugar na navegação. Nada disso foi construído, e a razão
está aqui para não parecer esquecimento.

**Por que no Resumo e não em tela própria:** o total já está na matriz, na linha *A receber por
‹pessoa›*. A lista explica aquele número, e os dois ficam a um palmo um do outro. Uma entrada
na barra lateral para uma lista de duas ou três linhas por mês seria navegação sem conteúdo.

**Marcar como recebido não altera número nenhum** — pendente ou recebido, o valor está fora do
gasto do casal e dentro do `Somado`. Quem for mexer no cálculo por causa desta marca está
resolvendo um problema que não existe.

## A lixeira não esvazia, e isso foi escolhido

**Onde:** `carregarLixeira` em `repositorios/lixeira.ts` — e na ausência de qualquer função que
apague de verdade.

O invariante 6 diz *"nada é apagado de verdade"*. Levado ao pé da letra, a lixeira só cresce:
um lançamento duplicado, criado e excluído no mesmo minuto, fica lá para sempre no meio das
exclusões que importam.

As três saídas foram postas ao usuário: manter fiel ao invariante; apagar de vez com
confirmação, reescrevendo o invariante; ou expirar sozinho depois de um prazo. **Escolheu
manter fiel**, pelo motivo certo: a lixeira está vazia, eles excluem pouco, e a poluição é um
problema que ainda não existe.

**Não construa apagar definitivo nem expiração automática sem a palavra dele.** Quando a lista
incomodar, a escolha entre as outras duas vai ser informada pelo que estiver lá dentro — e o
remédio é um limite na listagem antes de ser apagar o que pediram para guardar.

Sem paginação pela mesma razão. Duas pessoas excluindo lançamento não produzem uma lista que
precise dela tão cedo, e paginar uma lista vazia é código a manter sem nada a mostrar.

## Criar conta escolhe o `tipo`; editar nunca o toca

**Onde:** `criarConta` em `repositorios/configuracao.ts`, e `acaoCriarConta` nas actions.

`editarConta` deixa `tipo` de fora de propósito, e o motivo está no comentário dela: trocar o
tipo de uma conta que já tem fatura conferida não é edição, é migração de dado. **Criar é o
único momento em que essa escolha acontece pela tela**, e o formulário diz isso em voz alta.

Daí sai uma exceção que parece contradição e não é. `acaoEditarConta` lê o `tipo` **do banco**,
nunca do cliente — validar contra um tipo enviado por quem manda os dados deixaria essa pessoa
escolher a regra que a julga. Na criação **não há linha no banco para consultar**: a escolha do
tipo *é* o conteúdo da operação, e não existe verdade anterior a proteger. O `z.enum` fecha o
conjunto de valores, que é a garantia que sobra.

**A regra do cartão roda pela mesma função nas duas telas** (`esquemaDeConta`), para a exigência
de dia de fechamento e vencimento nunca divergir entre criar e editar. Na tela, os dois campos
saíram para um `CamposDeCartao` partilhado pelo mesmo motivo: um `required` corrigido só de um
lado deixaria o outro mandando payload que o servidor rejeita.

`ordem` sai de `max(ordem) + 1`. Conta nova entrando no meio empurraria as colunas do Resumo de
lugar sem ninguém ter pedido.

Conta externa **nunca guarda dia**, mesmo que o formulário mande um. O schema aceita, e um dia
pendurado numa conta sem fatura viraria lixo que alguém leria como regra depois.

## Desativar pessoa não será construído

**Decisão do usuário, 2026-10-14.** Saiu da lista de ausências do `estado.md`.

A armadilha 12 de [`arquitetura.md`](arquitetura.md) continua descrevendo três pontos do código
que se comportam mal com membro desconhecido — `calcularResumo`, `escopoPadrao` no painel, e as
páginas que carregam membro com `where: { ativo: true }`. Ela deixou de ser um alerta para quem
for construir e passou a ser a explicação de **por que não construir**: os três precisariam ser
consertados juntos, e nenhum é alcançável enquanto a tela não existir.

`Membro.ativo` segue no schema como rótulo na lista de Configurações, sem efeito.

## A tela de resolução de conflito não será construída

**Decisão do usuário, 2026-10-19.** O casal lança junto, na mesma mesa, então dois navegadores
editando o mesmo lançamento ao mesmo tempo não é uma situação que eles vivam.

**O lock otimista continua e não é opcional** — é o invariante 7, e protege contra o caso em
que alguém deixa uma aba aberta e volta nela horas depois. O que não será construído é a
*tela* que compara campo a campo e oferece resolver.

O que existe hoje basta para esse uso: a recusa aparece, o que foi digitado **não se perde**
(ver a nota sobre `action={}` do React 19 em `painel-lancamento.tsx`), e uma linha mostra o
estado gravado — descrição e valor. Sair do impasse é recarregar a página.

Se um dia virar problema, a forma estava desenhada: dois botões, *manter o meu* — que grava
por cima com a versão nova — e *usar o que está gravado*. Sobrescrever depois de ver o que a
outra pessoa gravou não viola o invariante 7, que proíbe a sobrescrita **silenciosa**.

## Os gráficos: três, e por que não os quatro da spec

**Onde:** `src/domain/graficos.ts`, `components/graficos/`, `/graficos`.

A spec original esboçou quatro — ranking de categorias, categoria em rosca, evolução mensal e
projeção futura. **A rosca saiu**, por decisão do usuário: mostra exatamente o mesmo dado do
ranking, e rosca com treze categorias é ilegível. Duas formas para uma pergunta é desperdício.

Saiu também por um motivo que só apareceu ao validar a paleta, abaixo.

### A evolução mensal é empilhada para não mentir

Uma linha única desenharia uma montanha: sobe até setembro de 2026 e desce depois. **As duas
metades são artefato.** A subida é parcela retroativa — o casal só começou a lançar em
setembro, e o que existe antes é reconstrução feita pela importação. A descida é parcelado
terminando, não gasto diminuindo.

Empilhar **compras novas** (parcela de número 1) sobre **parcelas de compras anteriores**
resolve sem texto explicativo: um mês feito só de compromisso antigo aparece com a faixa de
novas vazia, e diz sozinho o que é.

**Não troque por uma linha única nem por uma série só** achando que simplifica. A separação é
a única coisa que torna este gráfico honesto com estes dados.

### A paleta das categorias reprovou no validador, e mesmo assim ficou

`scripts/validate_palette.js` do skill de dataviz reprovou as cores de categoria: `Casa Doce`
e `Beleza` têm ΔE 8,6 — pouco até para visão normal —, e `Jogo` e `Casa Doce` somem uma na
outra para daltonismo protan. Quatro cores lêem como cinza.

Ficaram assim mesmo por dois motivos. As cores são **dado do banco**, escolhidas pelo casal em
Configurações, e são as mesmas que a grade usa na bolinha de categoria — trocá-las no gráfico
quebraria a correspondência entre as telas. E no ranking a cor é **reforço, não identidade**:
cada barra leva o nome ao lado e o valor na ponta.

**Numa rosca isso teria sido grave**, porque lá a cor é a única identidade. Foi o segundo
motivo para a rosca sair.

Se incomodar, o conserto é no banco, não no código: trocar a cor de `Casa Doce` em
Configurações resolve os dois pares de uma vez.

### As cores das séries são token, não literal

`--color-grafico-novas` e `--color-grafico-anteriores`, definidas no claro e nos dois blocos
escuros do `globals.css`. O Recharts recebe `var(--color-grafico-novas)`, que o SVG resolve em
tempo de execução — então o tema escuro vem de graça pelo mecanismo que já existia, sem
JavaScript lendo tema.

O par passou em separação para daltonismo (ΔE 16 protan) e para visão normal (ΔE 22,8).
**Reprovou no piso de croma**, e isso é deliberado: a paleta desta casa é dessaturada desde o
redesenho, e um gráfico vivo sobre uma interface apagada pareceria colado de outro lugar.

## Recorrente vira lançamento por clique, não por abrir o mês

**Onde:** `faixa-recorrentes.tsx`, `lancarRecorrentes` em `repositorios/recorrente.ts`.

A regra de negócio propunha gerar os lançamentos "na primeira vez que alguém abre aquele mês",
sem agendamento de servidor. A intenção era boa — menos peça móvel —, mas o mecanismo não
existe do jeito que a frase sugere.

**Para o Next, renderizar a página não é o mesmo que alguém abri-la.** A página é renderizada de
novo depois de cada gravação (`revalidatePath`), e o `<Link>` pode renderizar adiantado a página
de um mês que ninguém clicou. Gravar durante a renderização transformaria "passar o mouse na seta
de mês anterior" em "lançar as recorrentes de outubro". É o lançamento fantasma que a regra queria
evitar, entrando por outra porta.

A alternativa automática de verdade — disparar do navegador quando a tela já abriu — também foi
posta ao usuário e descartada: a tela abriria sem as recorrentes e elas apareceriam um instante
depois, e consultar um mês antigo passaria a gravar coisa nele.

**Escolha do usuário: uma faixa com um clique.** O casal lança junto, e o clique vira parte do
ritual; a faixa ainda serve de lembrete do que é fixo no mês. Em sistema de dinheiro, "apareceu
sozinho" é pior de explicar do que "eu cliquei".

**Não construa geração automática na renderização da página**, nem em `useEffect` sem a palavra
do usuário. A página do Despesas só **lê** as pendentes.

### A trava contra duplicata é o índice, não a triagem

`Lancamento` ganhou `recorrenteId` e `competenciaRecorrente`, e o par tem índice único. A triagem
evita oferecer o que já foi feito; o índice segura dois cliques no mesmo instante, quando as duas
triagens ainda viam a recorrente como pendente. A segunda gravação bate no índice e conta como
pulada, não como erro.

O par vai no **mesmo `create`** do lançamento, nunca num update depois — entre os dois passos o
lançamento existiria sem marca e um segundo clique o geraria de novo.

A busca de "já gerada" **não filtra `deletadoEm`**, de propósito: é assim que excluir o
lançamento gerado vira "pular este mês". O Postgres trata `NULL` como distinto em índice único,
então lançamento comum não é afetado.

### Uma transação por recorrente, e não uma em volta de todas

Se a quinta de oito falhar, as quatro primeiras ficam e as outras continuam pendentes — a faixa
reaparece com o que sobrou. Tudo-ou-nada só desfaria trabalho bom por causa de um problema alheio
a ele.

### A data é conferida contra a regra de competência

`dataDaRecorrente` inverte `competenciaDeCartao` e confere o resultado com ela antes de devolver.
Editar um lançamento recalcula a competência a partir da data, sem competência manual; uma data
que não a reproduza faria o lançamento **mudar de mês sozinho** na primeira edição — a família da
armadilha 1. Há teste que varre 36 meses × 31 fechamentos × 31 dias.

### Sem data de fim

A spec previa `dataFim`. Encerrar virou desativar, igual às contas: data de fim é campo a mais
para algo que quase nunca se sabe de antemão.

## A busca: em memória, no Despesas, e sem categoria no texto

**Em memória, não no Postgres.** `ILIKE` e o `mode: 'insensitive'` do Prisma ignoram caixa e
não ignoram acento — `farmacia` não acharia *Farmácia*, e é assim que se digita com pressa. A
extensão `unaccent` resolveria, ao custo de migration, extensão no Neon e um índice a manter,
para duas pessoas. Carregar os lançamentos fora da lixeira e filtrar com `src/domain/busca.ts`
resolve o acento sem nada disso, e deixa cada caso de borda testável sem banco. O volume
sustenta: ~600 lançamentos por ano. Quando pesar, pré-filtre no banco antes de normalizar — não
troque a regra.

**No Despesas, não numa tela própria.** Foi o primeiro desenho, e o usuário trocou: o uso que
motiva a busca — ver um valor no extrato e procurar se já foi lançado — acontece com o Despesas
aberto. Custou um estado a mais na página (com termo, os resultados tomam o lugar de
recorrentes, chips e grade) e poupou um destino na barra lateral e uma troca de tela no clique.

**Categoria fora do texto pesquisado.** Buscar `mercado` acha a compra descrita como mercado,
não toda compra da categoria Mercado. A pergunta "quanto foi em Mercado" tem resposta melhor no
ranking dos Gráficos, e misturar as duas transformaria toda busca por uma palavra comum numa
lista de centenas.

**A guarda de forma de valor.** `reaisParaCentavos` descarta tudo o que não é dígito antes de
ler, o que é certo no campo de valor do painel. Na busca seria errado: `uber 89` viraria
R$ 89,00. Por isso o termo só é lido como valor se tiver forma de valor, e nada mais. Não
"simplifique" chamando o parser direto.

## Dividir o lançamento, e não guardar atributo por parcela

**Onde:** `Lancamento.parcelaInicial` e `parcelaFinal`, `src/domain/divisao.ts` e `separar`, em
`repositorios/lancamento.ts`. Spec: [`2026-11-19-trava-por-parcela-design.md`](specs/2026-11-19-trava-por-parcela-design.md).

Mudar a categoria só de dezembro, com novembro intacto, pede que os dois meses de um mesmo
parcelado tenham campos diferentes. Descrição, categoria, pessoa, conta e rateio moram no
**lançamento**. Havia dois caminhos: descer esses campos para a parcela, ou dividir o lançamento
em pedaços.

**Descer para a parcela muda toda leitura.** Resumo, fatura, gráficos, recorrentes e a
projeção leem a parcela e juntam o lançamento por cima; cada uma passaria a ler o campo de outro
lugar, e o rateio — que é do lançamento por decisão — teria de ser refeito por parcela.
**Dividir não muda nenhuma leitura:** os pedaços são lançamentos comuns, as parcelas continuam
as mesmas linhas, e tudo o que somava parcela continua somando igual.

**O custo aceito é a fragmentação.** Uma compra pode virar dois ou três lançamentos. No mês
continua uma linha só, porque as faixas não se sobrepõem; **a busca e a lixeira mostram os
pedaços**, cada um com *"parcelas 4 a 12 de 12"*. Não há `compraId` ligando os pedaços, e fica
assim: se incomodar, a ligação é uma coluna a mais, sem mudar o resto.

**Não desfaça isso para "juntar de volta".** Os pedaços têm campos diferentes de propósito —
esse foi o pedido.

## A Fatura começa no mês da tela, e não pela data

**Onde:** o campo Fatura de `painel-lancamento.tsx` e `competenciaBaseDaFatura`.

A competência de um lançamento novo saía da data da compra. Quem lança está **conferindo a
fatura daquele mês**, e a compra de 3/11 que só apareceu na fatura de dezembro é o caso típico:
pela data ela cai em novembro, que está travado, e o sistema recusava o lançamento de quem tinha
a fatura de dezembro aberta na frente. Com o campo, o mês da tela é o padrão, e quem lança em
dezembro lança em dezembro.

**A data continua útil, como aviso.** Se pela data a compra cairia em outro mês, o painel diz
*"Pela data, cairia em janeiro de 2027"* e deixa enviar. A comparação é entre competências
**base** (`Fatura − (k − 1)`), para que a parcela 9 de uma compra de abril, lançada em dezembro,
não acuse uma diferença que não existe.

**Recorrentes e importador não ganharam o campo.** Eles não têm uma tela de fatura aberta; a data
continua sendo a única fonte, e `dataDaRecorrente` a confere contra a regra de competência.

## Linha movida não passa pela barreira

**Onde:** `separar`, em `repositorios/lancamento.ts`.

Em *só esta* no meio da faixa, as parcelas de depois vão para um lançamento novo. **Mover troca só
o `lancamentoId`:** valor, número, competência e todo campo que a tela exibe ficam como estavam.
Nada do que a fatura mostra muda.

Passá-las pela barreira de trava seria barrar uma operação que não toca o que a trava protege —
e impediria justamente o caso comum, *só esta* num mês aberto entre dois meses travados, sem
proteger coisa alguma. A barreira confere as linhas **apagadas e gravadas**: as do alcance, antes
e depois, e na exclusão as que saem dos meses. Linha movida e linha do pedaço *antes* não entram.

**Se um dia a linha movida passar a mudar algo que a fatura mostra** — o valor, a competência, a
conta —, ela deixa de ser só movida e precisa passar pela barreira. Os testes de banco que
conferem `id` e valor das linhas de *depois* são o aviso.

## Só o pedaço que chega à última parcela muda o total

**Onde:** `limitesDeParcelas` e `faixaEscrita`, em `src/domain/divisao.ts`; o campo Parcelas de
`painel-lancamento.tsx`; a recusa `TOTAL_INVALIDO` de `editarLancamento`.

Parece restrição demais: por que não deixar baixar o total de `[1 .. 9]` de 12 depois de
excluir da 10 em diante? Porque as parcelas 10 a 12 **continuam existindo**, num lançamento na
lixeira, e o mesmo vale para o pedaço de antes de uma divisão, cujas seguintes estão num
lançamento vivo. Não há `compraId` ligando os pedaços; o que diz onde cada um termina é a
faixa, e `parcelaFinal` nulo quer dizer "até a última". Baixar o total até a ponta gravava esse
nulo, o pedaço passava a parecer o último, e subir o total de novo regerava parcelas do vizinho
— a mesma parcela em dois lançamentos, somada duas vezes na fatura, sem índice que pegue.

**Não afrouxe para "o total pode ir até a ponta deste pedaço".** Era exatamente essa a regra
de antes, e foi ela que deixou a sobreposição passar. Quem quer outro total muda pelo pedaço
que chega ao fim.

## Salvar sem mudar nada não divide

**Onde:** `semMudanca`, em `repositorios/lancamento.ts`.

Dividir não tem volta: não existe juntar pedaços (ver *Dividir o lançamento*, acima). Abrir
uma parcela do meio só para conferir e clicar Salvar deixava três lançamentos com os dados de
antes. Quando os campos que `camposGravaveis` escreveria, a faixa e as linhas são os de hoje, a
edição devolve `{ ok: true }` sem escrever e sem gastar a versão.

**A comparação vem antes da barreira de trava**, e isso foi escolhido: a trava recusa o que
apaga, grava ou muda parcela travada, e uma edição que não escreve não faz nenhum dos três.
**Em *todas* nada mudou:** ali não nasce pedaço, e regravar no lugar, com a versão subindo,
continua sendo o comportamento de sempre.

**A comparação percorre as chaves de `camposGravaveis`**, e não uma lista escrita à mão. Campo
novo que a tela passe a gravar entra nela sem ninguém lembrar; com a lista, um campo esquecido
faria a edição dele virar "nada mudou" e ser descartada em silêncio.
