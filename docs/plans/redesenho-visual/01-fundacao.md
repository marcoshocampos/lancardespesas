# Etapa 01 — Fundação

Entrega os tokens, corrige as duas causas do visual atual, instala o shadcn e o reveste com as
cores da casa. Ao fim desta etapa **nenhuma tela mudou de estrutura**, mas todas mudaram de cara.

Leia as [restrições globais](README.md#restrições-globais) antes de começar.

---

## Tarefa 1 — Tokens e a correção da base

**Arquivos:**
- Reescreve: `src/app/globals.css`
- Modifica: `src/app/layout.tsx`

**Produz:** os tokens que todas as tarefas seguintes consomem. Os nomes abaixo são contrato —
tarefas posteriores escrevem `bg-superficie`, `text-tinta-fraca`, `border-borda` esperando que
existam.

### Por que isto é a primeira tarefa

Duas linhas explicam quase tudo que está errado hoje:

- `body { font-family: Arial, Helvetica, sans-serif }` **anula a Geist** que o `layout.tsx` carrega
- `@media (prefers-color-scheme: dark)` faz o sistema virar preto seguindo o sistema operacional,
  com dois tokens só, o que produz o cinza ilegível sobre preto

- [ ] **Passo 1: reescrever `globals.css`**

Substitui o arquivo inteiro. Não preserve nada do `create-next-app`.

```css
@import "tailwindcss";

@theme {
  /* Superfícies */
  --color-fundo: #f7f7f5;
  --color-superficie: #ffffff;
  --color-superficie-alta: #fbfaf8;
  --color-realce: #f4f2ef;

  /* Linhas */
  --color-borda: #e6e4e0;
  --color-borda-suave: #f1efec;

  /* Tinta */
  --color-tinta: #1a1917;
  --color-tinta-fraca: #6b6760;
  --color-tinta-apagada: #a8a39b;

  /* Semânticos */
  --color-acento: #155e63;
  --color-positivo: #166534;
  --color-positivo-fundo: #e8f3ec;
  --color-negativo: #b3261e;
  --color-negativo-fundo: #fdecea;
  --color-atencao: #8a5209;
  --color-atencao-fundo: #fdf1e3;

  /* Raios */
  --radius-caixa: 0.5rem;
  --radius-campo: 0.375rem;

  /* Sombra do painel lateral */
  --shadow-painel: -8px 0 32px rgb(26 25 23 / 0.10);

  --font-sans: var(--font-geist-sans);
}

body {
  background: var(--color-fundo);
  color: var(--color-tinta);
}
```

**Sobre contraste.** `--color-tinta-fraca` sobre `--color-superficie` fica em ~5,5:1 e serve para
texto de verdade. `--color-tinta-apagada` fica em **2,5:1** e **só pode ser usada em elemento
decorativo** — o travessão que substitui zero, o placeholder de campo. Nunca em texto que alguém
precise ler.

**Sobre o escuro.** Não escreva bloco escuro nenhum, e não recoloque o `prefers-color-scheme`. A
§2.2 da spec explica: sem a tabela `Preferencia`, que é de Fase 2, o escuro seria meio-recurso.

- [ ] **Passo 2: corrigir o `layout.tsx`**

Três mudanças:

1. `lang="en"` vira `lang="pt-BR"`
2. Remover a importação e a variável da **Geist Mono** — ela é carregada e não é usada por nada, o
   que é um download por carregamento de página em troca de zero
3. Remover `className` de cor no `body`, que agora vem do CSS

- [ ] **Passo 3: verificar**

```bash
npm run build
```

Depois `npm run dev`, abrir `/entrar` e conferir três coisas: a fonte **não** é Arial (o `a` da
Geist tem terminal reto), o fundo é claro **mesmo com o sistema operacional em modo escuro**, e o
`<html>` tem `lang="pt-BR"` no inspetor.

- [ ] **Passo 4: commitar**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "Troca o CSS de exemplo do Next pelos tokens da casa"
```

---

## Tarefa 2 — shadcn/ui instalado e revestido

**Arquivos:**
- Cria: `components.json`, `src/lib/utils.ts`, `src/components/ui/*`
- Modifica: `package.json`

**Consome:** os tokens da Tarefa 1.
**Produz:** `Button`, `Input`, `Label`, `Select`, `Sheet`, `AlertDialog`, `Badge`, `Switch` e o
`Toaster` do `sonner`, todos já vestidos com os tokens da casa.

- [ ] **Passo 1: inicializar**

```bash
npx shadcn@latest init
```

Responda de forma a **não** deixar o gerador reescrever `globals.css`. Se ele insistir em
sobrescrever, deixe, e restaure o bloco `@theme` da Tarefa 1 por cima — os tokens da casa mandam.

- [ ] **Passo 2: adicionar só o que a spec pede**

```bash
npx shadcn@latest add button input label select sheet alert-dialog badge switch sonner
```

Nada além disso. Cada componente a mais é código gerado que alguém vai ter que manter.

- [ ] **Passo 3: reescrever as variantes**

Esta é a parte que se pula e é a razão de ter instalado. Percorra cada arquivo em
`src/components/ui/` e troque as classes padrão do shadcn pelos tokens da casa:

| Onde o shadcn usa | Passa a usar |
|---|---|
| `bg-background` | `bg-fundo` |
| `bg-card`, `bg-popover` | `bg-superficie` |
| `bg-muted`, `bg-accent` | `bg-superficie-alta` ou `bg-realce` |
| `text-foreground` | `text-tinta` |
| `text-muted-foreground` | `text-tinta-fraca` |
| `border-input`, `border-border` | `border-borda` |
| `bg-destructive`, `text-destructive` | `bg-negativo`, `text-negativo` |
| `ring-ring`, foco | `ring-acento` |
| `rounded-md` em campo | `rounded-campo` |
| `rounded-lg` em caixa | `rounded-caixa` |

**Se ficarem no default, o sistema nasce com a cara genérica de todo projeto shadcn e a decisão de
instalar terá sido paga sem o benefício.** É o risco 3 da spec.

- [ ] **Passo 4: montar o `Toaster`**

Acrescente `<Toaster />` ao `src/app/layout.tsx`, dentro do `body`. Configure para posição inferior
direita e duração curta — ele serve só para ação sem resultado visível na tela.

- [ ] **Passo 5: verificar**

```bash
npm run build && npm run lint
```

- [ ] **Passo 6: commitar**

```bash
git add package.json package-lock.json components.json src/lib src/components/ui src/app/layout.tsx
git commit -m "Instala o shadcn e o veste com as cores da casa"
```

---

## Tarefa 3 — Tela de entrada

**Arquivos:**
- Modifica: `src/app/(auth)/entrar/page.tsx`

**Consome:** tokens da Tarefa 1, `Button` da Tarefa 2.

É a menor tela do sistema e a primeira que alguém vê. Fica nesta etapa porque não depende do casco
— não há sessão ainda, então não há barra lateral.

- [ ] **Passo 1: reestilizar**

Mantenha a estrutura: `main` centralizado, título, subtítulo, formulário com `signIn`. Troque as
cores literais (`text-neutral-500`, `border-neutral-300`, `hover:bg-neutral-50`) pelos tokens, e o
`button` cru pelo `Button` do shadcn com peso de ação primária.

**Não toque na lógica de `signIn`.** A action de servidor e o `redirectTo: '/despesas'` ficam
exatamente como estão.

- [ ] **Passo 2: verificar**

`npm run build`, depois abrir `/entrar` e conferir que o botão tem estado de foco visível pelo
teclado (`Tab` até ele) usando `ring-acento`.

- [ ] **Passo 3: commitar**

```bash
git add "src/app/(auth)/entrar/page.tsx"
git commit -m "Veste a tela de entrada com a linguagem visual nova"
```

---

## Como saber que a etapa terminou

- `npm run build` e `npm run lint` limpos
- `npm test` sem regressão (hoje: 100 passando, 7 pulados)
- `/entrar` renderiza claro, com Geist, mesmo em sistema operacional escuro
- `grep -rn "neutral-\|zinc-\|gray-" src/app src/components --include=*.tsx` devolve resultado
  **apenas** dentro de `src/components/ui/` que ainda não foi revestido — e idealmente vazio
