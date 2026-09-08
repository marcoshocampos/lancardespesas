# Arquitetura

Mapa do código por camadas, para quem vai mexer. Complementa os outros documentos:

| Documento | Responde |
|---|---|
| [`estado.md`](estado.md) | Onde paramos e o que falta |
| [`decisoes.md`](decisoes.md) | Escolhas que parecem melhoráveis e não são |
| [`regras-de-negocio.md`](regras-de-negocio.md) | Como o sistema se comporta |
| [`specs/`](specs/2026-08-08-sistema-despesas-casal-design.md) | Por que ele é assim |
| **este arquivo** | **Onde cada coisa mora e como acrescentar** |

## A ideia central

Quatro camadas, com uma regra de dependência que **não pode ser quebrada**: cada uma só
conhece as de baixo.

```
src/app/          rotas e fronteiras — onde o mundo externo entra
   ↓
src/components/   UI, sem I/O próprio
   ↓
src/server/       banco, sessão, gravação
   ↓
src/domain/       regras de cálculo, puras, sem I/O nenhum
```

O domínio não sabe que existe banco, tela ou HTTP. É isso que torna cada caso de borda
testável em milissegundos, e é onde moram os bugs que custam caro.

---

## Camada 1 — `src/domain/`

Funções puras. Argumentos entram, valor sai. **Nada de Prisma, `fetch`, `Date.now()` ou
`new Date()`.** Cada arquivo tem um `.test.ts` irmão.

| Módulo | O que garante | Interface |
|---|---|---|
| `money.ts` | Dinheiro é inteiro em centavos, e entrada ambígua é recusada | `Centavos`, `reaisParaCentavos`, `formatarBRL` |
| `data.ts` | Data sem fuso, como string `AAAA-MM-DD` | `DataISO`, `partesDaData`, `ultimoDiaDoMes`, `diaClampeado` |
| `competencia.ts` | Em qual fatura um lançamento cai | `Competencia`, `competenciaDeCartao`, `competenciaDeContaExterna`, `competenciaDeDataISO`, `avancarCompetencia`, `compararCompetencias`, `formatarCompetencia` |
| `parcelamento.ts` | A soma das parcelas é exatamente o total | `OrigemValor`, `EntradaParcelamento`, `ParcelaGerada`, `gerarParcelas` |
| `rateio.ts` | A soma das cotas é exatamente o valor rateado | `PesoRateio`, `Cota`, `pesosMeioAMeio`, `ratear` |
| `totais.ts` | A matriz de pessoas por contas, reproduzindo a planilha | `COLUNA_TOTAL`, `ParcelaResumo`, `LinhaMatriz`, `ResumoMes`, `calcularResumo` |
| `conferencia.ts` | O somado contra o valor real do extrato | `SituacaoConferencia`, `Conferencia`, `conferir` |
| `fixtures/agosto-2026.ts` | Os números reais de agosto, congelados | `PARCELAS_AGOSTO_2026` |

**A fixture é a prova de paridade.** Se os totais dela deixarem de bater, o cálculo quebrou —
não conserte o teste.

`calcularResumo` **lança** para entrada incoerente: conta desconhecida, parcela pessoal sem
membro, conjunto sem rateio, cotas que não fecham. Isso é proposital. Não envolva em
`try/catch` para "a tela não quebrar": se disparar, há dado corrompido e alguém precisa saber.

## Camada 2 — `src/server/`

A ponte com o banco e a sessão. Aqui pode haver I/O; aqui **não** pode haver regra de cálculo.

### Infraestrutura

- `db.ts` — o cliente Prisma singleton. Evita esgotar conexão no hot reload.
- `auth.ts` — Auth.js v5, provider Google, sessão em JWT, sem tabela de auth no banco.
- `auth-regras.ts` — `emailAutorizado` e `loginPermitido`, **puras e testadas**. A regra de
  acesso mora fora do Auth.js de propósito, para ser testável sem browser. Lista vazia recusa
  todo mundo; `email_verified` ausente recusa.

### Repositórios — leitura e gravação

| Arquivo | Interface |
|---|---|
| `repositorios/lancamento.ts` | `EntradaLancamento`, `ResultadoCriacao`, `ResultadoGravacao`, `criarLancamento`, `editarLancamento`, `excluirLancamento` |
| `repositorios/resumo.ts` | `LinhaGrade`, `carregarParcelasDaCompetencia`, `carregarLinhasDaGrade` |
| `repositorios/fatura.ts` | `ResultadoRegistroValorReal`, `registrarValorReal`, `carregarValorReal` |

As gravações devolvem resultado tratável em vez de lançar:
`{ ok: false, motivo: 'CONFLITO' | 'FATURA_TRAVADA' }`. **Quem chama tem que tratar** — recusa
engolida como sucesso faz a pessoa achar que salvou.

### Actions — a fronteira do cliente

`actions/lancamento.ts` e `actions/fatura.ts`. Toda action **valida com Zod e exige sessão**
antes de qualquer gravação, e propaga o resultado do repositório sem engolir.

## Camada 3 — `src/components/`

React. Sem I/O próprio: recebem dados por prop e chamam actions.

| Componente | Papel |
|---|---|
| `navegacao.tsx` | O casco: troca de tela e de mês, preservando o contexto |
| `chips-conta.tsx` | Filtro por conta na grade |
| `grade-lancamentos.tsx` | A grade do mês, uma linha por **parcela** |
| `linha-nova.tsx` | Digitação inline. É o padrão da casa para formulário que chama action |
| `linha-edicao.tsx` | Edição de um lançamento inteiro |
| `matriz-resumo.tsx` | A matriz de pessoas por contas |
| `conferencia-fatura.tsx` | O valor do extrato e a diferença |

**Componente não calcula.** Se você sentir vontade de somar algo aqui, a conta pertence ao
domínio.

## Camada 4 — `src/app/`

Rotas do App Router e as fronteiras com o mundo.

- `layout.tsx` — o shell e o `metadata`
- `(auth)/entrar/` — a tela de login
- `despesas/` — a grade do mês
- `resumo/` — a matriz e a conferência
- `api/auth/[...nextauth]/` — os handlers do Auth.js
- `competencia-atual.ts` — **a única fronteira de fuso horário do sistema.** Converte "hoje"
  para competência no fuso de São Paulo. Nenhum outro lugar deve chamar `new Date()` para
  descobrir o mês corrente.
- `src/middleware.ts` — protege todas as rotas. Rota nova nasce protegida.

Em página de rota, `searchParams` é **Promise** no Next 16 e precisa de `await`.

## Fora das camadas

### `prisma/`

`schema.prisma` com `Membro`, `Conta`, `Categoria`, `Lancamento`, `Parcela`, `Rateio`,
`Fatura`, `Auditoria`, e os enums. `seed.ts` cria os membros a partir de `EMAILS_AUTORIZADOS`,
as contas C6 e Externa, e as oito categorias.

**Datas e competências são `String` no banco, de propósito.** `DateTime` faria alguma camada
aplicar fuso e mover a compra do dia do fechamento para a fatura errada.

`Recorrente` e `Preferencia` estão na spec mas **não existem no banco** — são de Fase 2.

### `scripts/`

- `importar-planilha.ts` — migração de uma vez só, do CSV colunar exportado do Sheets
- `dados-ficticios.ts` — popula as telas com dez lançamentos inventados, e apaga só o que criou

---

## Como acrescentar coisas

**Uma regra de cálculo nova:** nasce em `src/domain/`, com teste, antes de existir tela ou
query. Se ela precisa de banco para ser testada, ela está na camada errada.

**Uma tela nova:** rota em `src/app/`, componente em `src/components/`, leitura em
`src/server/repositorios/`. A rota já nasce protegida pelo middleware. Acrescente o destino em
`navegacao.tsx` — mas só depois que a página existir.

**Um campo novo no banco:** schema, migration, e **confira se alguma leitura precisa de
`orderBy` novo**. Já tivemos um bug em que a ordem vinha do Postgres e o resultado mudava
entre carregamentos da mesma página.

**Uma gravação nova:** lock otimista com `WHERE versao = ?`, barreira de fatura travada nos
**dois sentidos** (de onde sai e para onde vai), e resultado tratável em vez de exceção.

---

## Armadilhas que já morderam

Cada uma custou uma rodada de correção nesta base. Estão aqui para não custarem duas.

1. **A grade mostra parcela, não lançamento.** `LinhaGrade.valorCentavos` é o valor da
   parcela; `lancamentoValorCentavos` é o do lançamento. Confundir os dois fez a edição
   encolher uma compra a cada salvamento: R$ 1.000 em 5x virou R$ 200, depois R$ 40.

2. **O rateio é calculado sobre o valor da parcela.** Um parcelado de conjunto de R$ 101,01
   rateia 101,01 por mês, não o total da compra. O número errado continua plausível.

3. **Fatura travada precisa barrar os dois sentidos.** Barrar só a competência de origem deixa
   uma edição mover a parcela **para dentro** de um mês fechado.

4. **Middleware sem `callbacks.authorized` não bloqueia nada.** O `signIn` decide quem entra;
   o `authorized` decide quem passa. Sem o segundo, todas as rotas respondem 200.

5. **O parser de dinheiro recusa ponto sem vírgula.** `129.54` é ambíguo, porque `1.234` tanto
   pode ser mil duzentos e trinta e quatro quanto um e vinte e três. Recusar é mais barato que
   gravar cem vezes o valor.

6. **A suíte destrutiva recusa rodar se houver lançamento no banco.** O banco é o de produção
   do casal. Se precisar rodá-la, aponte `DATABASE_URL` para um banco vazio.

7. **O Neon hiberna.** A primeira conexão depois de um tempo parado pode falhar; tente de novo
   antes de concluir que está fora do ar.

8. **Aviso de suposição em relatório merece verificação.** Duas vezes um implementador escreveu
   "isto é suposição minha, confira antes" e seguimos em frente. A primeira custou três
   rodadas de correção; a segunda, a reescrita inteira do leitor da planilha.
