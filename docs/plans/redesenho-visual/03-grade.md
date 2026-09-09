# Etapa 03 — Grade em seções por pessoa

A única etapa com ciclo TDD de verdade: o subtotal é conta, e conta mora no domínio.

**Depende das Etapas 01 e 02.**

---

## Tarefa 1 — `agrupamento.ts` no domínio

**Arquivos:**
- Cria: `src/domain/agrupamento.ts`
- Cria: `src/domain/agrupamento.test.ts`

**Por que no domínio.** `docs/arquitetura.md` é categórico: componente não calcula. Subtotal é
soma, então é domínio. A função **não sabe o que é `LinhaGrade`** — recebe uma forma mínima, e é o
componente que mapeia antes de chamar. É isso que mantém `src/domain/` ignorante da camada de
servidor.

**Produz:**

```ts
import type { Centavos } from './money';

export type ItemAgrupavel = { chave: string; valorCentavos: Centavos };

export type Grupo<T> = {
  chave: string;
  itens: T[];
  subtotalCentavos: Centavos;
  quantidade: number;
};

export function agrupar<T extends ItemAgrupavel>(
  itens: readonly T[],
  ordemDasChaves: readonly string[],
): Grupo<T>[];
```

- [ ] **Passo 1: escrever o teste que falha**

`src/domain/agrupamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agrupar } from './agrupamento';

const NARDY = 'membro-nardy';
const NICK = 'membro-nick';
const CONJUNTO = 'CONJUNTO';
const ORDEM = [NARDY, NICK, CONJUNTO];

function item(chave: string, valorCentavos: number) {
  return { chave, valorCentavos };
}

describe('agrupar', () => {
  it('soma o subtotal de cada grupo e conta os itens', () => {
    const grupos = agrupar(
      [item(NARDY, 10000), item(NICK, 30000), item(NARDY, 4951)],
      ORDEM,
    );

    expect(grupos[0]).toEqual({
      chave: NARDY,
      itens: [item(NARDY, 10000), item(NARDY, 4951)],
      subtotalCentavos: 17905,
      quantidade: 2,
    });
    expect(grupos[1]?.subtotalCentavos).toBe(30000);
  });

  it('devolve os grupos na ordem pedida, nao na ordem de chegada', () => {
    const grupos = agrupar([item(CONJUNTO, 100), item(NARDY, 200)], ORDEM);

    expect(grupos.map((g) => g.chave)).toEqual([NARDY, NICK, CONJUNTO]);
  });

  it('devolve grupo vazio com subtotal zero em vez de omiti-lo', () => {
    const grupos = agrupar([item(NARDY, 500)], ORDEM);

    expect(grupos).toHaveLength(3);
    expect(grupos[1]).toEqual({ chave: NICK, itens: [], subtotalCentavos: 0, quantidade: 0 });
  });

  it('preserva a ordem dos itens dentro do grupo', () => {
    const grupos = agrupar(
      [item(NARDY, 300), item(NICK, 999), item(NARDY, 100), item(NARDY, 200)],
      ORDEM,
    );

    expect(grupos[0]?.itens.map((i) => i.valorCentavos)).toEqual([300, 100, 200]);
  });

  it('soma valores negativos, porque estorno existe', () => {
    const grupos = agrupar([item(NICK, 10000), item(NICK, -2500)], ORDEM);

    expect(grupos[1]?.subtotalCentavos).toBe(7500);
  });

  it('a soma dos subtotais fecha com o total dos itens', () => {
    const itens = [item(NARDY, 10000), item(NICK, 30000), item(CONJUNTO, 10101), item(NICK, -500)];
    const grupos = agrupar(itens, ORDEM);

    const somaDosSubtotais = grupos.reduce((a, g) => a + g.subtotalCentavos, 0);
    const total = itens.reduce((a, i) => a + i.valorCentavos, 0);

    expect(somaDosSubtotais).toBe(total);
  });

  it('lista vazia devolve todos os grupos zerados', () => {
    const grupos = agrupar([], ORDEM);

    expect(grupos.map((g) => g.subtotalCentavos)).toEqual([0, 0, 0]);
  });

  it('recusa item com chave fora da ordem em vez de descarta-lo em silencio', () => {
    expect(() => agrupar([item('membro-fantasma', 100)], ORDEM)).toThrow();
  });
});
```

**Sobre o último teste.** Descartar em silêncio um item com chave desconhecida faria a soma da tela
divergir da soma real sem ninguém notar — exatamente o tipo de bug que esta base já pagou caro.
`calcularResumo` lança pelo mesmo motivo, e `docs/arquitetura.md` manda não embrulhar em
`try/catch` "para a tela não quebrar".

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/domain/agrupamento.test.ts
```

Esperado: falha, porque `./agrupamento` não existe.

- [ ] **Passo 3: implementar o mínimo**

`src/domain/agrupamento.ts`. Um `Map` das chaves da ordem para acumuladores, uma passada pelos
itens, uma verificação de chave desconhecida que lança com mensagem dizendo qual chave, e a
devolução na ordem de `ordemDasChaves`.

**Sem `Date`, sem I/O, sem importar nada de `src/server/`.**

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/domain/agrupamento.test.ts
npm test
```

Os 96 anteriores continuam passando.

- [ ] **Passo 5: commitar**

```bash
git add src/domain/agrupamento.ts src/domain/agrupamento.test.ts
git commit -m "Agrupa e soma no dominio, para a tela nao precisar contar"
```

---

## Tarefa 2 — Alargar as props que perdem a cor

**Arquivos:**
- Modifica: `src/components/grade-lancamentos.tsx`, `src/components/chips-conta.tsx`

**O problema.** `LinhaGrade` traz `membroNome` e `categoriaNome`, mas **nenhuma cor**. As páginas,
porém, já carregam os registros completos do Prisma — `prisma.categoria.findMany` devolve `cor`, e
`prisma.membro.findMany` também. O que joga a cor fora é o tipo das props:

```ts
type Opcao = { id: string; nome: string };
```

**Alargar esse tipo resolve sem tocar em nenhum repositório**, o que preserva a promessa da §11 da
spec de que nenhuma camada de baixo muda.

- [ ] **Passo 1: trocar o tipo**

Nos componentes que recebem `contas`, `categorias` e `membros`:

```ts
type Membro = { id: string; nome: string; cor: string };
type Categoria = { id: string; nome: string; cor: string };
type Conta = { id: string; nome: string; tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };
```

`tipo` e `diaFechamento` da conta não são usados nesta etapa — são para a dica de competência da
Etapa 04. Entram agora para não mexer nas mesmas assinaturas duas vezes.

- [ ] **Passo 2: verificar**

```bash
npm run build
```

Não deve haver erro de tipo. As páginas já passam os objetos completos; só o tipo estava estreito.

- [ ] **Passo 3: commitar**

```bash
git add src/components
git commit -m "Deixa a cor do banco chegar ate a tela"
```

---

## Tarefa 3 — Seções por pessoa

**Arquivos:**
- Cria: `src/components/despesas/secao-pessoa.tsx`
- Reescreve: `src/components/despesas/grade-lancamentos.tsx` (movido de `src/components/`)
- Move: `src/components/chips-conta.tsx` → `src/components/despesas/chips-conta.tsx`

**Consome:** `agrupar` da Tarefa 1, os tipos alargados da Tarefa 2.

- [ ] **Passo 1: montar o agrupamento na grade**

A chave é `membroId` quando `escopo === 'PESSOAL'`, e a constante literal `'CONJUNTO'` quando é
conjunto. Não há colisão possível: `membroId` é `cuid()`.

```ts
const CHAVE_CONJUNTO = 'CONJUNTO';

const chaveDe = (l: LinhaGrade) =>
  l.escopo === 'CONJUNTO' ? CHAVE_CONJUNTO : (l.membroId ?? CHAVE_CONJUNTO);

const ordem = [...membros.map((m) => m.id), CHAVE_CONJUNTO];
const grupos = agrupar(
  linhas.map((l) => ({ chave: chaveDe(l), valorCentavos: l.valorCentavos, linha: l })),
  ordem,
);
```

**Ordem das seções:** os membros na ordem `criadoEm asc` que as páginas já usam, e **Conjunto por
último**. `docs/decisoes.md` registra que a ordem de exibição não muda com a regra da sobra de
centavos; isso continua valendo, e a página não deve reordenar.

- [ ] **Passo 2: escrever a `SecaoPessoa`**

Cabeçalho com a faixa de `Membro.cor`, o nome, a contagem de lançamentos e o subtotal com
`formatarBRL`. Para o grupo `CONJUNTO`, o rótulo é "Conjunto" e a faixa é bipartida com as cores
dos dois membros.

Abaixo, as linhas do grupo. **A coluna "De quem" desaparece** — virou o próprio grupo.

- [ ] **Passo 3: reescrever a linha**

Colunas: compra, descrição, categoria, parcela, valor, ações.

| Elemento | Tratamento |
|---|---|
| Descrição | `text-tinta`, primeiro plano |
| Categoria | ponto de 6px com `style={{ background: categoria.cor }}` + nome em `text-tinta-fraca` |
| Parcela | `text-tinta-fraca`, e **o `—` some quando `numeroParcelas <= 1`** — hoje ele aparece e é ruído |
| Valor | `text-right tabular-nums`, com peso |
| Data da compra | `text-tinta-fraca`, **esmaecida quando repete a da linha imediatamente acima dentro da mesma seção**; a primeira linha de cada seção nunca esmaece |
| Reembolso | selo `Badge` em `atencao`, não texto solto |

**Ações só aparecem na linha sob o cursor**, e **precisam continuar alcançáveis por teclado** —
visíveis também ao receber foco, não só no `hover`. Use `opacity-0 group-hover:opacity-100
focus-within:opacity-100`, nunca `hidden`, que tira do fluxo de foco.

O vermelho passa a significar **apenas erro**. O botão de excluir é neutro; o vermelho aparece no
diálogo de confirmação da Etapa 04.

- [ ] **Passo 4: estados vazios**

Quando **todos** os grupos estiverem vazios, não mostre três seções zeradas — mostre o estado vazio
da tela inteira. Dois textos diferentes:

- Sem filtro de conta: "Nenhum lançamento em *mês*." com o botão de lançar
- Com filtro de conta: diga que **o filtro é a causa** e ofereça limpá-lo

Quando só *alguns* grupos estiverem vazios, mostre-os zerados. Uma pessoa sem gasto deve aparecer
com 0,00, não sumir — sumir parece falta de dado.

- [ ] **Passo 5: verificar**

```bash
npm run build && npm run lint && npm test
```

No navegador, com `npx tsx scripts/dados-ficticios.ts criar`:

1. A soma dos subtotais das seções bate com o total do rodapé
2. Com filtro de conta ligado, os subtotais mudam e a faixa de competência continua no mês inteiro
3. `Tab` alcança os botões de editar e excluir de cada linha
4. Um lançamento à vista não mostra `—` na coluna de parcela
5. Duas linhas seguidas com a mesma data: a segunda está esmaecida
6. Filtrando por uma conta sem lançamento, aparece o estado vazio que fala do filtro

- [ ] **Passo 6: commitar**

```bash
git add -A src/components
git commit -m "Separa a grade do mes por pessoa, com subtotal em cada uma"
```

---

## Como saber que a etapa terminou

- `npm test` com **104+** testes (96 antigos + os 8 de `agrupamento`)
- `npm run build` e `npm run lint` limpos
- A soma dos subtotais bate com o total do rodapé em qualquer filtro
- Nenhuma cor literal em `src/components/despesas/`
