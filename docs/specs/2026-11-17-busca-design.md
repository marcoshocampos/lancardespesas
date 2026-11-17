# Busca de lançamentos — documento de design

Data: 2026-11-17. Complementa a [spec do sistema](2026-08-08-sistema-despesas-casal-design.md),
que previa a busca na Fase 2 como *"descrição, valor, categoria, pessoa, período"*. Este
documento corta essa lista para o que o casal vai usar, e diz como.

## 1. O problema

Achar um lançamento antigo exige lembrar o mês dele. Os dois usos que motivam a busca:

- **"Quando foi que compramos aquilo?"** — sabe-se um pedaço da descrição, não o mês.
- **"Esse valor do extrato já foi lançado?"** — sabe-se o valor exato, e quer-se saber se ele
  existe no sistema e em que mês caiu. Acontece com o Despesas aberto, conferindo a fatura.

## 2. Decisões tomadas com o usuário

| Pergunta | Escolha |
|---|---|
| Buscar por quê? | **Um campo só, texto ou valor.** Sem filtros separados de categoria, pessoa, conta e período |
| Onde fica? | **Uma barra horizontal no Despesas**, e não uma tela própria. A busca fica onde o tempo é gasto, e o clique leva à linha sem trocar de tela |
| O que o clique faz? | **Vai ao mês, com a linha destacada.** A busca encontra; editar e excluir continuam onde já estão |
| Parcelado aparece como? | **Uma linha por lançamento**, como a Lixeira — não uma por parcela |

## 3. Comportamento

### A barra

Uma barra de busca de largura inteira no Despesas, logo abaixo do título e acima da faixa de
recorrentes e dos chips de conta. Campo com rótulo acessível e botão de buscar. A busca roda
**ao apertar Enter** (ou no botão), não enquanto se digita. Termo vazio, ou só espaços, não
busca: o Despesas continua mostrando o mês.

O campo **não** recebe foco ao abrir a tela: o Despesas é aberto o tempo todo, e roubar o foco a
cada visita atrapalharia o teclado de quem só quer lançar.

### Os dois estados do Despesas

**Sem termo** — exatamente como hoje: faixa de recorrentes, chips de conta, *Novo lançamento*,
grade do mês, botão flutuante.

**Com termo** — a barra mostra o termo e um link **Limpar busca**, e no lugar da faixa de
recorrentes, dos chips e da grade aparece a lista de resultados, **de todos os meses**:

- A **faixa de competência continua** no topo, com os totais do mês: é o mês para onde se volta
  ao limpar, e é a competência de origem que o clique usa (ver *O clique*).
- O cabeçalho da lista diz que os resultados são **de todos os meses**, para a faixa de totais
  logo acima não parecer descrevê-los.
- **A faixa de recorrentes some**: oferecer lançar o fixo do mês no meio de resultados de outros
  meses confundiria o que o clique lança.
- **Chips, *Novo lançamento* e o botão flutuante somem** junto com a grade: são da grade do mês.
  Lançar volta a ficar a um clique de distância em *Limpar busca*.

A URL carrega o estado: `/despesas?competencia=2026-11&q=netflix`. O voltar do navegador
funciona, e recarregar mantém a busca.

**Limpar busca** volta a `/despesas?competencia=<a mesma>`, com o filtro de conta que estivesse
ligado. Trocar de mês pelas setas da faixa **também encerra a busca** — a faixa monta os links só
com competência e conta, então `q` não viaja. Sai de graça, e é o comportamento certo: quem troca
de mês quer ver o mês.

### O que corresponde

Um lançamento corresponde se casar **por texto ou por valor** — os dois critérios se somam.

**Por texto.** O termo é dividido em palavras, e o lançamento corresponde se **todas** as
palavras aparecerem, em qualquer ordem, no texto formado pela descrição mais o nome do
terceiro (`devedorNome`). A comparação ignora maiúscula e acento: `farmacia` acha *Farmácia*,
`uber viagem` acha *Viagem Uber*.

**Por valor.** Se o termo inteiro for um valor que `reaisParaCentavos` aceita (`89,90`,
`R$ 89,90`, `89`, `1.025,51`), o lançamento também pode casar pelo valor.

O termo precisa ter **forma** de valor — dígitos, ponto, vírgula, sinal e `R$` opcionais, e
nada mais — antes de chegar ao parser. A guarda existe porque `reaisParaCentavos` descarta tudo
o que não é dígito antes de ler, o que é certo no campo de valor do painel e errado aqui: sem
ela, `uber 89` viraria R$ 89,00 e `12x` viraria R$ 12,00.

Casando por valor, o lançamento corresponde quando o valor **exato** for:

- o de alguma parcela não cancelada dele, **ou**
- o total dele, que é a soma de **todas** as parcelas, canceladas inclusive (invariante 4) —
  o valor que se lembra é o da compra, não o que sobrou dela depois de uma quitação antecipada.

A comparação é em **valor absoluto**: `50,00` acha o estorno de −50,00, porque o extrato e a
memória raramente carregam o sinal.

`89.90`, com ponto, é recusado pelo parser como ambíguo — e por isso vale só como texto. É o
mesmo motivo pelo qual ele é recusado no painel de lançamento: adivinhar o decimal é como um
valor vira 100× maior em silêncio.

`89` casa por texto (*Uber 89*) **e** por valor (R$ 89,00), e os dois resultados aparecem.

### O que não aparece

- **Lançamento na lixeira** (`deletadoEm` preenchido). Quem procura algo excluído tem a Lixeira.
- Nada de categoria, conta ou pessoa entra no texto pesquisado. Buscar `mercado` acha a compra
  descrita como mercado, não toda compra da categoria Mercado — o ranking de categorias nos
  Gráficos já responde a essa pergunta.
- O **filtro de conta não restringe** a busca: ela é de todos os meses e de todas as contas. Um
  filtro ligado antes, e esquecido, faria um "não achei" mentir.

### A lista de resultados

Um item por lançamento, do **mais recente para o mais antigo** por `dataCompra` (empate: o
criado por último primeiro). Cada item mostra:

- data da compra, descrição e, se for reembolso, o selo *a receber* com o nome do terceiro;
- conta, pessoa (ou *Conjunto*) e categoria;
- o valor total, e para parcelado o número de parcelas e a faixa de meses em que ele aparece
  (as parcelas não canceladas), no formato da Lixeira — `R$ 899,00 em 10x · novembro de 2026 a
  agosto de 2027` —, para quem buscou `89,90` entender por que achou.

No máximo **50 resultados**. Havendo mais, a lista diz quantos existem e pede um termo mais
específico. Nenhum resultado: a lista diz que não achou e lembra que a lixeira fica de fora.

### O clique

Cada item é um link para `/despesas?competencia=<destino>&destaque=<lancamentoId>` — sem `q`,
então a busca termina e o mês aparece; o voltar do navegador devolve os resultados.

O **destino** é a competência de uma parcela não cancelada do lançamento:

1. a competência que o Despesas estava mostrando, se o lançamento tiver parcela nela — quem
   busca `89,90` olhando novembro quer a parcela de novembro;
2. senão, a primeira competência do lançamento — onde a compra entrou.

Lançamento sem nenhuma parcela ativa (todas canceladas) aparece na lista, **sem link**: não há
mês em que ele seja visível.

O link vai **sem filtro de conta**, para a linha não ficar escondida atrás de um filtro que a
pessoa tinha ligado antes.

### O destaque

Com `?destaque=<lancamentoId>`, a linha desse lançamento na grade recebe um realce de fundo e
de borda, e **rola para o centro da tela** uma vez, ao abrir. Se o lançamento não estiver no
mês (foi excluído entre a busca e o clique), nada acontece — a tela abre normalmente.

Trocar de mês pelas setas solta o destaque, pelo mesmo motivo que solta a busca.

## 4. Arquitetura

### Busca em memória, e não no Postgres

Três caminhos foram considerados:

| Caminho | Por que não / por que sim |
|---|---|
| `ILIKE` / `contains` com `mode: 'insensitive'` | Ignora caixa e **não** ignora acento: `farmacia` não acharia *Farmácia* |
| Extensão `unaccent` com índice trigram | Resolve o acento, mas pede migration, extensão no Neon e um índice a manter — para duas pessoas |
| **Carregar e filtrar no servidor** | **Escolhido.** Ignora acento com `normalize('NFD')`, sem migration, e a regra inteira mora no domínio, testável em milissegundos |

O volume sustenta a escolha: hoje são 67 lançamentos, e o ritmo do casal é da ordem de 600 por
ano. A leitura traz só as colunas que a lista mostra e as parcelas de cada lançamento. Quando
pesar, o remédio é pré-filtrar no banco antes da normalização — não trocar a regra.

### A página do Despesas com termo

Com termo, a página **não carrega** o que não vai desenhar: as linhas da grade e as recorrentes
pendentes saem do `Promise.all`, e a busca entra no lugar. Contas, membros e parcelas do mês
continuam, porque alimentam a faixa de totais. Sem termo, a página faz exatamente as consultas
de hoje.

### Peças

| Arquivo | Camada | Responsabilidade |
|---|---|---|
| `src/domain/busca.ts` | domínio, puro | Normalizar texto; interpretar o termo em palavras e, se der, centavos; decidir se um lançamento corresponde; escolher a competência de destino |
| `src/domain/busca.test.ts` | teste | Os casos da seção 3 |
| `src/server/repositorios/busca.ts` | repositório | `buscarLancamentos(termo, competenciaDeOrigem)`: lê os não excluídos, aplica o domínio, ordena e corta em 50 |
| `src/server/repositorios/busca.test.ts` | teste de banco | Excluído não aparece; acha pela parcela; corte em 50 com a contagem certa |
| `src/components/despesas/barra-busca.tsx` | componente | O formulário — sem estado |
| `src/components/despesas/resultados-busca.tsx` | componente | A lista, só links — sem estado |
| `src/app/(app)/despesas/page.tsx` | página | Lê `q` e `destaque`; decide entre grade e resultados; carrega só o que vai desenhar |
| `src/components/despesas/grade-lancamentos.tsx`, `secao-pessoa.tsx` | grade | O `destaque` desce até a linha; a linha realça e rola |

A barra é um `Form` do `next/form` — um formulário GET para `/despesas` — com o campo `q` e
campos escondidos com a competência e a conta. Buscar é navegar: a URL é a busca, a tela não tem
estado para perder, e o formulário funciona até sem JavaScript; com ele, o `next/form` troca a
página sem recarregar o casco. O único código de cliente escrito para isto é o da rolagem até a
linha destacada, dentro de `secao-pessoa.tsx`, que já é componente de cliente.

O campo leva `key={termo}`: numa navegação sem recarga o React reaproveita o `<input>`, e um
campo não controlado ignora `defaultValue` novo — sem a `key`, clicar num resultado deixaria o
termo antigo escrito na barra do mês.

A barra lateral **não muda**.

Consequência aceita: o termo buscado aparece na URL e, portanto, nos logs de requisição da
Vercel — que são do próprio projeto do casal.

**Sem migration.** Nada muda no schema.

## 5. Testes

- **Domínio** (`npm test`): acento e caixa; palavras em qualquer ordem; termo que é valor e
  texto ao mesmo tempo; `89.90` só como texto; estorno achado pelo valor absoluto; valor de
  parcela e valor total; destino na competência de origem, na primeira, e ausente quando toda
  parcela está cancelada; termo vazio ou só de espaços não busca.
- **Banco** (`npm run test:banco`): lançamento excluído não aparece; parcelado achado pelo valor
  da parcela; corte em 50 com a contagem total certa.
- **Tela**: Passo 12 em [`verificacao-visual.md`](../verificacao-visual.md) — o Despesas está
  atrás do login, e nenhum agente passa dele.

## 6. Documentação

- [`regras-de-negocio.md`](../regras-de-negocio.md): a regra da seção 3.
- [`decisoes.md`](../decisoes.md): por que a busca é em memória, por que fica no Despesas e não
  numa tela própria, e por que a categoria não entra no texto.
- [`arquitetura.md`](../arquitetura.md): os módulos novos nas tabelas de camada.
- [`estado.md`](../estado.md): a busca sai de *O que ainda não existe*.

De carona, correções de texto desatualizado achadas antes desta feature: o `CLAUDE.md` ainda
diz *"Repositório privado"* e que a Vercel *"ainda não"* está configurada; o *Como retomar* do
`estado.md` manda para a branch `navegacao`, que não existe mais, e espera 109 testes.

## 7. Fora de escopo

Decidido com o usuário, ou cortado por não ter uso descrito:

- tela própria de busca e destino na barra lateral — trocado pela barra no Despesas;
- filtros separados de categoria, pessoa, conta e período;
- busca restrita ao mês aberto;
- busca enquanto se digita, e atalho de teclado para focar a barra;
- destacar na lista o trecho que casou;
- buscar dentro da lixeira;
- busca por categoria pelo nome.
