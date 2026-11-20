# Trava por parcela — documento de design

Data: 2026-11-19. Complementa a [spec do sistema](2026-08-08-sistema-despesas-casal-design.md)
e muda o que [regras-de-negocio.md](../regras-de-negocio.md) diz sobre trava, parcelamento e
sobrescrita de competência.

## 1. O problema

Em 19/11, com o Resumo de dezembro aberto, não dava para lançar nem editar valores: toda
tentativa respondia *"Esse mês já está fechado"*. Dezembro não estava fechado. As faturas
travadas eram as do C6 de setembro (travada em 13/10) e de novembro (travada em 17/11).

A causa está em [`lancamento.ts`](../../src/server/repositorios/lancamento.ts). Editar um
lançamento regera **todas** as parcelas dele, e por isso `competenciasTravadas` recusa a
edição se **qualquer** parcela cair em fatura travada. Dos 20 lançamentos com parcela em
dezembro, 16 são parcelados do C6 que também passam por novembro ou por setembro. Travar um
mês congelava, na prática, todo parcelado que atravessasse aquele mês, por até um ano.

A mensagem piorava o quadro. *"Esse mês"* fazia pensar no mês aberto na tela, e a recusa não
dizia qual fatura estava travada. Quem obedecesse ao *"destrave a fatura"* iria ao Resumo de
dezembro e encontraria o botão **Travar**, não o Destravar.

Lançar sofria do mesmo jeito por outro caminho: a competência sai da data da compra, e uma
compra de até 4/11 no C6 cai em novembro, que está travado. Isso inclui a compra que só
apareceu na fatura de dezembro.

## 2. Decisões tomadas com o usuário

| Pergunta | Escolha |
|---|---|
| O que a trava congela? | **As parcelas do mês travado, e só elas.** Toda operação que não reescreve uma parcela travada passa |
| Mudar o valor de uma parcela alcança quais? | **Pergunta a cada edição:** *só esta*, *esta e as seguintes* ou *todas* |
| Mudar descrição, categoria, pessoa ou cartão em *esta e as seguintes* | **As anteriores ficam como estavam**, em tudo, não só no valor |
| Como representar? | **Dividindo o lançamento** em pedaços, e não com atributo por parcela |
| Em que mês cai uma compra nova? | **Num campo Fatura**, que começa no mês da tela; a data só gera um aviso |
| Excluir parcelado | **Os mesmos três alcances** de editar |
| Lançar compra antiga parcelada | **Campo "começa na parcela X de N"** |

## 3. Comportamento

### A regra

**A trava congela as parcelas do mês travado, e só elas.** Uma operação é recusada se, e
somente se, apagar, gravar ou mudar uma parcela que está numa fatura `TRAVADA`. Parcela que a
operação não alcança não é lida nem escrita, e por isso não pode barrar nada.

### Lançar

O painel ganha o campo **Fatura**: o mês em que a parcela cai, e para cartão o mês do vencimento
da fatura, como sempre foi a competência.

- **Começa no mês da tela.** Quem está em dezembro conferindo a fatura de dezembro lança na
  fatura de dezembro sem pensar em data de fechamento.
- É um seletor de **12 meses para trás a 12 para frente** do mês da tela. Os meses com fatura
  travada **na conta escolhida** aparecem desabilitados, marcados *travada*. Trocar de conta
  recalcula quais ficam desabilitados. Conta externa não tem fatura, então nada fica
  desabilitado.
- **A data não decide mais o mês.** Se pela data a compra cairia em outro mês, um aviso
  aparece abaixo do campo — *"Pela data, cairia em janeiro de 2027"* — sem impedir o envio. O
  aviso reaproveita `calcularDica`, que já mostra hoje em qual fatura a compra cai. A
  comparação é sempre entre **competências base**: a que a data dá para a parcela 1, e
  `Fatura − (k − 1)`. Assim a parcela 9 de uma compra de abril, aberta em dezembro, não acusa
  diferença nenhuma.
- **Parcelado:** a parcela 1 cai na Fatura escolhida e as seguintes nos meses seguintes.
- **"Começa na parcela X de N".** Para lançar uma compra antiga que só agora apareceu: com
  X = 3 e N = 6, a Fatura escolhida recebe a parcela 3/6, e o lançamento grava as parcelas 3 a
  6. As parcelas 1 e 2 não são gravadas. X começa em 1, e só aparece com mais de uma parcela.

Se alguma parcela gravada cair em mês travado (um mês futuro travado, por exemplo), a criação
é recusada, nomeando a parcela, o mês e o cartão.

Recorrentes e o importador continuam calculando a competência pela data. O campo Fatura é do
painel.

### Editar uma linha de parcelado

Ao abrir a edição de uma linha que é parcela de um parcelado, o topo do painel mostra o
**alcance**, um controle segmentado:

| Alcance | O que muda | O que fica |
|---|---|---|
| **Só esta parcela** (padrão) | O valor desta parcela. Os outros campos ficam desabilitados | Todas as outras parcelas, em tudo |
| **Esta e as seguintes** | Qualquer campo, inclusive Fatura e número total de parcelas | As parcelas anteriores, em tudo |
| **Todas** | Qualquer campo, em todas as parcelas do lançamento | — |

- **Só esta** serve para juros ou ajuste que apareceu numa fatura só.
- **Esta e as seguintes** serve para reajuste, correção que vale dali em diante, renegociação.
  Mudar o total de parcelas exige que o novo total seja pelo menos o número desta parcela.
- **Só o alcance que chega à última parcela da compra muda o total.** Num pedaço que para antes
  — o de antes de uma divisão, ou o que ficou depois de excluir as seguintes —, as parcelas
  seguintes estão em outro lançamento, vivo ou na lixeira, e o campo Parcelas fica fixo no total
  de hoje, com a razão escrita abaixo. Sem isso os pedaços se sobreporiam: baixar o total de
  `[1 .. 2]` de 12 para 2 fazia o pedaço parecer o último, e subir de novo regerava as parcelas
  3 a 12, que já eram do vizinho. O servidor recusa um total fora dos limites com
  `TOTAL_INVALIDO`.
- **Salvar sem mudar nada não divide.** Se os campos, a faixa e as parcelas que a edição
  gravaria são os de hoje, nada é escrito e a versão não muda. Dividir não tem volta.
- **Todas** é o comportamento de hoje. Fica **desabilitado quando alguma parcela do
  lançamento está em fatura travada**, com a razão escrita abaixo dele. A tela só enxerga as
  travadas da janela de ±12 meses; uma travada mais distante, num parcelado longo, aparece
  como recusa do servidor ao salvar. Quem decide é sempre o servidor.
- O alcance substitui o AlertDialog *"Editar … regera as N parcelas"*: quem escolheu o alcance
  já disse o que quer regerar.

A Fatura, na edição, começa no mês da parcela que foi clicada. Em *esta e as seguintes* e em
*todas*, mudá-la desloca as parcelas alcançadas.

Lançamento de uma parcela só — à vista, ou um pedaço de uma parcela só — abre sem o controle,
como hoje.

### Excluir uma linha de parcelado

A caixa de exclusão ganha o mesmo controle de alcance. *Esta e as seguintes* é a quitação do
restante; *só esta* tira uma parcela; *todas* é o comportamento de hoje, desabilitado quando
há parcela travada. O que sai vai para a lixeira como um lançamento, e a lixeira o restaura.

### Linha de mês travado

Abrir a edição de uma linha cujo mês está travado mostra, no topo do painel, a frase da trava,
e desabilita o Salvar. Hoje o painel deixa digitar e recusa no fim.

### Mensagens

Toda recusa de trava nomeia a parcela, o mês e o cartão:

> A parcela 3 cai em novembro de 2026, e a fatura do C6 desse mês está travada. Destrave-a no
> Resumo de novembro para mudá-la.

Quando várias parcelas batem em meses travados, a mensagem nomeia a primeira. A frase sai de
uma função de domínio, `descreverTrava`, e não é montada na tela.

## 4. Modelo

### Um lançamento passa a ser uma faixa de uma compra

Migration **só de adição** em `Lancamento`:

```prisma
parcelaInicial Int  @default(1)
parcelaFinal   Int? // nulo: até numeroParcelas
```

`numeroParcelas` continua sendo **o total da compra**: o 12 de "4/12". Um lançamento é a faixa
`[parcelaInicial .. parcelaFinal ?? numeroParcelas]` de uma compra virtual de
`numeroParcelas` parcelas, com a parcela 1 na competência base. **As parcelas gravadas são
exatamente as que `gerarParcelas` dá para essa compra, filtradas pela faixa.**

Os lançamentos existentes ficam com `parcelaInicial = 1` e `parcelaFinal = null`: a faixa
inteira, o que eles já são. Nada é reescrito.

A competência base pode estar num mês travado, ou no passado, sem consequência: é uma
coordenada, não uma parcela. Só as parcelas gravadas passam pela barreira.

### O invariante 4

Passa a se ler: **cada lançamento grava exatamente as parcelas da sua faixa, e nenhum centavo
é descartado dentro dela.** Num lançamento de faixa inteira é o invariante de antes.

Quando uma divisão não muda o valor, cada pedaço regera as mesmas parcelas, centavo por
centavo, inclusive com valor `TOTAL`: o resto de arredondamento continua na parcela de número
`numeroParcelas`, que fica no pedaço que a contém.

**Editar *só esta* ou *esta e as seguintes* num lançamento `TOTAL` fica bloqueado**, com o
motivo na tela: ali o campo de valor mostra o total da compra, e "o valor desta parcela" não
tem leitura honesta. Excluir com alcance continua valendo, porque só move linhas. Os 177
lançamentos de hoje são todos `POR_PARCELA`, e o painel só grava esse: o bloqueio protege um
caminho que a tela não alcança.

### Por que dividir, e não atributo por parcela

Descrição, categoria, pessoa, cartão e rateio moram no lançamento. Para dezembro mudar de
categoria com novembro intacto, ou esses campos descem para a parcela — e cada consulta de
resumo, fatura e gráfico muda de lugar — ou o lançamento se divide. Dividir não muda nenhuma
leitura: resumo, fatura, gráficos e recorrentes somam parcela e continuam iguais.

O custo é a fragmentação: uma compra pode virar dois ou três lançamentos. No mês continua uma
linha só, porque os pedaços não se sobrepõem. Na busca e na lixeira aparecem os pedaços, cada
um com a sua faixa.

## 5. Domínio

Puro, em `src/domain/`, sem I/O.

- **`gerarParcelas`** ganha a faixa como parâmetro opcional. Sem ela, gera a compra inteira,
  como hoje.
- **Competência base a partir da Fatura:** `base = avancarCompetencia(fatura, -(k - 1))`, em
  que `k` é o número da parcela que a Fatura descreve: a parcela clicada na edição, `X` na
  criação.
- **`planejarDivisao(faixa, k, alcance)`** devolve os pedaços e o destino de cada um:

  | Pedaço | Faixa | Campos | Linhas |
  |---|---|---|---|
  | antes | `[a .. k-1]` | os de hoje | ficam onde estão, intocadas |
  | alcance | `[k .. k]` ou `[k .. b]` ou `[a .. b]` | os novos | apagadas e regeradas |
  | depois (só em *só esta*) | `[k+1 .. b]` | os de hoje | **movidas** para outro lançamento, sem mudar valor nem número — salvo quando é este pedaço que fica com o id original, e aí não saem do lugar |

  **Quem fica com o id original:** o pedaço *antes*, se existir. Se não existir, o *depois*. Se
  nenhum dos dois existir, o alcance é a faixa inteira e o lançamento é editado no lugar, como
  hoje. A regra garante que a parte de antes, onde mora o mês travado no caso comum, nunca
  muda de id nem de linha.

- **`descreverTrava({ numero, competencia, contaNome })`** monta a frase da seção 3.

## 6. Servidor

Em [`lancamento.ts`](../../src/server/repositorios/lancamento.ts). Cada operação é uma
transação só, com o lock otimista de sempre (`WHERE versao = ?`) no lançamento original, que
ganha `versao + 1` em toda divisão.

- **`criarLancamento`** recebe `parcelaInicial` e a Fatura (convertida em base pela action). A
  barreira olha só as parcelas que vão ser gravadas.
- **`editarLancamento(id, versao, entrada, alcance, k)`** materializa o plano:
  - Encolhe a faixa do original e apaga dele as linhas do alcance.
  - Cria o lançamento do alcance com os campos novos, a faixa nova e o rateio do escopo novo.
  - Em *só esta*, os campos do pedaço novo são **copiados do original, menos o valor**. O
    servidor ignora o que mais vier da tela, que assim não consegue forjar outra mudança.
  - Em *só esta* no meio da faixa, cria o pedaço *depois* com os campos do original e um rateio
    copiado, e **move** para ele as linhas `k+1 .. b`, trocando só o `lancamentoId`.
  - `cancelada` e `reembolsoRecebido` passam para as linhas regeradas pelo número, com a regra
    que `gravarFilhos` já aplica.
  - **Pedaço novo nunca herda `recorrenteId` nem `competenciaRecorrente`**: o par é único no
    banco, e a marca fica com o original.
- **`excluirLancamento(id, versao, alcance, k)`** usa o mesmo plano, mas o pedaço do alcance
  recebe as linhas movidas, com os campos do original, e nasce com `deletadoEm` preenchido. A
  lixeira o restaura como restaura qualquer lançamento.
- **A barreira** confere as linhas apagadas e as gravadas: na edição, as do alcance antes e
  depois; na exclusão, as que saem dos meses. Linha movida para o pedaço *depois* não muda
  valor, número, competência nem campo exibido, e não passa pela barreira. Linha do pedaço
  *antes* não é lida.
- **A recusa** passa a ser
  `{ ok: false, motivo: 'FATURA_TRAVADA', travada: { numero, competencia, contaNome } }`.
- **Editar recusa também o total que o alcance não comporta**, com
  `{ ok: false, motivo: 'TOTAL_INVALIDO', minimo, maximo }`, antes de escrever qualquer coisa. Os
  limites saem de `limitesDeParcelas`, a mesma função que dá o `min` e o `max` do campo.
- **Editar sem mudar nada devolve `{ ok: true }` sem escrever**, quando o plano é dividir. Vem
  antes da barreira: não apaga, não grava e não muda parcela nenhuma.

### Action

[`actions/lancamento.ts`](../../src/server/actions/lancamento.ts) ganha no esquema `fatura`
(`AAAA-MM`), `parcelaInicial` (inteiro, de 1 até `numeroParcelas`), e nas de editar e excluir o
`alcance` (`SO_ESTA | ESTA_E_SEGUINTES | TODAS`) e o número `k` da parcela, que tem que estar na
faixa do lançamento. `competenciaManual` continua existindo para o importador.

### O que lê a faixa

- **Busca** e **lixeira** mostram *"parcelas 4 a 12 de 12"* quando o lançamento não tem a
  compra inteira. Na busca, o valor exibido é a soma das parcelas do pedaço; na lixeira, o valor
  do lançamento, como ela sempre mostrou.
- **Grade, resumo, fatura, gráficos, recorrentes** leem parcela e não mudam.
- **Restaurar** um pedaço passa pela barreira de sempre, contra as linhas dele.

## 7. Tela

- [`painel-lancamento.tsx`](../../src/components/despesas/painel-lancamento.tsx) recebe a
  competência da tela e as faturas travadas da janela de ±12 meses, consultadas no servidor do
  Despesas junto com as contas. É uma consulta pequena: poucas linhas por ano.
- **Fatura**, **aviso da data**, **"começa na parcela"** e **alcance** como descritos na seção
  3. Em *só esta*, os campos fora o valor ficam desabilitados.
- [`dialogo-exclusao.tsx`](../../src/components/despesas/dialogo-exclusao.tsx) ganha o controle de
  alcance, com o texto do que sai: *"Excluir "tênis" remove as parcelas 4 a 12, de dezembro de
  2026 a agosto de 2027. Essa ação não pode ser desfeita por aqui."* Com uma parcela só, *"Excluir
  a parcela 4 de "tênis", de dezembro de 2026."*, com o mesmo fim.
- Linha de mês travado: aviso no topo e Salvar desabilitado.
- O formulário continua sem resetar na recusa (ver `decisoes.md`), e a mensagem vem da recusa
  do servidor, montada por `descreverTrava`.

## 8. Testes

O primeiro teste a falhar é o caso de 19/11: **editar a parcela de dezembro de um parcelado com
novembro travado**.

**Vitest, sem banco:**

- `gerarParcelas` com faixa: o começo, o meio e o fim; com `TOTAL`, o resto continua na última
  parcela e cada pedaço sem mudança de valor regera as mesmas parcelas.
- `planejarDivisao` nos três alcances, com k no começo, no meio e no fim da faixa, em faixa de
  uma parcela só, e com mudança do total de parcelas; quem fica com o id original.
- Base a partir da Fatura e da parcela inicial.
- `descreverTrava`.

**`npm run test:banco`:**

- Dividir não toca no pedaço *antes*: as parcelas dele com os mesmos ids, valores e
  competências.
- *Só esta* no meio: três pedaços, as linhas de *depois* com os mesmos ids, só o
  `lancamentoId` trocado.
- As marcas `cancelada` e `reembolsoRecebido` passam para o pedaço novo.
- O rateio do pedaço novo segue o escopo novo; o do pedaço *depois* é cópia.
- Pedaço novo sem marca de recorrente.
- Lock otimista recusa versão velha numa divisão.
- A barreira recusa *esta e as seguintes* que atravessa um mês travado, nomeando parcela, mês
  e cartão; e aceita a mesma edição quando a travada fica antes de k.
- Excluir *esta e as seguintes*, e restaurar o pedaço pela lixeira.
- Criar com Fatura diferente do mês da data, e com parcela inicial maior que 1.
- O pedaço que não chega à última parcela não muda o total — nem depois de dividir, nem depois
  de excluir as seguintes e restaurá-las —, e nenhuma parcela fica em dois lançamentos vivos.
- Salvar sem mudar nada em *só esta* e em *esta e as seguintes* não divide nem gasta a versão.

## 9. Documentação

- [regras-de-negocio.md](../regras-de-negocio.md): §1 *Sobrescrita* vira o campo Fatura; §2
  *Editar uma parcela — não existe* passa a existir pelos alcances; *Alterar o número de
  parcelas* e *Excluir* perdem o `[a confirmar]`; §5 *Trava* reescrita com a regra da seção 3.
- [decisoes.md](../decisoes.md): dividir em vez de atributo por parcela; Fatura no mês da tela,
  e não pela data; linha movida não passa pela barreira.
- [arquitetura.md](../arquitetura.md): armadilha nova — **regerar sem filtrar pela faixa grava
  parcelas que pertencem a outro pedaço**, e o `@@unique([lancamentoId, numero])` não pega,
  porque são lançamentos diferentes.
- `estado.md`, e o texto do invariante 4 no `CLAUDE.md`.

## 10. Entrega

1. Migration aplicada no banco de teste pelo `npm run test:banco`, com a suíte passando.
2. Migration em produção **com a palavra do usuário**, antes do push (armadilha 23). É só de
   adição: o código de hoje continua funcionando com o banco novo.
3. Trabalho numa branch própria; o merge na `main`, que publica, passa pelo usuário.

## 11. Fora deste desenho

- **Ligar os pedaços de uma compra.** Não há `compraId`: a busca mostra os pedaços separados,
  cada um com a sua faixa. Se incomodar, a ligação é uma coluna a mais, sem mudar o resto.
- **Mover uma parcela de mês sozinha.** *Só esta* muda só o valor; a Fatura fica fixa.
- **Restringir a ordem dos pedaços.** *Esta e as seguintes* aceita qualquer Fatura aberta, mesmo
  uma que ponha a parcela 4 antes da 3.
