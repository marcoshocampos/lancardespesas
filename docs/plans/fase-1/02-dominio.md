# Etapa 02 — Domínio · **concluída**

Tarefas 3 a 6. As regras de cálculo, todas puras, todas testadas sem banco e sem browser.
É o coração do sistema: se estas quatro estiverem certas, o resto é encanamento.

O código completo saiu deste documento de propósito — está em `src/domain/`, revisado e
coberto por 45 testes. Fica aqui o que foi decidido e por quê.

---

## Tarefa 3 — `domain/competencia.ts`

**Commit:** `1236a27` · **13 testes**

Decide em qual fatura mensal um lançamento cai. É a regra que mais gera bug silencioso do
domínio inteiro: se a fronteira sai errada, uma compra vai para a fatura errada e ninguém
percebe por meses.

```ts
type Competencia = string;                                   // "AAAA-MM"

competenciaDeCartao(dataCompra: DataISO, diaFechamento: number): Competencia
competenciaDeContaExterna(dataPagamento: DataISO): Competencia
avancarCompetencia(c: Competencia, meses: number): Competencia
compararCompetencias(a: Competencia, b: Competencia): number
```

**O dia do fechamento é inclusive.** No C6, que fecha 4 e vence 10:

| Compra | Fatura fecha | Competência |
|---|---|---|
| 04/08 | 04/08 | `2026-08` |
| 05/08 | 04/09 | `2026-09` |
| 20/07 | 04/08 | `2026-08` |

Conta externa não tem fechamento: a competência é o mês do próprio pagamento.

Quando o mês não tem o dia configurado — fechamento 31 em fevereiro — vale o último dia do
mês, via `Math.min(diaFechamento, ultimoDiaDoMes(...))`.

A aritmética de meses é feita com inteiros (`ano * 12 + mes - 1`), nunca com objetos de data.

---

## Tarefa 4 — `domain/parcelamento.ts`

**Commit:** `30e4fa9` · **8 testes**

Gera as parcelas de uma compra. É a funcionalidade que existe para o casal parar de
redigitar a mesma parcela todo mês.

```ts
type OrigemValor = 'POR_PARCELA' | 'TOTAL';
gerarParcelas(entrada: EntradaParcelamento): ParcelaGerada[]
```

Duas invariantes, ambas com teste dedicado:

1. **A soma das parcelas é exatamente o valor total.** Com origem `TOTAL`, a divisão é em
   centavos e a diferença vai na **última** parcela: R$ 100,00 em 3x são 33,33 + 33,33 +
   33,34, nunca 33,33 × 3. Um teste varre 30 combinações de valor e número de parcelas
   verificando isso.
2. **Estorno não pode ser parcelado.** Valor negativo com mais de uma parcela é recusado.

O padrão é `POR_PARCELA`, porque é como a planilha sempre funcionou: o casal digita
`R$ 432,10` e `12x`, não o total de R$ 5.185,20.

---

## Tarefa 5 — `domain/rateio.ts`

**Commit:** `69dceb0` · **8 testes**

Divide um lançamento de escopo conjunto. Alimenta a linha `METADE` da planilha.

```ts
ratear(valorCentavos: Centavos, pesos: PesoRateio[]): Cota[]
pesosMeioAMeio(membroIds: string[]): PesoRateio[]
```

**A sobra de centavos vai sempre para o primeiro peso da lista**, nunca alternando. É
deliberado: alternar tornaria o resultado dependente do histórico e impossível de conferir
na mão.

A função trabalha sobre o valor absoluto e reaplica o sinal no fim. Isso não é firula —
`Math.trunc` arredonda em direções diferentes para negativos, e sem esse cuidado a soma das
cotas deixaria de fechar em estornos.

---

## Tarefa 6 — `domain/totais.ts`, a matriz

**Commits:** `86753c6`, `04adf84` · **16 testes**
**Arquivos:** `src/domain/totais.ts`, `src/domain/fixtures/agosto-2026.ts`

**Esta é a prova de paridade com a planilha.** Se ela estiver errada, todo o resto está
construído sobre número errado.

Calcula a matriz de **pessoas por contas**: nas linhas, a escada da planilha — `TOTAL` de
cada pessoa, `TOTAL` do conjunto, `METADE`, `TOTAL GERAL` por pessoa e `SOMADO`. Cada linha
é aberta por conta, mais uma coluna que soma as contas. Para uma conta de cartão, o `SOMADO`
daquela coluna é a fatura.

A fixture `agosto-2026.ts` tem os 21 lançamentos reais da planilha. Os testes exigem:

| | C6 | Externa | Total |
|---|---:|---:|---:|
| Nardy | 42375 | 0 | 42375 |
| Nick | 50075 | 8000 | 58075 |
| Conjunto | 10101 | 0 | 10101 |
| Metade cada | 5050 | 0 | 5050 |
| **Nardy total** | 47425 | 0 | 47425 |
| **Nick total** | 55126 | 8000 | 63126 |
| **Somado** | 102551 | 8000 | 110551 |

A revisão conferiu esses números por uma **segunda via independente**: a soma das oito
categorias do apêndice da spec também dá `102551`, o que prova que nenhum lançamento ficou
de fora da fixture.

### Duas validações que a revisão obrigou a acrescentar

O código original aceitava entrada incoerente em silêncio. Ambas agora lançam erro:

- **Conta desconhecida.** Parcela cuja `contaId` não está em `contaIds` era acumulada na
  coluna de total sem criar coluna visível, quebrando a leitura "TOTAL é a soma das colunas".
  Era assimétrico: membro desconhecido já lançava erro.
- **Rateio que não fecha.** A soma das cotas precisa ser exatamente o valor da parcela, que é
  a invariante 4 do `CLAUDE.md`. Sem a checagem, a identidade contábil quebrava sem aviso.

A revisão também estabeleceu uma propriedade que ninguém tinha escrito: **a identidade
contábil não depende de o rateio ser 50/50.** Ela vale para qualquer rateio cujas cotas
fechem com o valor da parcela — há teste com 70/30 provando isso.
