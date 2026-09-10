# Etapa 04 — Painel de lançamento e exclusão

Funde os dois formulários num só, traz para a tela uma regra do domínio que nunca apareceu, e tira
o balão cinza do sistema operacional do caminho da exclusão.

**Depende das Etapas 01 e 03.**

---

## A etapa de maior risco do plano

`linha-nova.tsx` e `linha-edicao.tsx` repetem os mesmos oito campos, o mesmo `FormData` e o mesmo
`reaisParaCentavos` — e a duplicação **já produziu divergência real**: só `linha-edicao` avisa antes
de regerar as parcelas. Fundir mata a duplicação, e é exatamente aí que se perde comportamento.

**Os cinco comportamentos abaixo vêm de `linha-edicao.tsx`, cada um custou correção para existir, e
nenhum pode se perder na fusão.** Leia o arquivo original inteiro antes de escrever o novo.

1. Em caso de recusa — `CONFLITO` ou `FATURA_TRAVADA` — **o formulário nunca reseta**
2. Os campos usam `defaultValue`, **não são controlados**, para que o re-render vindo do
   `revalidatePath` do próprio server action não apague o que a pessoa digitou
3. No conflito, o estado atual gravado é exibido junto da mensagem, extraído com verificação
   estrutural e **sem `as`** — ver `extrairAtual` no original
4. Ao editar lançamento com mais de uma parcela, avisa **antes de enviar** que todas serão regeradas
5. `origemValor` viaja escondido, igual ao que já estava gravado — o formulário não oferece trocá-lo

E de `linha-nova.tsx`: no **sucesso da criação**, o formulário reseta e o foco volta ao primeiro
campo.

---

## Tarefa 1 — O painel unificado

**Arquivos:**
- Cria: `src/components/despesas/painel-lancamento.tsx`
- Apaga: `src/components/linha-nova.tsx`, `src/components/linha-edicao.tsx`
- Modifica: `src/components/despesas/grade-lancamentos.tsx`, `src/app/(app)/despesas/page.tsx`

**Consome:** `Sheet` da Etapa 01; os tipos alargados da Etapa 03; `reaisParaCentavos` e
`formatarBRL` de `@/domain/money`; `acaoCriarLancamento` e `acaoEditarLancamento` de
`@/server/actions/lancamento`.

**Produz:**

```ts
type ModoPainel =
  | { modo: 'criar' }
  | { modo: 'editar'; linha: LinhaGrade };

export function PainelLancamento(props: {
  estado: ModoPainel | null;
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
  onFechar: () => void;
}): JSX.Element;
```

`estado === null` significa fechado. Um componente, dois modos — **não dois componentes**.

- [ ] **Passo 1: escrever o painel**

`'use client'`, dentro de um `Sheet` abrindo pela direita, com `shadow-painel`. A lista fica visível
atrás, que é metade do motivo de ter escolhido painel em vez de modal.

Campos com rótulo permanente, agrupados nesta ordem: descrição; data e valor; de quem e parcelas;
conta e categoria.

O `defaultValue` de cada campo sai de `estado.linha` no modo editar, e fica vazio no modo criar. No
modo editar, o valor do campo de dinheiro vem de **`lancamentoValorCentavos`**, não de
`valorCentavos` — a primeira armadilha de `docs/arquitetura.md`: confundir os dois fez uma compra
de R$ 1.000 em 5x virar R$ 200 e depois R$ 40 a cada salvamento.

O `select` de "de quem" mantém o formato de hoje: uma opção por membro com `value={m.id}`, mais uma
opção `CONJUNTO`. O envio traduz de volta:

```ts
escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
```

- [ ] **Passo 2: os cinco comportamentos**

Reimplemente cada um dos cinco do topo desta página. Depois **abra `linha-edicao.tsx` lado a lado e
confira um por um** antes de apagar o arquivo.

Mensagens de recusa, iguais às de hoje:

| Motivo | Mensagem |
|---|---|
| `FATURA_TRAVADA`, ao criar | "Esse mês já está fechado. Destrave a fatura para lançar." |
| `FATURA_TRAVADA`, ao editar | "Esse mês já está fechado. Destrave a fatura para editar." |
| `CONFLITO` | "Alguém salvou uma mudança nesse lançamento enquanto você editava. Confira o estado atual abaixo e tente de novo." |

**Não invente uma tela de destravar fatura.** Ela está fora do escopo (§12 da spec) e a mensagem
continua apontando para algo que só existe por SQL direto. É lacuna conhecida, não tarefa desta
etapa.

- [ ] **Passo 3: a dica de competência**

Acima do botão de salvar, dizendo em qual fatura o lançamento vai cair **e por quê**:

```ts
const conta = contas.find((c) => c.id === contaId);
const competencia =
  conta?.tipo === 'CARTAO' && conta.diaFechamento !== null
    ? competenciaDeCartao(dataCompra, conta.diaFechamento)
    : competenciaDeContaExterna(dataCompra);
```

O texto usa `formatarCompetencia`, o mesmo formato do resto da tela:
*"Cai na fatura de **outubro de 2026** — o C6 fecha dia 4."* Para conta externa, o motivo é o mês
do pagamento, então a segunda metade da frase muda.

**Nota de 2026-09-10:** o plano dizia antes "outubro/2026", com barra. A revisão da Tarefa 1 tratou
a divergência como achado plan-mandated, corretamente — mas o texto era exemplo em prosa, não
contrato, e reusar `formatarCompetencia` mantém a tela coerente consigo mesma. O plano foi ajustado
ao código, não o contrário.

As duas funções são puras e rodam no cliente sem problema. Recalcule a cada mudança de data ou de
conta, e só mostre quando os dois campos tiverem valor.

**Esta regra existe no domínio desde a Fase 1 e nunca apareceu na tela.** Sem ela, quem lança uma
compra do dia 5 no C6 não entende por que a linha não aparece no mês. É o acréscimo de maior valor
desta etapa.

- [ ] **Passo 4: ligar na grade**

`grade-lancamentos.tsx` deixa de renderizar a linha de edição dentro de um `<tr>` com `colSpan`.
Passa a guardar `estado: ModoPainel | null` e a abrir o painel. O botão "+ Novo lançamento" fica na
barra de filtros, à direita dos chips.

- [ ] **Passo 5: apagar os antigos**

```bash
git rm src/components/linha-nova.tsx src/components/linha-edicao.tsx
grep -rn "linha-nova\|linha-edicao" src/
```

O `grep` tem que voltar vazio.

- [ ] **Passo 6: verificar**

```bash
npm run build && npm run lint && npm test
```

No navegador, um roteiro por comportamento — todos precisam passar:

1. Criar um lançamento à vista: some do painel, aparece na seção certa, o painel fecha e o foco
   volta para onde dava para continuar
2. Criar com data 05 do mês corrente numa conta de cartão que fecha dia 4: a dica diz o **mês
   seguinte**, e o lançamento realmente não aparece no mês atual
3. Editar um parcelado: aparece o aviso de que as parcelas serão regeradas **antes** de enviar
4. Editar sem mudar nada e salvar: **o valor não encolhe** — se encolher, o campo está lendo
   `valorCentavos` em vez de `lancamentoValorCentavos`
5. Provocar conflito: abra a mesma linha em duas abas, salve numa, salve na outra. A segunda recusa,
   **mostra o estado atual gravado, e não apaga o que estava digitado**

- [ ] **Passo 7: commitar**

```bash
git add -A src
git commit -m "Funde criar e editar num painel que conta em qual fatura cai"
```

---

## Tarefa 2 — Diálogo de exclusão

**Arquivos:**
- Cria: `src/components/despesas/dialogo-exclusao.tsx`
- Modifica: `src/components/despesas/grade-lancamentos.tsx`

- [ ] **Passo 1: mover a mensagem, não reescrevê-la**

`mensagemExclusao()` já vive em `grade-lancamentos.tsx` e **já resolve o caso difícil**: quem vê a
linha "3/12" não tem como adivinhar que as doze somem, então ela soletra quantas parcelas
desaparecem e de qual mês a qual mês, usando `avancarCompetencia`.

**Não reescreva essa função.** Mova-a para o arquivo novo, sem alterar o texto que ela produz.

- [ ] **Passo 2: trocar o invólucro**

`window.confirm` sai; entra `AlertDialog`. Aqui — e só aqui — o botão de confirmar usa `negativo`.

Mantenha o tratamento de erro que já existe: `FATURA_TRAVADA` e `CONFLITO` viram mensagem em
`role="alert"`, e a exclusão em andamento desabilita o botão.

- [ ] **Passo 3: verificar**

Excluir um parcelado: o diálogo diz o número de parcelas e a faixa de meses, e ao confirmar todas
somem. Excluir um à vista: a mensagem é a curta. `Esc` fecha sem excluir.

- [ ] **Passo 4: commitar**

```bash
git add -A src/components/despesas
git commit -m "Confirma exclusao numa caixa desenhada, nao na do navegador"
```

---

## Tarefa 3 — Aviso de sucesso

**Arquivos:**
- Modifica: `src/components/despesas/painel-lancamento.tsx`,
  `src/components/despesas/dialogo-exclusao.tsx`

Hoje **não há retorno nenhum de sucesso** em lugar algum do sistema.

- [ ] **Passo 1: usar com parcimônia**

`toast.success` do `sonner`, **só onde o resultado não é visível na tela**. Regra:

| Ação | Aviso? |
|---|---|
| Criar lançamento | **Não** — a linha aparece, isso já é o retorno |
| Editar lançamento | **Não** — a linha muda |
| Excluir lançamento | **Sim** — some da tela e a pessoa precisa saber que foi de propósito |
| Salvar valor do extrato (Etapa 05) | **Sim** |
| Salvar em Configurações (Etapa 06) | **Sim** |

Aviso para tudo vira ruído que se aprende a ignorar, e aí o que importa passa batido.

- [ ] **Passo 2: verificar e commitar**

```bash
git add -A src/components/despesas
git commit -m "Avisa quando a acao nao deixa rastro na tela"
```

---

## Como saber que a etapa terminou

- Os cinco comportamentos do topo, mais o reset na criação, todos conferidos no navegador
- `linha-nova.tsx` e `linha-edicao.tsx` não existem mais e nada os importa
- A dica de competência acerta o mês seguinte para compra depois do fechamento
- `window.confirm` não aparece em `grep -rn "window.confirm" src/`
- `npm run build`, `npm run lint` e `npm test` limpos
