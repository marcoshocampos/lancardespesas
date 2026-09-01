# Estado do projeto

Atualizado em 2026-08-13. Este arquivo responde "onde paramos" para quem chega agora —
inclusive uma sessão nova de agente, que não tem memória da conversa anterior.

## Onde estamos

**Fase 1 concluída, 15 tarefas, aguardando merge.** Todas passaram por revisão própria, e a
branch inteira passou por uma revisão final que encontrou um bug crítico e quatro importantes,
todos corrigidos e re-revisados.

O trabalho está na branch **`fase-1`**, que ainda **não foi mesclada em `main`** nem enviada
ao GitHub. A `main` continua em `0ba0a6e`, só com a documentação de design.

| Etapa | Tarefas | Situação |
|---|---|---|
| [01 — Fundação](plans/fase-1/01-fundacao.md) | 1, 2 | Concluída |
| [02 — Domínio](plans/fase-1/02-dominio.md) | 3, 4, 5, 6 | Concluída |
| [03 — Persistência e acesso](plans/fase-1/03-persistencia.md) | 7, 8, 9 | Concluída |
| [04 — Telas](plans/fase-1/04-telas.md) | 10, 11, 12, 13, 15 | Concluída |
| [05 — Migração](plans/fase-1/05-migracao.md) | 14 | Concluída |

A tarefa 15 não estava no plano original: nasceu da revisão final, que notou que as ações de
editar e excluir existiam desde a tarefa 9 **sem nenhum chamador**. Dava para lançar e não
dava para corrigir.

## O que já funciona

**96 testes passando**, mais 6 de banco atrás de `TESTE_DESTRUTIVO=1` e 1 de Playwright
pulado por exigir login.

O domínio de cálculo, puro e sem I/O:

- Dinheiro em centavos, com conversão e formatação em real. Recusa entrada ambígua: `129.54`
  com ponto **não** é aceito como 129 reais e 54 centavos, porque `1.234` seria indistinguível
  de mil duzentos e trinta e quatro
- Datas sem fuso, como string `AAAA-MM-DD`
- Competência a partir da data e do dia de fechamento, com o dia do fechamento inclusive
- Geração de parcelas, com a soma sempre fechando com o total
- Rateio do conjunto, com a sobra de centavos em destino determinístico
- **A matriz de totais reproduzindo a planilha de agosto** — é a prova de paridade
- Conferência do somado contra o valor real do extrato

O produto, ponta a ponta:

- Login com Google restrito à allowlist, com `email_verified` exigido e middleware protegendo
  todas as rotas, inclusive as que ainda não existem
- Grade do mês em `/despesas`, com filtro por conta, digitação inline, e editar e excluir
- Resumo em `/resumo`, com a matriz de pessoas por contas e a conferência da fatura
- Gravação com lock otimista e barreira de fatura travada em criar, editar e excluir
- Importador da planilha, que aborta alto em vez de descartar linha em silêncio

## O que ainda não existe

Nenhuma dessas ausências é esquecimento; todas foram decididas ou registradas em revisão.

- **Não há tela para travar ou destravar fatura.** Toda a maquinaria existe e é respeitada
  pelas gravações, mas só é acionável por SQL direto. A mensagem "destrave a fatura" que
  aparece na interface, portanto, aponta para algo que ainda não dá para fazer pela tela
- **Não há tela de cadastro de categoria.** O seed cria as oito; categoria nova sai pelo
  `prisma studio`
- **Não há tela de lixeira.** A exclusão marca `deletadoEm` e não apaga, mas para o casal o
  efeito é definitivo até a Fase 3
- **Não há tela de resolução de conflito.** A proteção contra sobrescrita existe e a recusa
  aparece, mas sem o comparativo lado a lado
- **Não há tela para marcar reembolso como recebido**, e a regra de negócio diz que reembolso
  sai dos relatórios de gasto do casal, o que o cálculo ainda não faz
- **O status `CONFERIDA` nunca é gravado** — toda fatura permanece `ABERTA`
- **`Recorrente` e `Preferencia` não existem no banco**, por serem de Fase 2

## Serviços externos

| Serviço | Situação |
|---|---|
| Neon (Postgres) | Criado, migration aplicada, seed rodado |
| Google OAuth | Credenciais criadas; os dois e-mails constam como *test users* em Público-alvo |
| Vercel | **Não criado.** Só é necessário para publicar |
| GitHub | Repositório privado `marcoshocampos/lancardespesas` |

Os segredos moram em `.env`, na raiz, a partir do `.env.example`. **`.env`, e não
`.env.local`** — o CLI do Prisma lê o primeiro nativamente e não lê o segundo, então
migrations não achariam a conexão. O arquivo está no `.gitignore` e nunca apareceu em nenhum
commit, o que foi verificado na árvore inteira.

## Como retomar

```bash
git switch fase-1
npm install
npm test
```

O banco está **zerado de propósito**: zero lançamentos, com o seed intacto. É assim que ele
deve estar antes da importação da planilha.

Para ver as telas com conteúdo, `npx tsx scripts/dados-ficticios.ts criar` insere dez
lançamentos inventados e `... limpar` os remove — ele só apaga o que ele mesmo criou.

Leia [`docs/decisoes.md`](decisoes.md) antes de mudar qualquer escolha estrutural.

## Antes de usar de verdade

1. **Testar o login no navegador**, com um e-mail da allowlist e um de fora. É o único teste
   que nenhum agente conseguiu fazer
2. **Importar a planilha.** O leitor foi validado contra o arquivo real de agosto: lê o
   formato colunar da exportação do Sheets, confere a soma do cartão contra a linha
   `FATURA:` e desfaz tudo se não bater. O comando está no cabeçalho do script
3. **Publicar na Vercel**, se quiserem acessar de fora de casa

## Pendências menores para triar

Sobraram seis, todas triadas na revisão final como não bloqueantes. As duas que bloqueavam
— o parser de dinheiro aceitando entrada ambígua e a suíte destrutiva deixando lançamento no
banco — já foram corrigidas.

1. **`avancarCompetencia` quebra antes do ano `0000`**, porque o `%` do JavaScript preserva o
   sinal do dividendo. Só alcançável com um delta na casa de -24000 meses
2. **O ramo `TOTAL` de `gerarParcelas` nunca é exercitado com valor negativo.** Não é bug: com
   uma parcela a expressão colapsa e a soma fecha por álgebra
3. **`ratear` produz `-0`** quando uma cota trunca para zero num valor negativo
4. **O middleware não exclui `public/`**, então asset estático também redireciona. Proteção a
   mais, nunca a menos; vai incomodar quando entrar `robots.txt` ou manifest
5. **A mensagem de recusa em `linha-nova.tsx` ignora o `motivo`.** Hoje só existe um
6. **`docs/regras-de-negocio.md` descreve "editar uma parcela" sem redistribuir as demais**,
   enquanto `editarLancamento` sempre regera todas. Divergência entre documento e código

Também sem transação: `gravarFilhos` faz `deleteMany` e `createMany` separados, então uma
falha entre os dois deixaria lançamento sem parcela.

## Histórico de commits da Fase 1

```
157afc4 Liga editar e excluir lancamento na grade de despesas
feb0e91 Unifica competenciaAtual() e corrige o fuso
1cebb78 Limpa o banco tambem depois da suite destrutiva
0c32a08 Fatura travada recusa novo valor de extrato
6b99685 Ordena a leitura do rateio igual a gravacao
a6cf4b5 Recusa ponto sem virgula em vez de adivinhar o valor em dinheiro
361bac7 Testa o aborto contra o mapa de producao
4bb9db3 Aceita so os cabecalhos de sub-bloco que a planilha tem
b64df6a Recusa planilha com Outros fora de ordem
752b01b Aceita Conjunto e os cabecalhos antigos no bloco Outros
cf2e1e3 Importa tambem as despesas fora do cartao
99c9a06 Importa o mes corrente e as parcelas em aberto da planilha
ede0e86 Extrai o limite de dia do mes para o dominio
642c085 Confere a fatura contra o valor real do extrato
077f65b Mostra a matriz de totais de pessoas por contas
b6a2068 Permite lancar despesas direto na grade do mes
be0012d Reorganiza a documentacao e marca o que nasce so na Fase 2
6768a6c Lista as parcelas do mes com filtro por conta
3377fef Barra gravacao em fatura travada nos dois sentidos
74f25d2 Grava lancamentos com lock otimista e parcelas automaticas
cae2eca Exige e-mail verificado pelo Google antes da allowlist
d18df64 Restringe o acesso ao login Google com allowlist
41042a6 Modela o banco e semeia contas, categorias e membros
5d362a3 Adiciona o plano de implementacao da Fase 1
043b9dc Registra que o Neon Auth fica desativado
fd1c63b Documenta as variaveis de ambiente e protege os segredos
04adf84 Recusa entrada incoerente na matriz de totais
86753c6 Calcula a matriz de totais de pessoas por contas
69dceb0 Rateia lancamentos de escopo conjunto
30e4fa9 Gera as parcelas de um lancamento
1236a27 Calcula a competencia a partir da data e do fechamento da conta
fa408de Adiciona os tipos base de dinheiro e data do dominio
e200f8c Remove dependencia de teste de componente que nao e usada
50e6413 Cria o esqueleto do projeto com TypeScript estrito e Vitest
```
