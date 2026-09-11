# Etapa 05 — Resumo

Responde primeiro e demonstra depois. Nenhum cálculo muda: `calcularResumo` fica intacto, e os
cartões leem o mesmo `ResumoMes` que a matriz.

**Depende das Etapas 01 e 02.**

---

## Tarefa 1 — Cartões

**Arquivos:**
- Cria: `src/components/resumo/cartoes-resumo.tsx`
- Modifica: `src/app/(app)/resumo/page.tsx`

**Consome:** `ResumoMes` e `COLUNA_TOTAL` de `@/domain/totais`; `conferir` de `@/domain/conferencia`.

**Produz:**

```ts
export function CartoesResumo(props: {
  resumo: ResumoMes;
  membros: { id: string; nome: string; cor: string }[];
  contasCartao: { id: string; nome: string }[];
  valoresReaisPorConta: Record<string, number | null>;
}): JSX.Element;
```

- [ ] **Passo 1: escrever os cartões**

Um por membro, e um por conta de cartão.

| Cartão | Número | Linha de apoio |
|---|---|---|
| Membro | `resumo.totalGeral[id]?.[COLUNA_TOTAL] ?? 0` | "423,75 próprio + 50,50 da metade", com `resumo.pessoal` e `resumo.metade` |
| Fatura | `resumo.somado[contaId] ?? 0` | selo com a situação de `conferir(somado, valorReal)` |

O selo usa as quatro situações que `conferir` devolve:

| Situação | Selo | Cor |
|---|---|---|
| `BATE` | "bate com o extrato" | `positivo` |
| `FALTA_LANCAR` | "falta lançar R$ X" | `atencao` |
| `SOBRA_LANCAMENTO` | "R$ X a mais que o extrato" | `atencao` |
| `SEM_EXTRATO` | "aguardando o extrato" | `tinta-fraca` |

**Não há segunda fonte de verdade e não há cálculo no componente.** Tudo sai do `ResumoMes` que a
página já monta, mais `conferir`, que é do domínio.

- [ ] **Passo 2: verificar**

Com dados fictícios, conferir que o total de cada cartão **é idêntico** à linha "total" do membro na
matriz abaixo. Divergir significa erro de montagem, porque a origem é a mesma.

- [ ] **Passo 3: commitar**

```bash
git add -A src
git commit -m "Responde no topo do Resumo o que se abre a tela para ver"
```

---

## Tarefa 2 — Matriz em bandas

**Arquivos:**
- Reescreve: `src/components/matriz-resumo.tsx` → `src/components/resumo/matriz-resumo.tsx`

- [ ] **Passo 1: as três bandas**

As mesmas oito linhas de hoje, **sem tirar nenhuma**, separadas por três faixas rotuladas:

| Banda | Linhas | Origem |
|---|---|---|
| Gastos do mês | um por membro, e Conjunto | `resumo.pessoal`, `resumo.conjunto` |
| Rateio do conjunto, 50/50 | um por membro | `resumo.metade` |
| Resultado | um por membro, e Somado | `resumo.totalGeral`, `resumo.somado` |

A banda de resultado tem peso visual. Os rótulos deixam de ser `Metade · Nardy` e passam a dizer o
que significam — "cabe a Nardy".

- [ ] **Passo 2: as duas metades continuam separadas**

**Não junte as duas linhas de metade numa só.** O protótipo original mostrava "Metade cada", e isso
esconde o centavo de sobra: num conjunto de R$ 83,95 as metades são 41,98 e 41,97, e uma linha só
teria que mentir uma delas.

`docs/decisoes.md` documenta esse centavo com cuidado, incluindo que o destino dele é escolha
explícita marcada em `Membro.absorveSobra`. A tela não vai apagá-lo.

- [ ] **Passo 3: acabamento**

- Zero vira `—` em `text-tinta-apagada` — coluna zerada não deve pesar igual a valor real
- Cada membro leva sua faixa de `Membro.cor`
- Cabeçalho da primeira coluna traz o mês, com `formatarCompetencia`

- [ ] **Passo 4: verificar contra a prova de paridade**

**Este é o teste que importa nesta etapa.** Importe a fixture de agosto ou monte os dados
equivalentes e confira que a tela mostra:

| Célula | Valor |
|---|---|
| Somado, coluna C6 | `R$ 1.025,51` |
| Nardy total, coluna C6 | `R$ 474,25` |
| Nick total, coluna C6 | `R$ 551,26` |

Se não bater, **não conserte a tela até entender por quê** — o `CLAUDE.md` trata esses três números
como a prova de que o cálculo está certo.

- [ ] **Passo 5: commitar**

```bash
git add -A src/components
git commit -m "Separa na matriz o que foi gasto do que foi calculado"
```

---

## Tarefa 3 — Conferência da fatura

**Arquivos:**
- Reescreve: `src/components/conferencia-fatura.tsx` → `src/components/resumo/conferencia-fatura.tsx`

- [ ] **Passo 1: virar faixa**

Hoje é uma frase solta com um campo de texto no meio: *"C6 bate com o extrato. [1.025,51]
[Conferir]"*. Passa a ser faixa própria no rodapé da matriz: nome da conta, campo do extrato,
situação como selo, e o estado da fatura em texto.

Mantenha o `key={valorReal ?? 'vazio'}` do original — é o que faz o campo reler o valor gravado
depois de salvar.

- [ ] **Passo 1b: o selo é o mesmo dos cartões, e precisa ser o mesmo objeto**

A Tarefa 1 já escreveu a função `selo()` dentro de `cartoes-resumo.tsx`, com os quatro textos e as
quatro classes. A faixa mostra exatamente o mesmo selo. **Extraia para
`src/components/resumo/selo-conferencia.tsx` e faça os dois consumirem de lá** — duas cópias da
mesma tabela de situações é como elas passam a discordar. A extração é movimento puro: mesmos
textos, mesmas classes, mesmo `variant` do `Badge`.

Sim, a situação vai aparecer duas vezes na tela, no cartão e na faixa. É proposital: o cartão
responde de longe, a faixa fica ao lado do campo onde se digita o extrato.

- [ ] **Passo 2: o estado da fatura é somente leitura**

Mostre o estado como texto. **Não construa botão de travar ou destravar.** Está fora do escopo
(§12 da spec), e um botão que não funciona é pior que ausência.

**São três estados, não dois.** `StatusFatura` em `prisma/schema.prisma:33` tem `ABERTA`,
`CONFERIDA` e `TRAVADA`. Hoje nada no sistema escreve `CONFERIDA` — só o schema a conhece — mas
ela existe no banco e um dia alguém a escreve por SQL. Trate as três num `switch` exaustivo, sem
`default`, do mesmo jeito que `selo()` trata as quatro situações: assim, no dia em que o enum
ganhar um valor, o TypeScript avisa em vez de a tela mentir.

Fatura sem linha na tabela nenhuma ainda é `ABERTA` — não há registro porque ninguém conferiu.

- [ ] **Passo 2b: travada desabilita o campo, mas quem recusa continua sendo o servidor**

Sabendo que a fatura está travada, a faixa desabilita o campo e o botão e diz por quê. Deixar
alguém digitar num campo que sempre vai recusar é armadilha.

**O pré-check do servidor em `registrarValorReal` não sai.** O cliente desabilitar é cortesia; a
regra mora no servidor, e a mensagem de recusa ("Essa fatura está travada. Destrave para registrar
um novo valor do extrato.") continua existindo para o caso de a fatura travar entre o carregamento
da página e o envio.

- [ ] **Passo 2c: de onde vem o estado**

`carregarValorReal` devolve só o número e não serve. **Autorizado**, em exceção consciente à
restrição 3: substituí-la por

```ts
export async function carregarFatura(contaId: string, competencia: string):
  Promise<{ valorRealCentavos: number | null; status: StatusFatura } | null>;
```

no mesmo arquivo, atualizando o único chamador (`src/app/(app)/resumo/page.tsx`) no mesmo commit e
apagando a antiga. A restrição existe para impedir que uma assinatura mude e deixe chamador
quebrado atrás; aqui há um chamador só, ele muda junto, e o `npm run build` prova. Uma função nova
ao lado da velha custaria duas consultas à mesma linha e deixaria código morto.

- [ ] **Passo 3: acrescentar o aviso de sucesso**

`toast.success` ao gravar o valor do extrato — é ação sem resultado visível, então entra na regra da
Etapa 04.

- [ ] **Passo 4: commitar**

```bash
git add -A src/components/resumo
git commit -m "Da forma propria a conferencia contra o extrato"
```

---

## Tarefa 4 — Fronteira de erro

**Arquivos:**
- Cria: `src/app/(app)/resumo/error.tsx`
- Cria: `src/app/(app)/despesas/error.tsx`

- [ ] **Passo 1: entender o que ela NÃO faz**

`calcularResumo` **lança de propósito** para entrada incoerente: conta desconhecida, parcela pessoal
sem membro, conjunto sem rateio, cotas que não fecham. `docs/arquitetura.md` proíbe embrulhar em
`try/catch` "para a tela não quebrar" — se disparar, há dado corrompido e alguém precisa saber.

**A fronteira de erro não engole a exceção.** Ela troca a tela branca de hoje por uma mensagem
honesta, e o erro continua chegando ao log do servidor.

- [ ] **Passo 2: escrever**

`'use client'`, recebendo `{ error, reset }`. Texto que diga que **há dado inconsistente e alguém
precisa olhar** — não "algo deu errado, tente de novo", que sugere falsamente que insistir resolve.
Botão de tentar de novo chamando `reset()`, e um caminho de volta para `/despesas`.

- [ ] **Passo 3: verificar — e não é pelo banco**

A versão anterior deste passo mandava corromper uma parcela pelo `prisma studio` e desfazer em
seguida. **Não faça isso.** O banco é o de produção do casal, e "desfaço depois" depende de nada
interromper quem está no meio do caminho.

Provoque pelo código: um `throw new Error('teste da fronteira')` temporário no corpo da página,
abra a tela, confirme a mensagem, e reverta com `git checkout`. Mesmo efeito, e o desfazer é uma
operação que não pode falhar pela metade.

- [ ] **Passo 4: commitar**

```bash
git add -A "src/app/(app)"
git commit -m "Troca a tela branca por um aviso de dado inconsistente"
```

---

## Como saber que a etapa terminou

- Os três números de agosto reproduzidos na tela
- Cartões e matriz nunca divergem — mesma origem
- `npm run build`, `npm run lint` e `npm test` limpos
- Nenhum botão de travar fatura foi criado
