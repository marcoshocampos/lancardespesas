# Etapa 02 — Casco

Substitui a pilha de três fileiras de pílulas por três camadas distintas: barra lateral, faixa de
competência e (na Etapa 03) os filtros. Ao fim, o sistema tem identidade, tem como sair, e mostra
os totais do mês na tela onde se passa o tempo.

**Depende da Etapa 01.**

---

## Restrição do Next que decide o desenho

**Layout do App Router não recebe `searchParams`.** A competência mora na query string, então o
casco não pode simplesmente lê-la do layout. A saída, e o motivo de os componentes serem divididos
como estão abaixo:

- **`barra-lateral.tsx` é componente de cliente** e usa `usePathname()` e `useSearchParams()` para
  saber onde está e preservar a competência ao trocar de tela. Fica no layout.
- **`faixa-competencia.tsx` é componente de servidor** e recebe tudo por prop. Fica em **cada
  página**, que é quem tem `searchParams`.

`useSearchParams()` exige fronteira de `Suspense` no build do Next. Sem ela o `npm run build`
falha com *"useSearchParams should be wrapped in a suspense boundary"*. Está previsto no Passo 3
da Tarefa 2.

---

## Tarefa 1 — Grupo de rota

**Arquivos:**
- Cria: `src/app/(app)/layout.tsx`
- Move: `src/app/despesas/` → `src/app/(app)/despesas/`
- Move: `src/app/resumo/` → `src/app/(app)/resumo/`

**Grupo de rota não altera URL.** `/despesas` continua `/despesas`, o `src/middleware.ts` continua
protegendo, e nenhuma ligação existente quebra. Confirme isso no navegador antes de seguir — é
barato conferir e caro descobrir depois.

- [ ] **Passo 1: mover com o git, preservando histórico**

```bash
mkdir -p "src/app/(app)"
git mv src/app/despesas "src/app/(app)/despesas"
git mv src/app/resumo "src/app/(app)/resumo"
```

- [ ] **Passo 2: criar o layout do grupo**

`src/app/(app)/layout.tsx` — servidor. Estrutura: `flex` na horizontal, barra lateral à esquerda
com largura fixa, `main` ocupando o resto com `min-w-0` (sem isso a grade larga estoura o flex em
vez de rolar dentro do próprio contêiner).

O `Identidade` é renderizado aqui e **passado como filho** para a `BarraLateral`. Isso é
proposital: a barra é componente de cliente e a identidade precisa de `auth()`, que é de servidor.
Componente de servidor passado como `children` para um de cliente resolve, e é o único jeito que
funciona sem transformar a sessão em prop serializada.

- [ ] **Passo 3: verificar**

`npm run dev`, abrir `/despesas` e `/resumo`. As URLs devem estar idênticas às de antes e o
middleware deve continuar redirecionando quem não tem sessão.

- [ ] **Passo 4: commitar**

```bash
git add -A "src/app"
git commit -m "Agrupa as telas com sessao sob um casco comum"
```

---

## Tarefa 2 — Barra lateral

**Arquivos:**
- Cria: `src/components/casco/barra-lateral.tsx`
- Cria: `src/components/casco/identidade.tsx`

**Produz:**

```ts
export function BarraLateral({ children }: { children: React.ReactNode }): JSX.Element;
export async function Identidade(): Promise<JSX.Element>;
```

- [ ] **Passo 1: escrever a `BarraLateral`**

`'use client'`. Três blocos empilhados: nome do sistema no topo, destinos no meio, `children` (a
identidade) no rodapé, empurrado por `mt-auto`.

Destinos, nesta ordem:

| Rótulo | Rota | Estado |
|---|---|---|
| Despesas | `/despesas` | ativo |
| Resumo | `/resumo` | ativo |
| Gráficos | — | desabilitado, marca *em breve* |
| Configurações | `/configuracoes` | ativo **a partir da Etapa 06** |
| Lixeira | — | desabilitado, marca *em breve* |

Até a Etapa 06 existir, **Configurações também fica desabilitado**. `docs/arquitetura.md` é
explícito: acrescente o destino em navegação só depois que a página existir.

Regras de comportamento:

- O destino atual sai de `usePathname()`, comparando o começo do caminho
- **Trocar de tela preserva a competência**, lida de `useSearchParams()`. O filtro de conta **não**
  é preservado — Resumo e Configurações não têm esse filtro, então não há o que preservar
- Destino desabilitado é `<span>`, não `<a>`. Link que não leva a lugar nenhum é pior que texto
- Abaixo de 1180px a barra encolhe para só ícones; o rótulo vira `sr-only`

- [ ] **Passo 2: escrever a `Identidade`**

Componente de servidor `async`. Lê a sessão com `auth()` de `@/server/auth`, mostra nome e inicial,
e um formulário com action de servidor chamando `signOut`.

Siga o padrão que `src/app/(auth)/entrar/page.tsx` já usa para o `signIn` — action inline com
`'use server'`. **Sair não existe hoje em lugar nenhum do sistema**; é acréscimo desta tarefa.

- [ ] **Passo 3: montar no layout com `Suspense`**

Em `src/app/(app)/layout.tsx`, envolva a `BarraLateral` numa fronteira de `Suspense`, porque ela
usa `useSearchParams()`:

```tsx
<Suspense fallback={<div className="w-56 shrink-0 border-r border-borda" />}>
  <BarraLateral>
    <Identidade />
  </BarraLateral>
</Suspense>
```

O `fallback` reserva a mesma largura da barra para a tela não pular ao hidratar.

- [ ] **Passo 4: verificar**

```bash
npm run build
```

Deve passar. Se falhar com *"useSearchParams should be wrapped in a suspense boundary"*, o `Suspense`
do Passo 3 não está no lugar certo.

No navegador: trocar de Despesas para Resumo mantém o mês; o destino atual está destacado; `Tab`
alcança todos os destinos e o botão de sair; Gráficos e Lixeira não são focáveis.

- [ ] **Passo 5: commitar**

```bash
git add src/components/casco "src/app/(app)/layout.tsx"
git commit -m "Da ao sistema uma barra lateral, identidade e como sair"
```

---

## Tarefa 3 — Faixa de competência

**Arquivos:**
- Cria: `src/components/casco/faixa-competencia.tsx`
- Modifica: `src/app/(app)/despesas/page.tsx`
- Modifica: `src/app/(app)/resumo/page.tsx`
- Apaga: `src/components/navegacao.tsx`

**Consome:** `avancarCompetencia` e `formatarCompetencia` de `@/domain/competencia`;
`COLUNA_TOTAL` e `calcularResumo` de `@/domain/totais`.

**Produz:**

```ts
type TotalDeMembro = { membroId: string; nome: string; cor: string; centavos: number };
type TotalDeFatura = { contaId: string; nome: string; centavos: number };

export function FaixaCompetencia(props: {
  competencia: string;
  rota: '/despesas' | '/resumo';
  conta?: string | undefined;
  totais?: { membros: TotalDeMembro[]; faturas: TotalDeFatura[] } | undefined;
  filtroAtivo?: boolean;
}): JSX.Element;
```

- [ ] **Passo 1: escrever o componente**

Servidor, sem estado. À esquerda, `‹` mês `›` — o mês em tipo grande, com
`formatarCompetencia(competencia)`. As setas usam `avancarCompetencia(competencia, -1)` e `(+1)`, e
preservam o filtro de conta quando ele existe, exatamente como `navegacao.tsx` faz hoje.

À direita, quando `totais` vier: um total por membro, com a faixa de `cor`, e um por conta de
cartão. Quando não vier, nada.

Quando `filtroAtivo` for verdadeiro, acrescente em tinta fraca que **os totais são do mês inteiro,
não do filtro**. Dois números diferentes na mesma tela sem explicação é como se perde a confiança
numa ferramenta de dinheiro.

- [ ] **Passo 2: alimentar a página de Despesas**

`src/app/(app)/despesas/page.tsx` passa a carregar também as parcelas do mês e a calcular o resumo.
Acrescente ao `Promise.all` existente:

```ts
carregarParcelasDaCompetencia(competencia),
```

E depois dele:

```ts
const membroIds = membros.map((m) => m.id);
const resumo = calcularResumo(parcelas, membroIds, contas.map((c) => c.id));

const totais = {
  membros: membros.map((m) => ({
    membroId: m.id,
    nome: m.nome,
    cor: m.cor,
    centavos: resumo.totalGeral[m.id]?.[COLUNA_TOTAL] ?? 0,
  })),
  faturas: contas
    .filter((c) => c.tipo === 'CARTAO')
    .map((c) => ({ contaId: c.id, nome: c.nome, centavos: resumo.somado[c.id] ?? 0 })),
};
```

**Nenhuma função nova.** `carregarParcelasDaCompetencia` e `calcularResumo` já existem e já são
usadas pela página de Resumo, do mesmo jeito.

Passe `filtroAtivo={Boolean(conta)}`.

- [ ] **Passo 3: alimentar a página de Resumo**

Trocar `<Navegacao ... />` por `<FaixaCompetencia competencia={competencia} rota="/resumo" />`,
**sem `totais`**. Os cartões da Etapa 05 ficam logo abaixo e já carregam os números; mostrar duas
vezes cria duas fontes de verdade na mesma tela.


- [ ] **Passo 3b: remover o `<main>` interno das duas páginas**

`src/app/(app)/layout.tsx` passou a ter o seu próprio `<main>` na Etapa 02 Tarefa 1, e
`despesas/page.tsx` e `resumo/page.tsx` **ainda têm o deles**. Ficaram dois landmarks `main`
aninhados, o que o modelo de conteúdo do HTML não permite — `main` não pode ter `main` como
descendente — e que ferramenta de acessibilidade acusa como landmark inválido.

Nas duas páginas, o `<main className="mx-auto max-w-...">` vira um `<div>` com as mesmas classes
de largura e espaçamento. O `<main>` do layout do grupo é o único que fica.

**Este passo é obrigatório e foi acrescentado depois que o plano foi escrito.** A revisão da
Tarefa 1 mostrou que o aninhamento sobreviveria a esta etapa se ninguém o tratasse como item
próprio: os outros passos só mexem no conteúdo *dentro* do `<main>`, nunca nele.

- [ ] **Passo 4: apagar a `navegacao.tsx`**

```bash
git rm src/components/navegacao.tsx
```

Confirme com `grep -rn "navegacao" src/` que não sobrou importação.

- [ ] **Passo 5: verificar**

```bash
npm run build && npm run lint && npm test
```

Depois, com `npx tsx scripts/dados-ficticios.ts criar`, abrir `/despesas`. Confira que os totais da
faixa **batem com os da tela de Resumo do mesmo mês** — é o mesmo `calcularResumo`, então divergir
significa que a montagem está errada. Depois clique num chip de conta e confira que a faixa
continua mostrando o mês inteiro e diz isso.

- [ ] **Passo 6: commitar**

```bash
git add -A src
git commit -m "Traz os totais do mes para a tela onde se lanca"
```

---

## Como saber que a etapa terminou

- `npm run build`, `npm run lint` e `npm test` limpos
- `/despesas` e `/resumo` respondem nas mesmas URLs
- Trocar de tela preserva o mês; trocar de mês preserva o filtro de conta
- Sair encerra a sessão e cai em `/entrar`
- `src/components/navegacao.tsx` não existe mais
