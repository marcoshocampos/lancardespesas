# Etapa 01 — Fundação · **concluída**

Tarefas 1 e 2. O esqueleto do projeto e os dois tipos-base de que todo o resto depende.

O código completo desta etapa saiu deste documento de propósito: ele existe em `src/`,
revisado e coberto por testes. O que fica aqui é **o que foi feito e por quê** — a parte que
o código não conta sozinho.

---

## Tarefa 1 — Scaffold, TypeScript estrito e Vitest

**Commits:** `50e6413`, `e200f8c`
**Arquivos:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`,
`eslint.config.mjs`, `src/app/`, `AGENTS.md`

Next.js 16.3 com App Router, React 19.2, Tailwind 4, TypeScript estrito e Vitest 4.

Cinco opções ligadas no `tsconfig.json`, além do `strict`: `noUncheckedIndexedAccess`,
`noImplicitOverride`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames`.
A que mais paga é a primeira — acessar `parcelas[i]` passa a devolver `T | undefined` e
exigir tratamento, que é exatamente onde erro de índice em geração de parcelas se esconde.

Três coisas que a revisão examinou e vale não desfazer:

- **`passWithNoTests: true` no `vitest.config.ts`.** Sem ele, `vitest run` sai com código 1
  quando não há nenhum arquivo de teste, o que quebraria a verificação da própria tarefa.
- **`AGENTS.md` existe de propósito.** O Next escreve instruções de agente no `CLAUDE.md`
  quando não encontra um `AGENTS.md`. Com o arquivo presente, ele pula — o que protege o
  `CLAUDE.md` de ser reescrito por um `npm run dev` qualquer.
- **Não há `@vitejs/plugin-react`.** A Fase 1 não tem teste de componente: os testes de
  domínio rodam em `environment: 'node'` e os de UI são Playwright, na tarefa 11. O plugin
  entra quando o primeiro teste de componente existir, não antes.

---

## Tarefa 2 — `domain/money.ts` e `domain/data.ts`

**Commit:** `fa408de` · **13 testes**
**Arquivos:** `src/domain/money.ts`, `src/domain/data.ts`, e os `.test.ts` irmãos

Os dois tipos-base. Juntos numa tarefa porque nenhum dos dois sozinho é revisável de forma
útil.

```ts
type Centavos = number;                        // inteiro, sempre
type DataISO  = string;                        // "AAAA-MM-DD", nunca Date

reaisParaCentavos(texto: string): Centavos     // "R$ 474,25" → 47425
formatarBRL(valor: Centavos): string           // 102551 → "R$ 1.025,51"
partesDaData(d: DataISO): { ano, mes, dia }    // valida formato e calendário
ultimoDiaDoMes(ano, mes): number               // conhece bissexto
```

`reaisParaCentavos` aceita o que a pessoa realmente digita na grade: com `R$` ou sem, com
ponto de milhar ou sem, com sinal negativo para estorno. Recusa o resto.

`partesDaData` faz a validação de calendário — `2026-02-30` é recusada. As tarefas seguintes
não reimplementam validação de data, chamam esta.

**Nenhum `Date` em `src/domain/`.** É a decisão que elimina a classe inteira de bugs de fuso
antes de eles existirem, e é verificada em toda revisão de tarefa do domínio.

### Ponto em aberto herdado desta tarefa

`reaisParaCentavos('12,3,4')` devolve `1230` em silêncio em vez de lançar `Valor invalido` —
a desestruturação `split(',')` descarta tudo depois da segunda vírgula. Entrada plausível
produzindo valor de dinheiro errado sem aviso. Registrado como pendência menor na
[revisão final](../../estado.md#pend%C3%AAncias-menores-para-triar).
