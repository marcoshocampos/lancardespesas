# Redesenho visual e de navegação — documento de design

Data: 2026-09-07. Complementa a [spec do sistema](2026-08-08-sistema-despesas-casal-design.md),
que continua sendo a fonte da verdade sobre **o que** o sistema é. Este documento trata de
**como ele se apresenta**, e só disso.

## 1. O problema

A Fase 1 entregou domínio, persistência e comportamento. A camada visual nunca foi construída:
ficou no default do `create-next-app`, e o resultado é uma tela que funciona e não se parece com
um produto.

O que está errado hoje, concretamente:

| Sintoma | Causa |
|---|---|
| Fonte Arial, apesar da Geist ser carregada | `body { font-family: Arial, Helvetica, sans-serif }` em `globals.css` sobrescreve a variável da fonte |
| Fundo preto que ninguém pediu | O `@media (prefers-color-scheme: dark)` do default, com dois tokens só, seguindo o sistema operacional |
| Cinza ilegível sobre o preto | Cores literais (`text-neutral-500`, `bg-neutral-900`) sem variante para fundo escuro |
| Três fileiras de pílulas idênticas no topo | Telas, meses e contas com o mesmo peso visual; nada distingue navegação de filtro |
| Vermelho gritando em toda linha da grade | `Excluir` é um link sublinhado vermelho repetido em cada linha, competindo com o próprio dado |
| Cores do banco sem uso | `Membro.cor`, `Conta.cor` e `Categoria.cor` têm valores no seed e nenhuma tela os lê |
| Sem identidade e sem sair | Não há cabeçalho, nem indicação de quem está logado, nem como encerrar a sessão |
| Totais só existem em outra tela | O número que mais importa — quanto cada um gastou — exige trocar de tela |
| `lang="en"` | Sistema inteiramente em português |

Nada disso é bug de lógica, e nenhuma correção aqui toca em cálculo.

## 2. Decisões

Tomadas com o usuário, com mockups comparativos, em 2026-09-07.

| Tema | Decisão | Alternativas descartadas |
|---|---|---|
| Estrutura de navegação | **Barra lateral fixa** | Barra superior; barra superior com menu flutuante |
| Grade do mês | **Seções por pessoa, com subtotal** | Lista única com hierarquia; seções por conta |
| Lançar e editar | **Painel lateral deslizante** | Linha de digitação no topo; híbrido dos dois |
| Resumo | **Cartões no topo, matriz completa embaixo** | Só a matriz em bandas; matriz enxuta |
| Base de UI | **shadcn/ui**, a stack já declarada | Mão própria só com Tailwind; Radix puro sem o gerador |
| Tema | **Claro apenas**, com tokens prontos para o escuro | Escuro como padrão; os dois desde já |
| Telas novas | **Configurações** | Gráficos; Lixeira; travar e destravar fatura |

### 2.1 Seções por pessoa não são o "layout A"

`docs/decisoes.md` registra que o layout A — três painéis lado a lado — foi adiado para a Fase 2
justamente para não construir dois renderizadores de grade antes de alguém usar o sistema.

**A decisão desta spec não desfaz aquela.** O que se escolheu continua sendo uma lista única, num
renderizador só, com cabeçalhos de grupo e subtotais. Não existe segundo componente de grade, não
existe seletor entre layouts, e a `Preferencia` continua sem existir no banco. O layout A, com
painéis em colunas, segue adiado.

### 2.2 O escuro não é construído agora

O tema alvo é claro. Os tokens nascem estruturados para receber um bloco escuro depois — cada cor
é uma variável, nenhum componente escreve cor literal — mas **o bloco escuro não é escrito nesta
fase**, e Configurações não ganha seletor de tema.

O motivo é que a preferência por pessoa depende da tabela `Preferencia`, que é de Fase 2. Um tema
escuro sem onde guardar a escolha, ou guardado só no navegador de um dos dois, é meio-recurso —
e meio-tema é pior que tema nenhum, porque cria a expectativa de que funciona.

O que **precisa** acontecer é remover o `@media (prefers-color-scheme: dark)` atual. Ele é a causa
do preto acidental de hoje, e mantê-lo com tokens novos produziria um escuro pela metade.

## 3. Fundação

### 3.1 Tokens

`src/app/globals.css` é reescrito. Sai todo o conteúdo do `create-next-app`.

Os tokens vão no `@theme` do Tailwind 4, com nomes em português, seguindo a convenção do projeto
(vocabulário de domínio em português, termos técnicos em inglês). O prefixo `--color-*` é
exigência do Tailwind para gerar as utilidades.

| Token | Papel |
|---|---|
| `--color-fundo` | Fundo da página |
| `--color-superficie` | Cartões, tabelas, painel |
| `--color-superficie-alta` | Cabeçalho de tabela, bandas, cabeçalho de seção |
| `--color-realce` | Linha sob o cursor |
| `--color-borda` | Contorno de caixa |
| `--color-borda-suave` | Separador entre linhas |
| `--color-tinta` | Texto principal |
| `--color-tinta-fraca` | Texto secundário: categoria, parcela, rótulo |
| `--color-tinta-apagada` | Zero, marcador de vazio, placeholder |
| `--color-acento` | Foco, seleção, ligação |
| `--color-positivo` / `--color-positivo-fundo` | Conferência que bate |
| `--color-negativo` / `--color-negativo-fundo` | Erro e ação destrutiva |
| `--color-atencao` / `--color-atencao-fundo` | Divergência de fatura, aviso |

**Nenhum componente escreve cor literal.** `text-neutral-500` e `bg-neutral-900` desaparecem do
código. É isso que torna "padronizado" verificável por `grep`, e não uma questão de disciplina de
quem escreve.

As cores de **membro, conta e categoria** não são tokens: vêm do banco, por registro, e entram como
`style` inline. São dado, não decisão de design.

### 3.2 Tipografia e dinheiro

A Geist volta a valer, com a remoção da regra `font-family` do `body`.

Todo valor monetário usa `font-variant-numeric: tabular-nums` e alinhamento à direita, para que as
casas decimais empilhem. `formatarBRL` não muda.

A Geist Mono é carregada em `layout.tsx` e não é usada por nada. **Sai** — é um download por
carregamento de página em troca de zero.

### 3.3 Largura mínima

O sistema é desktop-first, como a spec define. Abaixo de 1180px a barra lateral encolhe para só
ícones; abaixo de 1024px a grade rola horizontalmente dentro do próprio contêiner, sem que a página
role na horizontal. **Não há trabalho específico para telas de celular nesta fase.**

## 4. Arquitetura de arquivos

As telas passam para o grupo de rota `(app)/`, que carrega o casco. `/entrar` fica fora dele.
**Grupo de rota não altera URL**: `/despesas` continua `/despesas`, o middleware continua
protegendo tudo, e nenhuma ligação existente quebra.

```
src/app/
  layout.tsx                       html, fontes, tokens — nada mais
  (auth)/entrar/page.tsx           reestilizado, sem casco
  (app)/layout.tsx                 NOVO — o casco
  (app)/despesas/page.tsx          movido; URL igual
  (app)/despesas/error.tsx         NOVO
  (app)/resumo/page.tsx            movido; URL igual
  (app)/resumo/error.tsx           NOVO
  (app)/configuracoes/page.tsx     NOVO

src/components/
  ui/                              gerado pelo shadcn, versionado
  casco/
    barra-lateral.tsx              NOVO
    faixa-competencia.tsx          NOVO — substitui navegacao.tsx
    identidade.tsx                 NOVO — quem está logado, e sair
  despesas/
    chips-conta.tsx                reestilizado
    grade-lancamentos.tsx          reescrito com seções
    secao-pessoa.tsx               NOVO
    painel-lancamento.tsx          NOVO — funde linha-nova e linha-edicao
    dialogo-exclusao.tsx           NOVO
  resumo/
    cartoes-resumo.tsx             NOVO
    matriz-resumo.tsx              reescrito com bandas
    conferencia-fatura.tsx         reestilizado
  configuracoes/
    lista-categorias.tsx           NOVO
    lista-contas.tsx               NOVO
    lista-membros.tsx              NOVO

src/domain/
  agrupamento.ts                   NOVO
  agrupamento.test.ts              NOVO

src/server/
  repositorios/configuracao.ts     NOVO
  actions/configuracao.ts          NOVO
```

**Apagados:** `navegacao.tsx`, `linha-nova.tsx`, `linha-edicao.tsx`.

### 4.1 Componentes shadcn/ui necessários

`button`, `input`, `label`, `select`, `sheet`, `alert-dialog`, `badge`, `sonner`, `switch`.

Vêm com Radix, `class-variance-authority`, `clsx`, `tailwind-merge` e `lucide-react`. O código dos
componentes é copiado para o repositório e fica editável — não é dependência de runtime que decide
o visual por nós. **As variantes padrão do shadcn são reescritas para usar os tokens da seção 3.1**,
senão o sistema nasce parecido com todo projeto shadcn do mundo.

**TanStack Table não é instalada.** Está na stack declarada, mas é um motor de ordenação e filtro
para tabelas grandes; com quarenta linhas agrupadas por pessoa, ordenar são vinte linhas de código.
Entra quando existir ordenação por qualquer coluna de verdade.

## 5. O casco

### 5.1 Barra lateral

**Componente de cliente**, com a identidade passada como filho a partir do servidor. Três blocos:
identidade do sistema no topo, destinos no meio, quem está logado no rodapé.

A escolha não é preferência: **layout do App Router não recebe `searchParams`**, e a barra precisa
da competência para preservá-la ao trocar de tela. Ela lê `usePathname()` e `useSearchParams()`, o
que exige `'use client'` e uma fronteira de `Suspense`. Como `Identidade` precisa de `auth()`, que é
de servidor, ela é renderizada no layout e **passada como `children`** — componente de servidor
dentro de um de cliente é o único arranjo que evita serializar a sessão como prop.

Pelo mesmo motivo, os destinos usam `next/link`, não `<a>`: a barra vive num layout persistente, e
`<a>` puro recarregaria o documento a cada troca de tela, remontando a própria barra e relendo a
sessão — o oposto do que um layout compartilhado existe para fazer.

Destinos ativos: **Despesas**, **Resumo**, **Configurações**. Destinos desabilitados, visíveis com
marca de *em breve*: **Gráficos**, **Lixeira**. Mostrar o que ainda vem evita inventar botão depois
e responde sozinho "cadê o resto".

Trocar de tela **preserva a competência**, como hoje. O filtro de conta não é preservado — o Resumo
e Configurações não têm esse filtro, então não há o que preservar.

No rodapé, nome e avatar de quem está logado, e **sair** — que hoje não existe em lugar nenhum do
sistema.

### 5.2 Faixa de competência

O mês em tipo grande, com `‹` e `›` de cada lado, e os totais do mês à direita: total de cada
membro e o total da fatura de cada conta de cartão.

**A faixa mostra sempre o mês inteiro**, mesmo com filtro de conta ligado. Os subtotais das seções
da grade mostram o que está na tela. Quando houver filtro ativo, a tela diz isso explicitamente —
dois números diferentes sem explicação é exatamente como se perde a confiança numa ferramenta de
dinheiro.

Isso exige que a página de Despesas passe a carregar `carregarParcelasDaCompetencia` e chamar
`calcularResumo`, além do que já carrega. Nenhuma função nova: as duas já existem e já são usadas
pelo Resumo.

## 6. Despesas

### 6.1 Agrupamento

Subtotal é conta, e `docs/arquitetura.md` é explícito: componente não calcula. Nasce
`src/domain/agrupamento.ts`, puro e testado.

```ts
export type ItemAgrupavel = { chave: string; valorCentavos: Centavos };

export type Grupo<T> = {
  chave: string;
  itens: T[];
  subtotalCentavos: Centavos;
  quantidade: number;
};

export function agrupar<T extends ItemAgrupavel>(
  itens: T[],
  ordemDasChaves: readonly string[],
): Grupo<T>[];
```

A ordem dos grupos vem de `ordemDasChaves`, **explícita**, nunca da ordem de chegada dos itens.
Já houve nesta base um bug em que a ordem vinha do Postgres e o resultado mudava entre
carregamentos da mesma página; a assinatura fecha essa porta.

Grupos sem itens **são devolvidos**, com subtotal zero. Uma pessoa sem gasto no filtro atual deve
aparecer zerada, não sumir — sumir parece falta de dado. Quando *todos* os grupos estão vazios, o
componente mostra o estado vazio da tela inteira em vez de três seções zeradas.

A chave é o `membroId` quando o escopo é `PESSOAL`, e uma constante literal — `'CONJUNTO'` — quando
é conjunto. Nenhum `membroId` pode colidir com ela, porque ids são `cuid()`. `agrupar` não sabe o
que é `LinhaGrade`: o componente mapeia para `ItemAgrupavel` antes de chamar. É isso que mantém o
domínio ignorante da camada de servidor.

Ordem das seções: os membros na ordem `criadoEm asc` que as páginas já usam, e **Conjunto por
último**. `docs/decisoes.md` registra que a ordem de exibição não muda com a regra da sobra de
centavos; isso continua valendo.

### 6.2 A grade

Uma linha por parcela, como sempre — `docs/decisoes.md`, "a grade mostra parcela, nunca lançamento".

O que muda é o peso:

- **Descrição** em primeiro plano
- **Categoria** com ponto colorido, usando `Categoria.cor`, em tinta fraca
- **Parcela** em tinta fraca; o `—` some quando a compra é à vista
- **Valor** tabular, à direita, com peso
- **Data da compra** em tinta fraca, e **esmaecida quando repete a da linha imediatamente acima,
  dentro da mesma seção** — a primeira linha de cada seção nunca esmaece. Numa grade de setembro
  quase toda linha é parcela de compra de meses atrás, e a data repete muito
- **Cabeçalho de seção** com a faixa colorida do membro (`Membro.cor`), o nome, a contagem e o
  subtotal

A coluna "De quem" **desaparece**: virou o próprio grupo.

**Editar e excluir só aparecem na linha sob o cursor**, como ícones, e permanecem alcançáveis por
teclado — visíveis ao receber foco, não só ao passar o mouse. Hoje são dois links sublinhados em
cada linha, um deles vermelho.

O vermelho passa a significar **apenas erro**. A ação de excluir é neutra até o momento da
confirmação.

### 6.3 Painel de lançamento

`linha-nova.tsx` e `linha-edicao.tsx` viram **um componente só**. Hoje são dois arquivos repetindo
os mesmos oito campos, o mesmo `FormData` e o mesmo `reaisParaCentavos` — e a duplicação já
produziu divergência real: só um dos dois avisa antes de regerar as parcelas.

O painel abre pela direita (`Sheet`), sobre a lista, que continua visível atrás. Campos com rótulo
permanente, agrupados: descrição; data e valor; de quem e parcelas; conta e categoria.

**Comportamentos que vêm de `linha-edicao.tsx` e não podem se perder na fusão:**

1. Em caso de recusa — `CONFLITO` ou `FATURA_TRAVADA` — **o formulário nunca reseta**
2. Os campos usam `defaultValue`, não são controlados, para que o re-render vindo do
   `revalidatePath` do próprio server action não apague o que a pessoa digitou
3. No conflito, o estado atual gravado é exibido junto da mensagem
4. Ao editar um lançamento com mais de uma parcela, avisa **antes de enviar** que todas serão
   regeradas
5. `origemValor` viaja escondido, igual ao que já estava gravado

**Acréscimo:** acima do botão de salvar, a competência calculada e o motivo —
*"cai na fatura de outubro/2026 — o C6 fecha dia 4"*. Chama `competenciaDeCartao` ou
`competenciaDeContaExterna` conforme o tipo da conta escolhida; ambas são puras e rodam no cliente.

Essa regra existe no domínio desde a Fase 1 e **nunca apareceu na tela**. Sem ela, quem lança uma
compra do dia 5 no C6 não entende por que a linha não aparece no mês.

### 6.4 Exclusão

`window.confirm` sai. Entra `AlertDialog` com a mensagem que `mensagemExclusao()` já monta hoje:
quantas parcelas somem, e de que mês a que mês.

**A função não muda** — só o invólucro. Ela já resolve o caso difícil, que é a pessoa vendo "3/12"
não ter como adivinhar que as doze somem.

## 7. Resumo

### 7.1 Cartões

Três, no topo: total de cada membro e a fatura de cada conta de cartão, esta com a situação da
conferência como selo (`bate` / `falta lançar` / `sobra`). Abaixo de cada número, em tinta fraca, a
composição — *"423,75 próprio + 50,50 da metade"*.

Os valores saem do mesmo `ResumoMes` que alimenta a matriz. **Não há segunda fonte de verdade**, e
não há cálculo no componente.

### 7.2 Matriz

As mesmas oito linhas de hoje, sem tirar nenhuma, separadas em três bandas rotuladas:

| Banda | Linhas |
|---|---|
| Gastos do mês | Cada membro, e Conjunto |
| Rateio do conjunto | O que cabe a cada membro |
| Resultado | Total de cada membro, e Somado |

A banda de resultado tem peso visual. Os rótulos deixam de ser `Metade · Nardy` e passam a dizer o
que significam.

**As duas linhas de metade continuam separadas.** Juntá-las numa só — como no protótipo original —
esconde o centavo de sobra: num conjunto de R$ 83,95 as metades são 41,98 e 41,97, e uma linha só
teria que mentir uma delas. `docs/decisoes.md` documenta esse centavo com cuidado; a tela não vai
apagá-lo.

Zero vira `—` em tinta apagada. Coluna zerada não deve pesar igual a valor real.

Cada membro leva sua faixa colorida, e a leitura horizontal — quanto alguém gastou dentro e fora da
fatura — fica visível, que é a razão de a matriz existir.

### 7.3 Conferência da fatura

Deixa de ser frase solta com um campo de texto no meio e vira faixa própria no rodapé da matriz:
nome da conta, campo do valor do extrato, situação como selo, e o estado atual da fatura em texto.

**O estado da fatura é somente leitura.** Travar e destravar não entram nesta spec — ver seção 12.

## 8. Configurações

É a maior fatia de trabalho desta spec, e **não é trabalho visual**: é CRUD, com repositório e
actions novos. Fica registrado para que ninguém a subestime no planejamento.

| Entidade | O que a tela faz |
|---|---|
| **Categoria** | Criar, renomear, trocar a cor, arquivar e desarquivar |
| **Conta** | Editar nome, cor, dia de fechamento, dia de vencimento e se está ativa |
| **Membro** | Editar nome e cor; escolher quem absorve a sobra de centavos |

**Criar conta fica de fora.** Conta nova tem consequência sobre faturas e sobre a matriz do Resumo;
é decisão de produto, não de configuração, e não foi pedida.

`Categoria.icone` existe no schema, é opcional e não é usado por nada. Continua sem uso — ícone por
categoria não foi pedido, e a cor já resolve a distinção visual.

### 8.1 Regras da camada de servidor

- Toda action **valida com Zod e exige sessão**, como todas as outras
- Cor validada como `#RRGGBB`
- Nome de categoria é `@unique` no schema: a colisão volta como
  `{ ok: false, motivo: 'NOME_DUPLICADO' }`, tratável, **nunca como exceção**
- **`absorveSobra` é escolha única.** Marcar um membro desmarca o outro, **dentro de uma
  `prisma.$transaction`**. `docs/decisoes.md` diz que exatamente um membro deve ter `true` e que
  hoje isso é conferido à mão; a tela passa a impor. A transação não é opcional: já existe nesta
  base um problema conhecido de `gravarFilhos` fazer `deleteMany` e `createMany` sem transação, e
  não faz sentido repetir o erro num código novo
- Arquivar categoria **não apaga nada** e não toca nos lançamentos que a usam. Categoria arquivada
  some das opções de lançamento novo e continua aparecendo nos lançamentos antigos

## 9. Login

Reestilizado para a mesma linguagem: superfície clara, tipografia do sistema, o botão do Google com
o peso de ação primária. Sem casco, porque não há sessão ainda. A lógica de `signIn` não muda.

## 10. Erros e estados vazios

| Situação | Hoje | Passa a ser |
|---|---|---|
| Mês sem lançamento | Frase cinza | Estado vazio desenhado, com o botão de lançar |
| Filtro de conta sem resultado | Mesma frase | Estado próprio, dizendo que o filtro é a causa e oferecendo limpá-lo |
| `calcularResumo` lança | Tela branca | `error.tsx` na rota, dizendo que há dado incoerente e alguém precisa olhar |
| Recusa de gravação | Texto vermelho no formulário | Mesma mensagem, no painel, com o estado atual quando houver conflito |
| Sucesso ao salvar | Nada | Aviso breve (`sonner`), para as ações sem resultado visível na tela |

O `error.tsx` do Resumo merece nota. `calcularResumo` **lança de propósito** para entrada incoerente
— conta desconhecida, parcela pessoal sem membro, cotas que não fecham — e `docs/arquitetura.md`
proíbe embrulhar em `try/catch` "para a tela não quebrar". A fronteira de erro **não engole a
exceção**: ela troca a tela branca por uma mensagem honesta, e o erro continua chegando ao log.

## 11. O que não muda

Vale listar, porque é o que garante que este trabalho não pode quebrar nenhum número:

- Nada em `src/domain/`, exceto o `agrupamento.ts` novo
- Nenhum repositório existente
- Nenhuma assinatura de action existente
- Nenhuma migration, nenhum campo novo, nenhum invariante alterado
- Nenhuma URL
- Os 96 testes atuais passam sem um toque

## 12. Fora do escopo

Descartados nesta conversa, **não por esquecimento**:

- **Gráficos.** Precisa de Recharts, consultas que atravessam meses e decisões de regra em aberto.
  Fase 2, e provavelmente spec própria
- **Lixeira.** O `deletadoEm` já é gravado; falta listagem e restauração. Fase 3
- **Travar e destravar fatura.** Fica como **lacuna conhecida**: a interface continua dizendo
  *"destrave a fatura"* apontando para uma ação que só existe por SQL direto. Esta spec não piora e
  não resolve
- **Tema escuro construído.** Seção 2.2
- **Criar conta** pela tela. Seção 8
- **TanStack Table.** Seção 4.1
- **Layout A**, em painéis. Seção 2.1
- **Trabalho específico para celular.** Seção 3.3

## 13. Verificação

**O domínio tem teste, o visual não tem — e não vale fingir que tem.**

- `agrupamento.ts` ganha teste em Vitest, cobrindo subtotal, grupo vazio, ordem explícita das
  chaves e a soma dos subtotais fechando com o total
- As actions de configuração ganham teste de repositório no mesmo padrão dos que já existem,
  incluindo a invariante de `absorveSobra` e a colisão de nome. **Esses testes tocam o banco e
  ficam atrás de `TESTE_DESTRUTIVO=1`, como os seis que já existem** — ou seja, não rodam no
  `npm test` do dia a dia, e a suíte se recusa a rodar se houver lançamento no banco
- O restante é **verificação visual**: subir o app com `scripts/dados-ficticios.ts`, conferir tela
  por tela no navegador, mais `npm run build` e `npm run lint`

Não há teste de componente no projeto. `docs/decisoes.md` explica por quê — sem
`@vitejs/plugin-react` até existir o primeiro — e o único teste de Playwright está pulado por
exigir login. **Cobertura automatizada desta camada é uma decisão à parte**, que muda aquela, e não
está sendo tomada aqui.

Um `grep` por `neutral-`, `zinc-`, `gray-` e `#` fora de `globals.css` e dos campos de cor do banco
deve voltar vazio ao final. É o que torna "padronizado" uma afirmação verificável.

## 14. Riscos

1. **Configurações é a maior parte do trabalho e a menos visual.** Se o prazo apertar, é a fatia
   que se corta inteira sem prejudicar o resto — as outras telas não dependem dela
2. **A fusão de `linha-nova` e `linha-edicao` é onde se perde comportamento.** A seção 6.3 lista os
   cinco que precisam sobreviver; cada um custou correção para existir
3. **Reescrever as variantes do shadcn é fácil de pular.** Se ficarem no default, o sistema nasce
   com a aparência genérica de todo projeto shadcn, e a decisão de instalar terá sido paga sem o
   benefício
4. **A faixa de competência acrescenta uma consulta à página de Despesas.** É a mesma que o Resumo
   já faz, mas dobra a leitura de parcelas do mês. Com dois usuários e quarenta linhas isso é
   irrelevante; fica anotado para não virar surpresa
