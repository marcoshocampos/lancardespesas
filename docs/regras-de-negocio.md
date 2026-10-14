# Regras de negócio

Como o sistema se comporta, caso a caso. A [spec de design](specs/2026-08-08-sistema-despesas-casal-design.md)
define o que o sistema é; este documento define o que ele faz quando alguém clica.

Itens marcados com **[a confirmar]** são decisões que eu tomei para não deixar o
comportamento indefinido, mas que o casal ainda não validou. Todo o resto decorre de decisões
já tomadas.

---

## 1. Competência

A competência é o mês ao qual a parcela pertence, no formato `AAAA-MM`.

### Conta de cartão

A partir da data da compra e do dia de fechamento. **A compra feita no próprio dia do
fechamento entra na fatura que fecha naquele dia** — o dia do fechamento é inclusive.

Para o C6, que fecha 04 e vence 10:

| Data da compra | Fatura fecha | Vence | Competência |
|---|---|---|---|
| 04/08 | 04/08 | 10/08 | `2026-08` |
| 05/08 | 04/09 | 10/09 | `2026-09` |
| 20/07 | 04/08 | 10/08 | `2026-08` |

Quando o dia de vencimento cai em fim de semana ou feriado, o banco cobra no dia útil
seguinte, mas **isso não altera a competência** — ela continua sendo o mês do vencimento
nominal.

Meses que não têm o dia configurado (fechamento 31 em fevereiro, por exemplo) usam o último
dia do mês. **[a confirmar]**

### Conta externa

A competência é o mês da data do pagamento. Não há fechamento nem vencimento.

### Sobrescrita

O sistema calcula, o usuário pode corrigir. Uma competência sobrescrita manualmente fica
marcada como tal e **não é recalculada** se a data da compra for editada depois. **[a confirmar]**

### Mudança no dia de fechamento

Alterar o fechamento ou o vencimento de uma conta **não recalcula lançamentos já gravados**.
Vale apenas para os próximos. Recalcular retroativamente moveria parcelas entre faturas já
conferidas, inclusive travadas.

---

## 2. Parcelamento

### Geração

Um lançamento em `n` parcelas gera `n` registros de parcela. A parcela `i` cai na competência
base mais `i-1` meses.

Exemplo real: `moto`, R$ 432,10 por parcela, 12x, parcela 2 em `2026-08`. Gera as
parcelas 3 a 12 de `2026-09` até `2027-06`.

### Valor digitado

O usuário informa **o valor da parcela** ou **o valor total**, e diz qual dos dois está
digitando. A planilha sempre usou o valor da parcela, então esse é o padrão.

Quando o valor informado é o total, a divisão é em centavos e **a diferença vai na última
parcela**. R$ 100,00 em 3x vira 33,33 + 33,33 + 33,34.

### Editar uma parcela — **não existe**

Esta seção descrevia alterar o valor de **uma** parcela sem redistribuir as outras, deixando o
total do lançamento virar a soma das suas parcelas. É o comportamento certo para renegociação
e para juros que aparecem no meio do parcelamento, e **nada disso foi construído**.

O que o sistema faz hoje: `editarLancamento` regenera **todas** as parcelas a partir do valor
do lançamento, a cada edição. Não há operação que alcance uma parcela sozinha, nem na tela nem
no repositório. Editar um parcelado de 12x para corrigir a descrição recalcula as doze.

Consequência prática: **não há como registrar juros que apareceram na parcela 7.** O jeito de
representar isso hoje é um lançamento à vista separado, na competência em que o juro caiu.

Fica registrado como divergência resolvida a favor do código, e não some daqui porque a
intenção continua válida — quando a operação existir, é este o comportamento esperado. A única
edição por parcela que o sistema tem é **cancelar**, abaixo.

### Cancelar uma parcela

A parcela sai dos totais, da fatura e da projeção. O lançamento continua existindo com as
demais parcelas. É assim que se registra uma quitação antecipada: cancelar as parcelas
futuras. **[a confirmar]**

### Alterar o número de parcelas

Regenera as parcelas **futuras e não travadas**, preservando as já passadas. Se o novo número
for menor que a quantidade de parcelas já travadas, a operação é recusada com essa
explicação. **[a confirmar]**

### Excluir o lançamento

Vai para a lixeira junto com todas as suas parcelas. **Se qualquer parcela estiver numa fatura
travada, a exclusão é recusada** — é preciso destravar a fatura primeiro. Sem isso, um mês
fechado e conferido mudaria de valor sozinho. **[a confirmar]**

---

## 3. Rateio

Lançamento de escopo `CONJUNTO` gera uma cota por membro, 50/50 por padrão.

O rateio é **do lançamento**, não da parcela: vale igualmente para todas as parcelas. Um
rateio diferente por parcela não tem caso de uso conhecido e complicaria a conferência.
**[a confirmar]**

### Resto de centavos

Valor ímpar não divide exato. R$ 101,01 em 50/50 dá R$ 50,50 para cada, sem sobra; mas
R$ 100,01 daria R$ 50,005. **A sobra vai para o membro mais antigo por ordem de cadastro**,
sempre o mesmo, de forma determinística — a alternativa, alternar entre as pessoas, tornaria o
resultado dependente do histórico e impossível de conferir na mão. **[a confirmar]**

A soma das cotas é sempre exatamente igual ao valor da parcela.

---

## 4. Totais do mês

Os totais formam uma **matriz de pessoas por contas**. Uma coluna por conta, mais uma coluna
de total; nas linhas, a mesma escada da planilha.

```
TOTAL Nardy      = soma das parcelas de escopo PESSOAL/Nardy
TOTAL Nick       = soma das parcelas de escopo PESSOAL/Nick
TOTAL Conjunto   = soma das parcelas de escopo CONJUNTO
METADE           = cota de cada pessoa no TOTAL Conjunto
TOTAL GERAL X    = TOTAL X + METADE de X
SOMADO           = TOTAL Nardy + TOTAL Nick + TOTAL Conjunto
```

Cada uma dessas linhas é calculada **por conta** e depois somada na coluna de total. Para uma
conta de cartão, o `SOMADO` daquela coluna é a `FATURA` da competência.

Com a fixture [`mes-de-referencia.ts`](../src/domain/fixtures/mes-de-referencia.ts), cujos
números são **inventados** de propósito — o repositório não recebe dado financeiro real:

|  | Cartão | Externa | Total |
|---|---:|---:|---:|
| Nardy | 423,75 | 0,00 | 423,75 |
| Nick | 500,75 | 80,00 | 580,75 |
| Conjunto | 101,01 | 0,00 | 101,01 |
| Metade Nardy | 50,50 | 0,00 | 50,50 |
| Metade Nick | 50,51 | 0,00 | 50,51 |
| Nardy total | 474,25 | 0,00 | 474,25 |
| Nick total | 551,26 | 80,00 | 631,26 |
| Somado | 1.025,51 | 80,00 | 1.105,51 |

O conjunto é ímpar de propósito: R$ 101,01 não divide ao meio, e a sobra de um centavo vai
para quem tem `absorveSobra`. **As duas metades diferem entre si, e isso é correto** — é o
único jeito de os dois totais somarem exatamente o `Somado`. Uma planilha que arredonda as
duas metades para cima cria um centavo que ninguém paga.

A leitura horizontal responde quanto cada pessoa gastou no mês inteiro, dentro e fora da
fatura. A conferência contra a planilha real é na tela, por
[`verificacao-visual.md`](verificacao-visual.md).

**Com reembolso no mês, o `Somado` deixa de fechar com a soma dos totais** — e isso é correto.
A identidade completa é `somado = soma dos totalGeral + soma dos reembolso`; ver a seção 6.

**Nenhum rótulo muda de significado** em relação à planilha: `TOTAL GERAL` continua sendo
pessoal mais metade do conjunto, agora por conta. O número que soma tudo é a célula onde a
linha `TOTAL GERAL` cruza a coluna `Total`.

Parcelas canceladas e lançamentos na lixeira **não entram** em nenhum total.

---

## 5. Fatura e conferência

Uma fatura existe por conta de cartão e competência, e nasce `ABERTA`.

### Conferência

O usuário digita o valor real do extrato do C6. O sistema mostra:

```
diferença = valor real − soma das parcelas
```

Diferença positiva significa que falta lançar algo. Negativa, que sobra lançamento ou que um
valor está maior do que deveria. Zero muda o status para `CONFERIDA`.

A conferência **não altera nenhum lançamento**; ela só aponta. Corrigir é trabalho de quem
está conferindo.

### Trava

Fatura `TRAVADA` é somente-leitura: não aceita novo lançamento na competência, nem edição ou
exclusão de parcela existente, nem correção do valor do extrato. Destravar é uma ação
explícita, registrada na auditoria com quem destravou e quando.

**Travar exige o valor do extrato preenchido — e não exige que ele bata.** Decidido; o
`[a confirmar]` que havia aqui propunha não exigir `CONFERIDA`, com o argumento de que exigir
conferência perfeita transformaria a trava em algo que ninguém usa. O argumento vale e foi
respeitado: dá para travar um mês com diferença conhecida e aceita, porque a diferença fica
registrada no próprio valor do extrato. O que não dá é travar um mês que **ninguém olhou** —
travar significa "conferi e fechei".

Os dois gestos pedem confirmação na tela. Travar não é mais perigoso que destravar, mas é
igualmente consequente: deixa o mês inteiro somente-leitura.

**Destravar devolve o status ao que o extrato diz, não a `ABERTA`.** Um mês que batia volta a
`CONFERIDA` ao ser reaberto, porque continua batendo. `ABERTA` significa "ninguém conferiu", e
reabrir não apaga a conferência que houve.

### Os três status, e quem os escreve

| Status | Quem escreve | Quando |
|---|---|---|
| `ABERTA` | o sistema | não há valor de extrato, ou há e não bate com o somado |
| `CONFERIDA` | o sistema | o valor do extrato bate com o somado, exatamente |
| `TRAVADA` | uma pessoa | fechou o mês, com o extrato já registrado |

`CONFERIDA` é automática e **reversível**: corrigir o extrato para um valor que não bate volta
a fatura para `ABERTA`. Sem isso ela ficaria marcada como conferida exibindo uma diferença.

O somado da comparação é sempre calculado no servidor, nunca recebido da tela.

### Contas externas

Não têm fatura nem conferência. **[a confirmar]** A competência de conta externa pode ser
travada junto com o fechamento do mês, para que o passado pare de mudar.

---

## 6. Reembolso de terceiro

Marca o lançamento como algo que alguém de fora vai devolver. Guarda o nome do devedor e o
status.

- **Entra na fatura.** O dinheiro saiu da conta de vocês; ignorar isso quebraria a conferência.
- **Sai dos relatórios de gasto do casal.** Não é gasto de vocês.
- Aparece em "A receber" enquanto estiver pendente.

### Onde ele aparece no Resumo

Numa linha própria, **A receber por ‹pessoa›**, dentro da banda *Resultado* — entre os
*Cabe a* e o *Somado*, que é a posição em que ela explica a diferença entre os dois. Fica fora
de `pessoal`, `conjunto`, `metade` e `totalGeral`, e dentro de `somado`.

Isso **muda a identidade contábil** herdada da planilha, onde o `SOMADO` fechava com a soma dos
`TOTAL GERAL` porque reembolso não existia lá:

```
somado = soma dos totalGeral + soma dos reembolso
```

As linhas só aparecem no mês que tem reembolso. Sem reembolso as duas somas coincidem, e duas
linhas vazias permanentes sugeririam uma lacuna que não existe.

### Parcelado

O status é **por lançamento**, não por parcela — decidido, e o schema já era assim
(`Lancamento.statusReembolso`). Um reembolso parcelado é reembolso em todas as parcelas dele,
de uma vez; não há como marcar recebida a parcela 3 e pendente a 4. Ver
[`decisoes.md`](decisoes.md).

Marcar como recebido **não altera valor nenhum, em lugar nenhum**. O lançamento já está fora
do gasto do casal e dentro do `Somado` nos dois estados: ou alguém ainda vai devolver, ou já
devolveu. A marca responde *de quem ainda cobrar*, e nada mais.

**A data do recebimento não é registrada**, ao contrário do que esta seção dizia. Decidido:
dívida aqui é visualização, não contabilidade, e **não persiste para o mês seguinte** — o mês
já é o contexto, e a lista sai de vista quando se vira a página. Guardar a data exigiria uma
coluna nova para informação que ninguém consultaria. Ver [`decisoes.md`](decisoes.md).

### A seção *A receber de terceiros*

Fica no Resumo, logo abaixo da matriz, e lista os reembolsos **daquela competência**: o que
foi, quanto, quem pagou, quem vai devolver, e um interruptor **Recebido**.

- **Não aparece em mês sem reembolso.** Sem nada a receber, o `Somado` fecha com a soma dos
  *Cabe a*, e uma seção vazia permanente sugeriria uma lacuna inexistente
- **O item recebido continua na lista**, com a marca ligada e o valor riscado. Sumir perderia o
  registro do mês e tiraria a chance de desfazer um clique errado
- O cabeçalho mostra **quanto ainda está em aberto**, e o total do mês quando os dois diferem
- Um parcelado aparece **uma vez por mês**, com o valor da parcela — o mesmo critério da grade

Marcar passa pelo **lock otimista** como qualquer gravação de lançamento: são duas pessoas no
mesmo mês. Marcar um lançamento que **não é** reembolso é recusado — criaria reembolso pela
porta dos fundos, sem devedor e sem ninguém ter pedido.

---

## 7. Estornos

Lançamento de valor negativo, para devolução de compra, cashback ou desconto.

- Exige categoria e escopo, como qualquer lançamento.
- Entra na competência calculada a partir da sua data, pela mesma regra dos demais.
- **Não pode ser parcelado.** Estorno parcelado não existe no mundo real; se o estorno vier
  fracionado, são vários estornos. **[a confirmar]**
- Reduz os totais e a fatura, que é justamente o que faz a conferência fechar num mês que
  teve devolução.

---

## 8. Despesas recorrentes

Cadastradas uma vez, viram lançamento em toda competência nova. Exemplos reais: `google`
R$ 88,00 e `seguro anual` R$ 95,00.

- **Geradas quando a competência é aberta pela primeira vez** — na primeira vez que alguém
  abre aquele mês no sistema, não por um agendamento de servidor. Menos peça móvel e nenhum
  risco de lançamento fantasma em mês que ninguém olhou. **[a confirmar]**
- O lançamento gerado é **normal e editável**: dá para mudar o valor do mês, ou apagar.
- Alterar o valor da recorrente vale para as **próximas** competências; não retroage.
- Encerrar preenche `dataFim`; competências posteriores não geram mais.
- Recorrente **não gera parcelamento**. Assinatura é uma cobrança por mês, não uma compra
  parcelada — a diferença importa na projeção, que só conta parcelas de compras reais.
  **[a confirmar]**

---

## 9. Projeção e alerta

Soma das parcelas em aberto por competência futura. Só entram parcelas de lançamentos já
existentes: a projeção mostra **compromisso assumido**, não previsão de gasto.

Recorrentes não entram, pela regra acima. **[a confirmar]**

Um mês futuro cuja soma passe de **R$ 2.000** recebe alerta visual. Com as parcelas atuais
nenhum mês chega lá — setembro é o pico, com R$ 1.100,00 — então o alerta nasce silencioso,
por desenho.

---

## 10. Lixeira e auditoria

### Lixeira

Excluir preenche `deletadoEm`. O registro some das telas e dos totais, mas continua no banco.
Restaurar limpa o campo e devolve o lançamento com todas as suas parcelas.

Retenção indefinida: nada é apagado por prazo. Limpeza definitiva, se um dia for necessária,
é operação manual. **[a confirmar]**

### Auditoria

Registra criação, edição, exclusão, restauração, trava, destrava e conferência, com quem fez,
quando, e o diff em JSON. Não registra leitura.

---

## 11. Edição simultânea

Todo lançamento tem uma `versao`, incrementada a cada gravação. A gravação usa
`WHERE id = ? AND versao = ?`.

Quando não afeta nenhuma linha, alguém alterou o registro no meio do caminho. A tela então
mostra o valor atual, o valor que estava sendo gravado, e quem alterou — e deixa escolher.
**Nunca sobrescreve em silêncio.**

O caso é real e frequente: duas pessoas conferindo a mesma fatura no mesmo domingo.

---

## 12. Importação da planilha

Script de uso único, não é tela.

Lê o CSV exportado da aba do mês e cria os lançamentos com as parcelas restantes já
posicionadas nas competências corretas. Uma linha `6/12` vira um lançamento com as parcelas 7
a 12 geradas para frente, e as parcelas 1 a 6 marcadas como passadas.

A conferência do resultado é o total: se a soma importada não bater com o `FATURA` da
planilha, a importação falhou e deve ser refeita, não corrigida na mão.
