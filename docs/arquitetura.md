# Arquitetura

Mapa do código por camadas, para quem vai mexer. Complementa os outros documentos:

| Documento | Responde |
|---|---|
| [`estado.md`](estado.md) | Onde paramos e o que falta |
| [`decisoes.md`](decisoes.md) | Escolhas que parecem melhoráveis e não são |
| [`regras-de-negocio.md`](regras-de-negocio.md) | Como o sistema se comporta |
| [`specs/…-sistema-despesas-casal-design.md`](specs/2026-08-08-sistema-despesas-casal-design.md) | Por que ele é assim |
| [`specs/…-redesenho-visual-e-navegacao-design.md`](specs/2026-09-07-redesenho-visual-e-navegacao-design.md) | Por que a camada visual é assim |
| **este arquivo** | **Onde cada coisa mora e como acrescentar** |

## A ideia central

Quatro camadas, com uma regra de dependência que **não pode ser quebrada**: cada uma só
conhece as de baixo.

```
src/app/          rotas e fronteiras — onde o mundo externo entra
   ↓
src/components/   UI, sem I/O próprio
   ↓
src/server/       banco, sessão, gravação
   ↓
src/domain/       regras de cálculo, puras, sem I/O nenhum
```

O domínio não sabe que existe banco, tela ou HTTP. É isso que torna cada caso de borda
testável em milissegundos, e é onde moram os bugs que custam caro.

---

## Camada 1 — `src/domain/`

Funções puras. Argumentos entram, valor sai. **Nada de Prisma, `fetch`, `Date.now()` ou
`new Date()`.** Cada arquivo tem um `.test.ts` irmão.

| Módulo | O que garante | Interface |
|---|---|---|
| `money.ts` | Dinheiro é inteiro em centavos, e entrada ambígua é recusada | `Centavos`, `reaisParaCentavos`, `formatarBRL` |
| `data.ts` | Data sem fuso, como string `AAAA-MM-DD` | `DataISO`, `partesDaData`, `ultimoDiaDoMes`, `diaClampeado` |
| `competencia.ts` | Em qual fatura um lançamento cai | `Competencia`, `competenciaDeCartao`, `competenciaDeContaExterna`, `competenciaDeDataISO`, `avancarCompetencia`, `compararCompetencias`, `formatarCompetencia` |
| `parcelamento.ts` | A soma das parcelas é exatamente o total | `OrigemValor`, `EntradaParcelamento`, `ParcelaGerada`, `gerarParcelas` |
| `rateio.ts` | A soma das cotas é exatamente o valor rateado | `PesoRateio`, `Cota`, `pesosMeioAMeio`, `ratear` |
| `totais.ts` | A matriz de pessoas por contas, reproduzindo a planilha | `COLUNA_TOTAL`, `ParcelaResumo`, `LinhaMatriz`, `ResumoMes`, `calcularResumo` |
| `conferencia.ts` | O somado contra o valor real do extrato | `SituacaoConferencia`, `Conferencia`, `conferir` |
| `agrupamento.ts` | Agrupa e soma por chave, para a tela não precisar contar | `ItemAgrupavel`, `Grupo`, `agrupar` |
| `fixtures/mes-de-referencia.ts` | Mês inventado para os testes de total, com conjunto ímpar | `PARCELAS_DO_MES` |

**A fixture é a prova de paridade.** Se os totais dela deixarem de bater, o cálculo quebrou —
não conserte o teste.

`calcularResumo` **lança** para entrada incoerente: conta desconhecida, parcela pessoal sem
membro, conjunto sem rateio, cotas que não fecham. Isso é proposital. Não envolva em
`try/catch` para "a tela não quebrar": se disparar, há dado corrompido e alguém precisa saber.
`agrupar` segue o mesmo princípio: lança para item com chave fora de `ordemDasChaves` e para
chave repetida na própria ordem — descartar ou duplicar em silêncio é bug já pago nesta base
(commit `a3c34bb`).

Quem transforma esse lance em mensagem, em vez de tela branca, é `src/app/(app)/error.tsx` — e
ela **não engole nada**: não há `try/catch` em lugar nenhum, o erro já subiu e já foi
registrado quando a fronteira renderiza. A armadilha 12 é justamente um caso em que
`calcularResumo` lançava com dado perfeitamente válido no banco.

## Camada 2 — `src/server/`

A ponte com o banco e a sessão. Aqui pode haver I/O; aqui **não** pode haver regra de cálculo.

### Infraestrutura

- `db.ts` — o cliente Prisma singleton. Evita esgotar conexão no hot reload.
- `auth.ts` — Auth.js v5, provider Google, sessão em JWT, sem tabela de auth no banco.
- `auth-regras.ts` — `emailAutorizado` e `loginPermitido`, **puras e testadas**. A regra de
  acesso mora fora do Auth.js de propósito, para ser testável sem browser. Lista vazia recusa
  todo mundo; `email_verified` ausente recusa.

### Repositórios — leitura e gravação

| Arquivo | Interface |
|---|---|
| `repositorios/lancamento.ts` | `EntradaLancamento`, `ResultadoCriacao`, `ResultadoGravacao`, `criarLancamento`, `editarLancamento`, `excluirLancamento`, `marcarReembolso`, `restaurarLancamento` |
| `repositorios/resumo.ts` | `LinhaGrade`, `LinhaAReceber`, `carregarParcelasDaCompetencia`, `carregarLinhasDaGrade`, `carregarReembolsosDaCompetencia` |
| `repositorios/fatura.ts` | `ResultadoRegistroValorReal`, `ResultadoTrava`, `registrarValorReal`, `travarFatura`, `destravarFatura`, `carregarFatura` |
| `repositorios/lixeira.ts` | `ItemDaLixeira`, `carregarLixeira` |
| `repositorios/configuracao.ts` | `ResultadoConfiguracao`, `criarCategoria`, `editarCategoria`, `arquivarCategoria`, `editarConta`, `editarMembro`, `definirQuemAbsorveSobra` |

**As três gravações de lançamento rodam dentro de `prisma.$transaction`**, e todo helper do
módulo recebe um `ClienteBanco` em vez de fechar sobre o `prisma` global — é o que permite a
mesma função servir dentro e fora da transação. Quem acrescentar gravação ali **tem que passar
o `tx` adiante**; usar o `prisma` global dentro da transação escreve por fora dela, e o
rollback não alcança o que foi escrito assim. A verificação da fatura travada também ficou
dentro: conferir fora deixava uma janela entre a conferência e a escrita em que a outra pessoa
travava a fatura.


`carregarFatura` devolve **valor e status na mesma consulta** (`{ valorRealCentavos, status }`,
ou `null` quando ninguém conferiu ainda). A faixa de conferência precisa dos dois — o número
para preencher o campo, o status para saber se a fatura travada desabilita o campo — e duas
funções lado a lado custariam duas leituras da mesma linha. Ela **substituiu** a antiga
`carregarValorReal`, que só devolvia o número.

`definirQuemAbsorveSobra` é transacional de propósito: sem a transação, uma falha entre as duas
gravações deixaria zero ou dois membros absorvendo a sobra, e o rateio voltaria a depender do
desempate por `criadoEm`. Ver `decisoes.md`, *"A sobra de centavos vai sempre para o mesmo
membro"*.

As gravações devolvem resultado tratável em vez de lançar:
`{ ok: false, motivo: 'CONFLITO' | 'FATURA_TRAVADA' }` nas de lançamento, e
`{ ok: false, motivo: 'NOME_DUPLICADO' | 'NAO_ENCONTRADO' }` nas de configuração. **Quem chama
tem que tratar** — recusa engolida como sucesso faz a pessoa achar que salvou.

### Actions — a fronteira do cliente

`actions/lancamento.ts`, `actions/fatura.ts` e `actions/configuracao.ts`. Toda action **valida
com Zod e exige sessão** antes de qualquer gravação, e propaga o resultado do repositório sem
engolir.

`acaoEditarConta` acrescenta uma recusa própria, `RecusaDiasDeCartao`
(`motivo: 'CARTAO_SEM_DIAS'`, com `campos` e `mensagem`): conta de cartão sem dia de fechamento
ou de vencimento é o dado que quebra o cálculo de competência depois, então a fronteira barra
antes de gravar. Ela carrega **qual** dia falta porque exceção de server action chega ao
cliente como digest — a tela diria "erro" e nada mais.

## Camada 3 — `src/components/`

React. Sem I/O próprio: recebem dados por prop e chamam actions.

**Uma pasta por área da tela**, mais `ui/` para as primitivas. Componente solto na raiz de
`src/components/` não existe mais — a raiz tem só as pastas.

### `casco/` — o que envolve todas as telas com sessão

| Componente | Cliente? | Papel |
|---|---|---|
| `barra-lateral.tsx` | **sim** | Destinos, destaque do atual, e o `?competencia=` carregado de uma tela para a outra |
| `faixa-competencia.tsx` | não | O mês em tipo grande, setas de mês, e os totais do mês por membro e por fatura |
| `identidade.tsx` | não | Quem está logado, no rodapé da barra, e o botão de sair |
| `tema.tsx` | **sim** | O botão de tema, no rodapé: sistema → claro → escuro |
| `tema-compartilhado.ts` | — | Nome do cookie e tipo, partilhados com o `layout.tsx` de servidor |

Os três juntos são a armadilha 9 desta página, e vale ler antes de mexer em qualquer um:
a barra é de cliente porque usa `useSearchParams()`, a faixa é de servidor porque é a página
que lhe entrega os totais, e é o layout que não recebe `searchParams` que obriga os dois a
morarem em lugares diferentes.

`Identidade` é de servidor (usa `auth()`) e chega à `BarraLateral` como `children` — é o jeito
de um componente de servidor viver dentro de um de cliente sem virar prop serializada.

### `despesas/` — a grade do mês

| Componente | Cliente? | Papel |
|---|---|---|
| `chips-conta.tsx` | não | Filtro por conta, no topo da grade |
| `grade-lancamentos.tsx` | **sim** | A grade do mês, uma linha por **parcela**; abre o painel e guarda os dois estados vazios |
| `secao-pessoa.tsx` | **sim** | Um grupo da grade: cabeçalho com a cor do membro, as linhas, e o subtotal |
| `painel-lancamento.tsx` | **sim** | Criar **e** editar no mesmo painel, com a dica de em qual fatura a compra cai |
| `dialogo-exclusao.tsx` | **sim** | A confirmação de exclusão, desenhada — não o `window.confirm` do navegador |

Os dois estados vazios da grade são de propósito: mês sem lançamento nenhum e filtro de conta
que não bateu com nada têm causas diferentes, e a saída de um é lançar, a do outro é limpar o
filtro.

`painel-lancamento.tsx` é o arquivo mais denso desta camada: as armadilhas **10** e **11** e o
caso latente do membro (armadilha 12) moram todos nele. Leia os comentários antes de
simplificar qualquer coisa ali.

### `resumo/` — a matriz e a conferência

| Componente | Cliente? | Papel |
|---|---|---|
| `cartoes-resumo.tsx` | não | Os cartões do topo: total por membro e fatura por cartão |
| `matriz-resumo.tsx` | não | A matriz de pessoas por contas, em bandas |
| `conferencia-fatura.tsx` | **sim** | O valor do extrato e a diferença |
| `secao-a-receber.tsx` | **sim** | A lista de reembolsos do mês, com o interruptor de recebido |
| `trava-fatura.tsx` | **sim** | Fechar e reabrir o mês, com confirmação nos dois |
| `selo-conferencia.tsx` | não | Texto e cor para cada situação que `conferir` devolve |

As **duas** linhas de metade aparecem separadas (`Metade de Nardy`, `Metade de Nick`), uma por
membro, e `docs/regras-de-negocio.md` §4 acompanha.

`trava-fatura.tsx` fica **fora** do `form` da conferência de propósito: dentro dele, o gatilho
do diálogo disputaria o submit do botão "Conferir". Fechou a única ação que a interface mandava
fazer e não oferecia — três mensagens diziam "destrave a fatura" apontando para algo que só
existia em SQL.

`ResumoMes.reembolso` é a linha *A receber*, por pessoa: **fora** de `pessoal`, `conjunto`,
`metade` e `totalGeral`, **dentro** de `somado`. Por isso a identidade da planilha não vale
mais como estava — `somado = soma dos totalGeral + soma dos reembolso`. Quem escrever
asserção de total precisa somar as duas parcelas, ou o teste passa a acusar erro onde não há.
A matriz só desenha essas linhas no mês que tem reembolso.

Cartões e matriz leem o **mesmo** `ResumoMes`; nenhum dos dois refaz conta. `selo-conferencia`
só lê a `diferenca` que `conferir` devolveu, nunca recalcula.

### `configuracoes/` — o cadastro

| Componente | Cliente? | Papel |
|---|---|---|
| `lista-categorias.tsx` | **sim** | Criar, editar e arquivar categoria |
| `lista-contas.tsx` | **sim** | Editar conta, inclusive os dias de cartão e o `ativa` |
| `lista-membros.tsx` | **sim** | Editar nome e cor, e escolher quem absorve a sobra |
| `campos-nome-e-cor.tsx` | não | `CampoNome` e `CampoCor`: as travas de formulário das três listas, juntas |

`campos-nome-e-cor.tsx` é componente, e não constante exportada, de propósito: constante se usa
pela metade — dá para importar o teto do nome e esquecer o `pattern`. No componente, as props
travadas (`name`, `type`, `required`, `maxLength`, `pattern`, `title`) saem do tipo por `Omit`,
e o spread de quem chama vem **antes** delas. `type` entrou no `Omit` porque **`pattern` é
ignorado em `type="number"`** — deixá-lo aberto seria deixar a trava desligável por fora.

As travas não são estilo. O `nome` da action é `z.string().trim().min(1).max(40)`, então um
nome só de espaços passa pelo `required` do HTML, chega vazio ao servidor, faz o `parse`
lançar, e o Next entrega ao cliente só um digest: a tela diria "erro" sem dizer o quê.

### `ui/` — as primitivas do shadcn

`alert-dialog`, `badge`, `button`, `input`, `label`, `select`, `sheet`, `sonner`, `switch`.
São geradas pelo shadcn e revestidas com os tokens da casa. **Não escreva cor literal aqui** —
o `select.tsx` é o que carrega a armadilha 11.

**Componente não calcula.** Se você sentir vontade de somar algo aqui, a conta pertence ao
domínio — foi assim que `agrupamento.ts` nasceu.

## Camada 4 — `src/app/`

Rotas do App Router e as fronteiras com o mundo.

- `layout.tsx` — o shell, o `metadata`, a fonte e o `Toaster`
- `page.tsx` — a raiz, que só redireciona para `/despesas`
- `(auth)/entrar/` — a tela de login
- `(app)/` — **o grupo de rota das telas com sessão.** Grupo de rota não entra na URL: as
  páginas continuam em `/despesas`, `/resumo` e `/configuracoes`. O que ele dá é um
  `layout.tsx` comum (o casco: barra lateral + `main`) e um `error.tsx` comum, sem mexer em
  endereço nenhum
  - `(app)/layout.tsx` — o casco. Ver a armadilha 9
  - `(app)/error.tsx` — a fronteira de erro das três telas, numa só. Erro lançado pelo próprio
    `(app)/layout.tsx` **não** cai aqui; para isso a fronteira teria que estar no segmento
    acima. O botão chama `retry` e não `reset`: `reset` só remonta os mesmos filhos, sem nova
    busca no servidor, o que nunca recupera erro vindo de Server Component — e as três páginas
    são `async` e consultam o banco
  - `(app)/despesas/` — a grade do mês
  - `(app)/resumo/` — os cartões, a matriz e a conferência
  - `(app)/configuracoes/` — categorias, contas e pessoas. É a **única** tela que mostra
    categoria arquivada, conta inativa e pessoa inativa, e a única de onde se volta atrás.
    Precisa de `export const dynamic = 'force-dynamic'`: ela não usa `searchParams` nem
    nenhuma outra API dinâmica, então sem essa linha o `next build` prerenderizaria a rota —
    lendo o banco de **produção** na hora de compilar e servindo a lista congelada
- `api/auth/[...nextauth]/` — os handlers do Auth.js
- `competencia-atual.ts` — **a única fronteira de fuso horário do sistema.** Converte "hoje"
  para competência no fuso de São Paulo. Nenhum outro lugar deve chamar `new Date()` para
  descobrir o mês corrente.
- `globals.css` — **a definição dos tokens**, e o único arquivo onde cor literal é legítima.
  Importa o Tailwind com `@import "tailwindcss" source("../")`, escopo que não é cosmético:
  ver `decisoes.md`, *"A varredura de cor exige dígito, e o Tailwind é preso a `src/`"*
- `src/middleware.ts` — protege todas as rotas. Rota nova nasce protegida.
- `src/lib/utils.ts` — só reexporta o `cn`, que as primitivas do shadcn esperam encontrar aqui

Em página de rota, `searchParams` é **Promise** no Next 16 e precisa de `await`. Em **layout**,
`searchParams` não chega de jeito nenhum — armadilha 9.

## Fora das camadas

### `prisma/`

`schema.prisma` com `Membro`, `Conta`, `Categoria`, `Lancamento`, `Parcela`, `Rateio`,
`Fatura`, `Auditoria`, e os enums. `seed.ts` cria os membros a partir de `EMAILS_AUTORIZADOS`,
as contas C6 e Externa, e as oito categorias.

**Datas e competências são `String` no banco, de propósito.** `DateTime` faria alguma camada
aplicar fuso e mover a compra do dia do fechamento para a fatura errada.

`Recorrente` e `Preferencia` estão na spec mas **não existem no banco** — são de Fase 2.

### `scripts/`

- `importar-planilha.ts` — migração de uma vez só, do CSV colunar exportado do Sheets
- `importar-planilha.test.ts` — o teste do leitor; roda no `npm test` como os de domínio
- `dados-ficticios.ts` — popula as telas com dez lançamentos inventados, e apaga só o que criou
- `testar-banco.mjs` — o runner de `npm run test:banco`. Aponta a suíte para
  `DATABASE_URL_TESTE` e **recusa** rodar contra o endpoint de produção; força `--no-file-parallelism`
  porque os três arquivos de banco compartilham um banco e se atropelam em paralelo. Ver
  [`decisoes.md`](decisoes.md) antes de mexer em qualquer um dos dois comportamentos

### `e2e/`

`lancar-parcelado.spec.ts`, em Playwright, **pulado**: `/despesas` exige login com Google e o
ambiente não completa o OAuth interativo. O cabeçalho do arquivo tem o passo a passo para
habilitá-lo (salvar o `storageState` depois de um login manual). Ele **não** entra no
`npm test`, que é `vitest run`.

---

## Como acrescentar coisas

**Uma regra de cálculo nova:** nasce em `src/domain/`, com teste, antes de existir tela ou
query. Se ela precisa de banco para ser testada, ela está na camada errada.

**Uma tela nova:** rota em `src/app/(app)/`, componentes numa pasta própria de
`src/components/`, leitura em `src/server/repositorios/`. A rota já nasce protegida pelo
middleware, e já herda o casco e a fronteira de erro do grupo. Acrescente o destino em
`src/components/casco/barra-lateral.tsx` — mas só depois que a página existir; até lá ele fica
no `DESTINOS` com `rota: null`, que é como Gráficos e Lixeira aparecem hoje.

**Se a tela nova for de mês**, é ela que monta a `FaixaCompetencia` e lhe entrega competência,
conta e totais. O casco não faz isso por ela, e não é esquecimento — armadilha 9.

**Um campo novo no banco:** schema, migration, e **confira se alguma leitura precisa de
`orderBy` novo**. Já tivemos um bug em que a ordem vinha do Postgres e o resultado mudava
entre carregamentos da mesma página.

**Uma gravação nova:** lock otimista com `WHERE versao = ?`, barreira de fatura travada nos
**dois sentidos** (de onde sai e para onde vai), e resultado tratável em vez de exceção.

---

## Armadilhas que já morderam

Cada uma custou uma rodada de correção nesta base. Estão aqui para não custarem duas.

1. **A grade mostra parcela, não lançamento.** `LinhaGrade.valorCentavos` é o valor da
   parcela; `lancamentoValorCentavos` é o do lançamento. Confundir os dois fez a edição
   encolher uma compra a cada salvamento: R$ 1.000 em 5x virou R$ 200, depois R$ 40.

2. **O rateio é calculado sobre o valor da parcela.** Um parcelado de conjunto de R$ 101,01
   rateia 101,01 por mês, não o total da compra. O número errado continua plausível.

3. **Fatura travada precisa barrar os dois sentidos.** Barrar só a competência de origem deixa
   uma edição mover a parcela **para dentro** de um mês fechado.

4. **Middleware sem `callbacks.authorized` não bloqueia nada.** O `signIn` decide quem entra;
   o `authorized` decide quem passa. Sem o segundo, todas as rotas respondem 200.

5. **O parser de dinheiro recusa ponto sem vírgula.** `129.54` é ambíguo, porque `1.234` tanto
   pode ser mil duzentos e trinta e quatro quanto um e vinte e três. Recusar é mais barato que
   gravar cem vezes o valor.

6. **A suíte destrutiva recusa rodar se houver lançamento no banco.** O banco é o de produção
   do casal. Se precisar rodá-la, aponte `DATABASE_URL` para um banco vazio.

7. **O Neon hiberna.** A primeira conexão depois de um tempo parado pode falhar; tente de novo
   antes de concluir que está fora do ar.

8. **Aviso de suposição em relatório merece verificação.** Duas vezes um implementador escreveu
   "isto é suposição minha, confira antes" e seguimos em frente. A primeira custou três
   rodadas de correção; a segunda, a reescrita inteira do leitor da planilha.

As quatro seguintes são da camada visual, e cada uma custou uma rodada nesta branch. Todas
trazem o **fato medido** junto, porque conselho sem evidência é a primeira coisa que alguém
"simplifica".

9. **Layout do App Router não recebe `searchParams`.** Só página recebe. É a restrição que
   decidiu o desenho inteiro do casco, e sem ela ninguém entende por que as duas metades do
   casco moram em lugares diferentes:

   - A **barra lateral** precisa saber a competência para carregá-la de uma tela para a outra.
     Como o layout não recebe `searchParams`, ela lê sozinha, com `useSearchParams()` — e isso
     a torna componente de **cliente**, o que por sua vez obriga a uma fronteira de `Suspense`
     em volta dela no `(app)/layout.tsx`. Sem o `Suspense`, `npm run build` falha com
     *"useSearchParams should be wrapped in a suspense boundary"*. O `fallback` repete a
     largura exata da barra (`w-56`) para a tela não pular ao hidratar.
   - A **faixa de competência** precisa dos totais do mês, que vêm do banco. Ela é de
     **servidor**, e é **cada página** que a monta e lhe passa competência, conta e totais. O
     casco não consegue fazer isso por ela.

   Consequência prática: página nova de mês monta a própria faixa. Não é esquecimento do casco,
   e "mover a faixa para o layout" não funciona.

   `Identidade` é de servidor (chama `auth()`) e vive dentro da barra, que é de cliente, como
   `children` — é o único jeito de um componente de servidor viver dentro de um de cliente sem
   virar prop serializada.

10. **`<form action={fn}>` do React 19 reseta os campos não controlados.** Assim que a
    transição do envio termina, todo campo com `defaultValue` volta ao valor original —
    inclusive quando o servidor **recusou** a gravação.

    **Medido numa reprodução** com esse mesmo arranjo (`action={fn}`, função síncrona
    delegando a um `useTransition` interno): o campo voltou ao `defaultValue` em **t=806ms**,
    no mesmo instante em que a mensagem de recusa apareceu. O caso de controle, com `onSubmit`
    + `preventDefault`, preservou o que estava digitado até o fim da amostragem (**t=2001ms**).

    Ou seja: com `action`, a pessoa perde o que digitou exatamente em `CONFLITO` e
    `FATURA_TRAVADA` — as recusas em que a tela manda tentar de novo. Por isso
    `despesas/painel-lancamento.tsx`, `resumo/conferencia-fatura.tsx` e as três listas de
    `configuracoes/` usam `onSubmit` com `preventDefault`. **Não "simplifique" de volta para
    `action={}`.** O registro completo está nos comentários de `painel-lancamento.tsx` (o
    `enviar`) e de `conferencia-fatura.tsx`.

    A validação do navegador não muda com isso: `required`, `min` e `max` continuam barrando o
    envio antes de o handler existir.

11. **`Select` do radix com `defaultValue` fora da lista cai na primeira opção, em silêncio.**
    O `Select` manda o valor no `FormData` por um `<select>` nativo escondido, que recebe o
    `defaultValue` e monta as `<option>` a partir dos `SelectItem` renderizados. `<select>`
    nativo cujo `defaultValue` não casa com nenhuma `<option>` cai na **primeira**.

    **Medido com o `Select` real do projeto:** `selectedIndex: 0`, `value` igual à primeira
    opção, `formValido: true` e mensagem de validação vazia — **o `required` não bloqueia** —,
    e o `FormData` saindo com a primeira opção. O único sinal na tela é o gatilho renderizando
    vazio.

    É por isso que `painel-lancamento.tsx` tem `contasOferecidas` e `categoriasOferecidas`: no
    modo **editar**, a lista oferecida é a dos ativos **mais** o valor do próprio lançamento,
    ainda que ele esteja arquivado ou inativo. Sem isso, abrir uma compra de categoria
    arquivada só para corrigir a descrição a gravaria na primeira categoria em ordem
    alfabética — em silêncio.

12. **`ativa` e `arquivada` nunca quiseram dizer "esconda o histórico".** Querem dizer *"não
    ofereça isto para lançamento novo"*, e só.

    O bug: `calcularResumo` **lança** para conta desconhecida
    (`Conta desconhecida no resumo: …`, `totais.ts:64`); as páginas carregavam só contas
    `ativa: true`, enquanto as parcelas vinham sem filtro nenhum. Desativar uma conta que ainda
    tinha parcela no mês fazia o mês inteiro parar de abrir — e o dado no banco estava
    perfeitamente correto. A Etapa 06 pôs "desativar conta" a um clique, e foi o que revelou o
    caso.

    O conserto, em `(app)/despesas/page.tsx` e `(app)/resumo/page.tsx`: as páginas carregam
    **todas** as contas e calculam sobre **ativas ∪ com parcela no mês**
    (`contasDoMes = todasAsContas.filter((c) => c.ativa || comParcelaNoMes.has(c.id))`). A
    lista estreita (`contasAtivas`) sobrevive só para o que se **oferece** em lançamento novo.
    Mesma forma para categoria: a página de despesas carrega todas, inclusive arquivadas,
    porque a bolinha de cor de cada linha da grade precisa delas.

    **O caso latente do membro é o mesmo, e hoje não é alcançável.** `calcularResumo` lança
    igual para membro desconhecido; `escopoPadrao`, em `painel-lancamento.tsx`, tem exatamente
    a forma da armadilha 11; e as duas páginas carregam membro com `where: { ativo: true }`.
    Não é alcançável porque **não existe ação de desativar pessoa**: `editarMembro` grava só
    `nome` e `cor`, e `Membro.ativo` é apenas rótulo na lista de Configurações. No dia em que
    essa tela existir, **os três pontos precisam do mesmo tratamento, e juntos** — corrigir só
    um deixa o buraco aberto nos outros dois. Há um comentário marcando o ponto em
    `painel-lancamento.tsx`, logo acima de `escopoPadrao` ("ATENCAO, terceiro caso da mesma
    familia, hoje inalcancavel").

13. **Competência é o mês do vencimento, não o nome da aba da planilha.** A aba chamada
    "AGOSTO" é paga em setembro, logo é competência `2026-09`. A primeira importação passou
    `2026-08` na linha de comando e ficou um mês inteira deslocada — contra a definição que o
    próprio `CLAUDE.md` documenta no vocabulário. O importador aceita a competência como
    argumento e **não tem como saber que você errou**: ele grava onde você mandar. Consequência
    aceita: os rótulos do sistema ficam um mês à frente dos nomes das abas, para sempre.

14. **O importador não tem trava contra dado preexistente.** Rodar duas vezes soma em cima, não
    substitui — 35 lançamentos viram 70, e os totais dobram sem nenhum erro. O rollback
    compensatório que ele tem só desfaz **a própria rodada** quando ela falha no meio. Antes de
    reimportar, apague o lote anterior, e confira pelo minuto de criação se não há lançamento
    feito pela tela misturado no meio.

15. **A planilha arredonda as duas metades para cima, e o sistema não.** Num conjunto de
    R$ 101,01 a planilha dá R$ 50,50 a cada um, e os dois totais gerais somam um centavo
    **mais** do que a fatura que se paga. O sistema dá a sobra a quem tem `absorveSobra` e
    fecha exato. Na conferência, **essa divergência é a planilha errando** — e cresce com o
    número de lançamentos conjuntos ímpares, um centavo cada, não um centavo no total.

16. **Número financeiro real não entra em fixture nem em documento.** A fixture dos testes de
    total guardou por meses a lista de compras do casal, item a item, e os totais de agosto
    estavam espalhados por 22 arquivos — incluindo valores de compras individuais
    reaproveitados como dado de teste em `agrupamento.test.ts`. O substituto é
    `fixtures/mes-de-referencia.ts`, inventado. **Ao escrever teste de cálculo, invente o
    número**; a conferência contra o real é na tela, por `verificacao-visual.md`.

17. **Resultado certo não prova caminho certo, e no middleware isso engana.** `/despesas`
    redirecionando para `/entrar` parece prova de que a proteção de rota funciona. Em produção
    estava redirecionando **com a configuração do Auth.js quebrada** — `MissingSecret` em todo
    `/api/auth/*`, 500 em todas elas, e o 307 saindo mesmo assim. A observação foi registrada
    aqui como "middleware verificado em produção" e estava errada.

    Para dar a proteção por verificada é preciso ver o **par**: quem não tem sessão é barrado
    **e** quem tem entra. Só a primeira metade é indistinguível de tudo estar quebrado, porque
    sistema quebrado também barra todo mundo.

    O mesmo vale para a allowlist: `/entrar` recusando um e-mail de fora só significa alguma
    coisa se um e-mail de dentro entrar.

    **O par foi fechado em 2026-10-12**, em produção: os dois e-mails da allowlist entraram e
    um de fora foi bloqueado. A armadilha fica porque ela não é sobre autenticação — é sobre
    aceitar meia evidência. Vale para qualquer barreira: filtro, validação, trava de fatura,
    guarda de teste. Barrar é a metade fácil, e é a que um sistema quebrado também faz.

18. **Só dá para entrar pelo domínio estável da Vercel.** Cada deploy ganha uma URL própria
    (`lancardespesas-h9keuusyk-nick-hoc.vercel.app`), e o Auth.js monta o callback a partir do
    host da requisição. Entrar por ali manda ao Google um `redirect_uri` que muda a cada deploy
    e que **não há como cadastrar** — o resultado é `Erro 400: redirect_uri_mismatch` com toda a
    configuração correta.

    O botão "Visit" do painel da Vercel leva justamente para a URL do deploy, e foi assim que
    isto apareceu. Use sempre `https://lancardespesas.vercel.app`.

    O URI que o Auth.js realmente usa não precisa ser adivinhado: `GET /api/auth/providers`
    devolve o `callbackUrl` dele em JSON, sem autenticação. É a forma de conferir contra o que
    está cadastrado no Google em vez de supor.

19. **Branch de teste recriada no Neon volta com os dados de produção.** A branch nasce como
    cópia do pai, e recriá-la — para rotacionar senha, por exemplo — repete isso. Aconteceu:
    depois de uma rotação, `npm run test:banco` recusou rodar com *"Banco tem 67 lançamento(s)"*.

    **A recusa é o comportamento certo, não o problema.** Quem vir essa mensagem deve limpar a
    branch de teste, nunca contornar a guarda. E antes de limpar, conferir que o endpoint não é
    o de produção — o runner já compara, mas o `deleteMany` que se escreve na hora não.

    Categorias, membros e contas ficam: a suíte os lê como fixture pelo `findFirstOrThrow`.

20. **A linha *A receber* da matriz e a seção abaixo dela leem de lugares diferentes.** O total
    vem de `calcularResumo`, sobre `ParcelaResumo`; a lista vem de
    `carregarReembolsosDaCompetencia`, uma consulta própria. Os dois números **têm** que bater,
    e nada no código garante isso — o filtro é o mesmo (`statusReembolso != null` e
    `PARCELA_VISIVEL`) em dois lugares.

    Mexeu num, confira o outro. Foi medido uma vez contra os dados reais: setembro deu
    R$ 54,00 nos dois.

    Juntá-los numa consulta só foi considerado e descartado — a matriz precisa das parcelas
    todas do mês para somar as outras linhas, e a lista precisa de descrição, conta e devedor,
    que a matriz não usa. Uma consulta servindo os dois carregaria o mês inteiro com campos que
    metade dos consumidores ignora.

21. **A lixeira é a única tela que não é de um mês, e a única leitura por
    lançamento.** Todo o resto do sistema lê parcela e recebe competência. Aqui não: o que se
    procura é *"o que eu acabei de excluir"*, não *"o que foi excluído em setembro"*, e mostrar
    doze linhas de um parcelado mentiria sobre o que volta ao restaurar.

    Ela recebe o `?competencia=` que a barra lateral monta e **ignora**, como Configurações —
    é esse parâmetro ignorado que preserva o mês ao voltar para Despesas.

    `restaurarLancamento` verifica fatura travada **de novo**, e esse é o ponto não óbvio:
    excluir já recusa em mês fechado, então nada na lixeira veio de um mês travado — mas a
    fatura pode ter sido travada **depois**. Sem a segunda verificação, restaurar devolveria uma
    parcela para um mês que alguém já conferiu e fechou.

22. **O tema forçado vem de cookie, e trocar isso por `localStorage` quebra a hidratação.**
    `layout.tsx` lê o cookie no servidor e já renderiza `data-tema` no `<html>`. Parece rodeio
    quando `localStorage` é mais simples — e foi exatamente o que se tentou primeiro.

    O que acontece com `localStorage`: a escolha só é conhecida no cliente, então é preciso um
    script inline que ponha o atributo antes da primeira pintura, senão há lampejo do tema
    errado. Mas aí o `<html>` que o React hidrata tem um atributo que o HTML do servidor não
    tinha — **erro de hidratação no console a cada carregamento**. E
    `suppressHydrationWarning` no `<html>` **não suprime esse caso no Next 16**: foi testado,
    com o servidor de desenvolvimento reiniciado, e o erro continuou.

    O custo do cookie é o layout raiz virar dinâmico: `/entrar` deixou de ser pré-renderizado,
    de `○` para `ƒ` no `npm run build`. Aceito, porque todo o resto já é dinâmico por sessão.

    O contrato mora em `casco/tema-compartilhado.ts`, **sem `'use client'`** — um componente de
    servidor não importa de módulo de cliente, e duplicar o nome do cookie faria as duas pontas
    divergirem em silêncio.
