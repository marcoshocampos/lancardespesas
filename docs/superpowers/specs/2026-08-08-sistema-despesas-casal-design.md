# Sistema de lançamento de despesas do casal — documento de design

**Data:** 2026-08-08
**Status:** desenho aprovado; uma decisão de UI em aberto (ver seção 11)
**Proposta visual:** https://claude.ai/code/artifact/542e24e6-fa0e-4d68-9f86-2d1c84db0c16

---

## 1. Contexto

Nardy e Nick controlam as despesas do casal numa planilha do Google Sheets, com uma aba por
mês. Cada aba tem três blocos de lançamento — Nardy, Nick e Conjunto — com as colunas
`Descrição | Valor | Parcela | Categoria`, mais um bloco `OUTROS` com as transferências que
um deve ao outro.

A fatura de referência é o cartão **C6**, que **fecha dia 04 e vence dia 10**. A competência
é o mês do vencimento: compras de 05/07 a 04/08 fecham em 04/08, vencem em 10/08 e caem na
aba "Agosto".

Os totais derivados da planilha são, nesta ordem: `TOTAL` por bloco → `METADE` do conjunto →
`TOTAL GERAL` por pessoa (bloco pessoal + metade do conjunto) → `FATURA` (soma dos três blocos).

Categorias em uso: Terceiros, Veículo, Compra Online, Jogo, Beleza, Medicação, Presente,
Assinatura.

## 2. Problema

A planilha calcula certo. O que ela não faz:

1. **Redigitação de parcelas.** Cada parcela de cada compra é digitada à mão, todo mês.
   Uma compra em 12x custa doze digitações.
2. **Sem visão do futuro.** Não há como saber quanto um mês seguinte já tem comprometido
   antes de assumir mais um parcelado.
3. **Sem visão do passado.** Cada mês vive numa aba isolada; nenhuma pergunta que atravesse
   meses tem resposta sem abrir aba por aba.
4. **Saldo entre as pessoas calculado de cabeça**, somando o bloco `OUTROS` manualmente.
5. **Conferência da fatura manual**, sem apontamento de diferença.

## 3. Objetivos e não-objetivos

**Objetivos**

- Substituir integralmente a planilha, sem perder nenhum uso atual.
- Eliminar a redigitação de parcelas.
- Responder perguntas que atravessam meses.
- Tornar o fechamento mensal um fluxo guiado e verificável.
- Não perder nem corromper dado, nunca.

**Não-objetivos**

- Não é um gerenciador financeiro completo: sem receitas, saldo de conta ou investimentos.
- Não é ferramenta de orçamento: registra e mostra, não impõe metas.
- Não é multiusuário além do casal.

## 4. Decisões de produto

| Tema | Decisão |
|---|---|
| Escopo | Cartões de crédito + despesas avulsas (pix, débito, dinheiro, boleto) |
| Cartões | Cadastráveis, cada um com dia de fechamento e vencimento próprios |
| Parcelas | Geradas automaticamente na compra; cada parcela é editável ou cancelável |
| Conjunto | Rateio 50/50 por padrão, ajustável por lançamento |
| Terceiros | Reembolso externo com status pendente/recebido; não conta como gasto do casal |
| Pagamento da fatura | Sai de conta conjunta; **não** gera dívida entre as pessoas |
| Saldo entre pessoas | Fecha por mês, com o acumulado dos meses não quitados visível |
| Categorias | Começa com as 8 da planilha; criáveis, renomeáveis e arquiváveis na tela |
| Etiquetas | Rótulos livres que cruzam categorias (ex.: "viagem", "reforma") |
| Recorrentes | Despesas fixas geradas automaticamente a cada competência |
| Entrada de dados | Grade com digitação por teclado, autocomplete com memória, copiar do mês anterior |
| Estornos | Lançamento de valor negativo (devolução, cashback, desconto) |
| Conferência | Valor real da fatura digitado e comparado com a soma dos lançamentos |
| Fechamento | Fluxo guiado de 4 passos, terminando com a fatura travada |
| Robustez | Lixeira, histórico de alterações, proteção contra edição simultânea |
| Exportação | CSV/Excel a qualquer momento; PDF do relatório mensal com gráficos |
| Backup | Dump mensal automático, cifrado, fora do provedor do banco |
| Relatórios | Gasto por categoria no mês; evolução mês a mês; projeção de parcelas futuras |
| Alerta | Aviso quando um mês futuro ultrapassa um limite definido pelo casal |
| Migração | Mês corrente + todas as parcelas em aberto; histórico antigo fica na planilha |
| Plataforma | Web, desktop-first |
| Acesso | Login com Google, restrito a uma lista de e-mails autorizados |

## 5. Modelo de domínio

### 5.1 O conceito central

A planilha tem três mecanismos que parecem distintos — os blocos por pessoa, as linhas
vermelhas de `Terceiros` e o bloco `OUTROS` — mas os três respondem às mesmas duas perguntas:
**de quem é o gasto** e **quem bancou**. Modelando esses dois eixos separadamente, os quatro
casos reais se resolvem com um único tipo de lançamento:

| Caso real (agosto) | De quem é | Quem bancou | Consequência |
|---|---|---|---|
| `loja online R$ 25,00` | Nardy | Conta conjunta | Rateio apenas; nenhuma dívida |
| `fone + suporte R$ 101,01` | Conjunto | Conta conjunta | Divide 50/50; alimenta `METADE` |
| `aparelho R$ 100,00` | Pessoa externa | Conta conjunta | Vira "a receber" com status |
| `manutenção da moto R$ 80,00` | Nick | Nardy, do bolso | Dívida Nick → Nardy, em 4 parcelas |

**Regra que fecha o raciocínio:** o que sai da conta conjunta não gera dívida entre as pessoas
— ali o rateio serve para consciência de gasto. Dívida só nasce quando uma pessoa banca algo
da outra com dinheiro próprio.

### 5.2 Entidades

**Membro** — nome, e-mail Google, cor, ativo. Genérico para N membros; hoje são dois.

**Cartão** — nome, dia de fechamento, dia de vencimento, cor, ativo.
Instância inicial: C6, fechamento 04, vencimento 10.

**Categoria** — nome, cor, ícone, arquivada. Nasce com as 8 da planilha.

**Etiqueta** — nome, cor. Relação N:N com lançamento.

**Lançamento** — o núcleo:
- `descrição`, `valorCentavos`, `dataCompra`, `categoriaId`
- `escopo`: `PESSOAL` (com `membroId`) ou `CONJUNTO`
- `formaPagamento`: `CARTAO` (com `cartaoId`) ou `PIX` / `DEBITO` / `DINHEIRO` / `BOLETO`
  (com `pagadorMembroId`)
- `numeroParcelas`, e a origem do valor digitado (`POR_PARCELA` ou `TOTAL`)
- `reembolso` opcional: `tipo` (`MEMBRO` ou `EXTERNO`), `devedorMembroId` ou `devedorNome`,
  `status` (`PENDENTE` / `RECEBIDO`)
- `versao` (lock otimista), `deletadoEm` (lixeira)

**Parcela** — filha do lançamento: `numero`, `valorCentavos`, `competencia` (`AAAA-MM`),
`cancelada`. É o que aparece na grade do mês.

**Rateio** — para lançamentos de escopo `CONJUNTO`: `membroId`, `percentual`. Sempre gravado
explicitamente, mesmo quando é o 50/50 padrão.

**Fatura** — `cartaoId`, `competencia`, `dataFechamento`, `dataVencimento`,
`valorRealCentavos` (digitado pelo casal para conferência), `status`
(`ABERTA` / `CONFERIDA` / `TRAVADA`), `travadaEm`.

**Recorrente** — descrição, valor, categoria, escopo, forma de pagamento, dia do mês,
`dataInicio`, `dataFim`, ativa.

**Acerto** — pagamento entre membros: `deMembroId`, `paraMembroId`, `valorCentavos`, `data`,
`observacao`.

**Auditoria** — `tabela`, `registroId`, `membroId`, `acao`, `diff` (JSON), `criadoEm`.

## 6. Regras de cálculo

Todas implementadas como funções puras, sem I/O, e testadas isoladamente.

1. **Competência.** `dataCompra` + `cartao.diaFechamento` → competência da fatura. Compra até
   o dia do fechamento entra na fatura que fecha naquele mês; depois disso, na seguinte.
   O resultado é sempre editável pelo usuário.
2. **Parcelamento.** A parcela `n` cai em `competenciaBase + (n-1)` meses. Quando o valor
   digitado é o total, a divisão é em centavos e a diferença de arredondamento vai na
   **última** parcela.
3. **Rateio.** Lançamento `CONJUNTO` gera cotas por membro, 50/50 por padrão. A soma das cotas
   é sempre igual ao valor da parcela, com o resto de centavos em uma cota definida.
4. **Totais do mês.** `TOTAL` por pessoa e para o conjunto → `METADE` → `TOTAL GERAL` por
   pessoa → `FATURA` (soma dos três). Devem reproduzir exatamente os números da planilha.
5. **Saldo entre membros.** Somam apenas lançamentos avulsos pagos por um membro em benefício
   de outro, e reembolsos entre membros. Saldo do mês, mais o acumulado dos meses não
   quitados, menos os acertos registrados.
6. **Reembolso externo.** Sai do total de gasto do casal nos relatórios, mas permanece na
   fatura — porque o dinheiro efetivamente saiu.

**Dinheiro é sempre inteiro em centavos.** Nenhum `float` em nenhuma camada.
**Datas são `date` sem hora**, com timezone fixo `America/Sao_Paulo`.

## 7. Arquitetura

### 7.1 Camadas

```
src/
  domain/          # regras puras, zero I/O
    money.ts       # centavos, formatação BRL
    competencia.ts # data + fechamento → qual fatura
    parcelamento.ts# geração de parcelas e arredondamento
    rateio.ts      # divisão do conjunto
    totais.ts      # TOTAL / METADE / TOTAL GERAL / FATURA
    saldo.ts       # dívidas e acertos entre membros
  server/          # Prisma, repositórios, server actions, validação Zod
  app/             # rotas Next (App Router)
  components/      # UI
```

O motivo da separação: os bugs caros deste domínio são de cálculo e aparecem meses depois —
a parcela que caiu no mês errado, o centavo que sumiu, a compra do dia do fechamento que foi
para a fatura errada. Isolados em funções puras, cada um desses casos vira um teste rápido
sem banco e sem browser.

### 7.2 Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript estrito |
| Banco | Postgres no Neon + Prisma |
| Auth | Auth.js v5, provider Google, allowlist de e-mails |
| UI | Tailwind + shadcn/ui + TanStack Table |
| Gráficos | Recharts |
| Testes | Vitest no domínio; Playwright em fluxos críticos |
| Hospedagem | Vercel |

### 7.3 Pontos de robustez

- **Edição simultânea.** `lancamento.versao` incrementa a cada gravação; a action grava com
  `WHERE versao = ?` e, ao falhar, apresenta o conflito com o valor atual em vez de sobrescrever.
- **Lixeira.** `deletadoEm` em vez de `DELETE`; restauração pela UI.
- **Auditoria.** Gravada na camada de repositório, com diff em JSON.
- **Trava de fatura.** Fatura `TRAVADA` é somente-leitura; destravar é uma ação explícita e
  auditada.
- **Backup.** GitHub Action mensal executando `pg_dump` e guardando o dump cifrado em
  repositório privado, independente do provedor do banco.

### 7.4 PDF

Página de relatório com CSS de impressão e um botão que dispara `window.print()`, gerando o
PDF pelo próprio navegador. Aproveita os gráficos Recharts reais, sem duplicar layout nem
adicionar dependência pesada de renderização no servidor.

Limitação aceita: não gera PDF agendado sem alguém clicar. Se envio automático virar
requisito, aí entra uma biblioteca de geração no servidor.

### 7.5 Migração da planilha

Script de uso único em `scripts/importar-planilha.ts`, lendo o CSV exportado da aba do mês e
criando as compras com as parcelas restantes já posicionadas nas competências corretas. Não
vira tela nem funcionalidade do produto.

## 8. Telas

1. **Mês** — a grade principal, com os totais do mês. Layout em aberto (seção 11).
2. **Lançamento** — linha inline na grade; modal apenas para parcelamento, reembolso e
   rateio customizado.
3. **Faturas** — lista por cartão, com conferência contra o valor real e status.
4. **Fechamento** — fluxo guiado: revisar fixos → conferir fatura → acertar saldo → travar mês.
5. **Saldo entre vocês** — saldo do mês, acumulado, e registro de pagamento.
6. **A receber** — pendências de reembolso externo.
7. **Relatórios** — os três gráficos, com exportação em PDF.
8. **Busca** — por descrição, valor, categoria, pessoa, etiqueta e período.
9. **Configurações** — membros, cartões, categorias, etiquetas, recorrentes, limite de alerta.
10. **Lixeira** — restauração de lançamentos excluídos.

## 9. Fases de entrega

**Fase 1 — paridade com a planilha.** Sem isso a planilha não pode ser abandonada.
Auth e allowlist; cadastros; grade do mês; parcelamento automático; rateio; totais; estornos;
faturas com conferência; saldo entre membros e acertos; proteção contra edição simultânea;
importação do mês corrente e das parcelas em aberto.

Dois itens estão nesta fase por dependência, não por conveniência. **Estornos** entram aqui
porque sem valor negativo a conferência da fatura não fecha em nenhum mês que tenha tido
devolução, e conferência é requisito da Fase 1. **Proteção contra edição simultânea** entra
aqui porque custa uma coluna e uma cláusula `WHERE` durante a modelagem, e vira retrabalho
em toda action depois.

**Fase 2 — o que a planilha não faz.** Recorrentes; a receber de terceiros; relatórios e
gráficos; exportação PDF/CSV; busca global; etiquetas; alerta de pico.

**Fase 3 — ritual e rede de segurança.** Fechamento guiado com trava de fatura; lixeira;
histórico de alterações; backup automático.

## 10. Fora de escopo

Decididos e descartados; todos podem voltar se virarem dor real:

- Integração bancária / Open Finance
- Orçamento e metas por categoria
- Receitas, saldo de contas e investimentos
- Anexo de comprovante (exige armazenamento de arquivos)
- Importação de CSV/OFX da fatura
- Quitação antecipada de parcelamento com botão dedicado (dá para cancelar as parcelas
  futuras manualmente)
- Lançamento por interpretação de texto livre
- Aplicativo nativo e multi-moeda
- Rateio entre mais de duas pessoas nos moldes de um Splitwise

## 11. Questões em aberto

Aguardando a revisão do casal sobre a proposta visual.

1. **Layout da tela do mês.** Opção A (três painéis, fiel à planilha) ou opção B (lista única
   com coluna "de quem"). Recomendação registrada: **opção B**.
2. **Categorias.** As 8 atuais bastam, ou falta alguma que hoje é forçada numa categoria
   errada (mercado, casa, alimentação, pet)?
3. **Etiquetas.** Quais eventos concretos seriam marcados.
4. **Limite de alerta.** A partir de qual valor um mês futuro merece aviso. Referência real:
   setembro está em R$ 1.100,00 e os cinco meses seguintes em R$ 600,00.
5. **Dores não cobertas.** Qualquer incômodo mensal da planilha que não apareceu no desenho.

## 12. Pré-requisitos de ambiente

- Node.js 24.19.0 LTS — instalado em 2026-08-08
- npm 11.17.0 — instalado em 2026-08-08
- git 2.55.0 — presente
- GitHub CLI 2.97.0 — instalado em 2026-08-08
- Conta no Neon (Postgres) — pendente
- Conta na Vercel — pendente
- Credenciais OAuth do Google (client id e secret) — pendente

## Apêndice — dados de referência (agosto)

Números reais da planilha, usados para validar os cálculos na implementação.

**Totais:** Nardy `R$ 423,75` · Nick `R$ 500,75` · Conjunto `R$ 101,01` ·
Metade `R$ 50,50` · Total geral Nardy `R$ 474,25` · Total geral Nick `R$ 551,26` ·
Fatura `R$ 1.025,51`

**Por categoria:** Veículo `R$ 900,00` · Compra Online `R$ 300,00` · Terceiros `R$ 120,00` ·
Medicação `R$ 110,00` · Beleza `R$ 95,00` · Presente `R$ 90,00` · Assinatura `R$ 88,00` ·
Jogo `R$ 60,00` — soma `R$ 1.025,51`, igual à fatura.

**Parcelas em aberto após agosto:** setembro `R$ 1.100,00` · outubro a fevereiro
`R$ 600,00`/mês · março `R$ 432,10`. O parcelamento do moto responde por `R$ 432,10`
mensais até junho de 2027.
