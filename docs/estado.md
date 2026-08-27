# Estado do projeto

Atualizado em 2026-08-12. Este arquivo responde "onde paramos" para quem chega agora —
inclusive uma sessão nova de agente, que não tem memória da conversa anterior.

## Onde estamos

**Fase 1, tarefa 9 de 14.** As oito primeiras estão concluídas, revisadas e commitadas.

O trabalho acontece na branch **`fase-1`**, que ainda **não foi mesclada em `main`** nem
enviada ao GitHub. A `main` está em `0ba0a6e`, com a documentação de design; todo o código
está na branch.

| Etapa | Tarefas | Situação |
|---|---|---|
| [01 — Fundação](plans/fase-1/01-fundacao.md) | 1, 2 | Concluída |
| [02 — Domínio](plans/fase-1/02-dominio.md) | 3, 4, 5, 6 | Concluída |
| [03 — Persistência e acesso](plans/fase-1/03-persistencia.md) | 7, 8, 9 | Tarefas 7 e 8 concluídas; **9 é a próxima** |
| [04 — Telas](plans/fase-1/04-telas.md) | 10, 11, 12, 13 | Pendente |
| [05 — Migração](plans/fase-1/05-migracao.md) | 14 | Pendente |

## O que já funciona

**68 testes passando**, sem banco e sem browser.

O domínio de cálculo, 58 testes:

- Dinheiro em centavos, com conversão e formatação em real
- Datas sem fuso, como string `AAAA-MM-DD`
- Competência a partir da data e do dia de fechamento, com o dia do fechamento inclusive
- Geração de parcelas, com a soma sempre fechando com o total
- Rateio do conjunto, com a sobra de centavos em destino determinístico
- **A matriz de totais reproduzindo a planilha de agosto** — é a prova de paridade

A regra de acesso, 10 testes: allowlist de e-mails, com lista vazia recusando todo mundo e
`email_verified` exigido antes de qualquer coisa.

Fora disso: o banco no Neon está de pé, com a migration aplicada e o seed rodado — 2 membros,
8 categorias, a conta C6 (fechamento 4, vencimento 10) e a conta Externa. O login com Google
está implementado, com middleware protegendo todas as rotas e tela de entrada.

## O que ainda não existe

Nenhuma tela do produto e nenhuma gravação de lançamento. Dá para entrar no sistema, mas não
há o que fazer depois de entrar. O sistema **ainda não substitui a planilha** — falta da
tarefa 9 em diante.

Duas lacunas que são decisão, não esquecimento, e estão detalhadas no
[índice da Fase 1](plans/fase-1/README.md#cobertura-e-lacunas-conhecidas): não há tela de
cadastro de categoria, e não há tela de resolução de conflito de edição simultânea.

## Serviços externos

| Serviço | Situação |
|---|---|
| Neon (Postgres) | Criado, migration aplicada, seed rodado |
| Google OAuth | Credenciais criadas; os dois e-mails já constam como *test users* em Público-alvo |
| Vercel | **Não criado.** Só é necessário para publicar |
| GitHub | Repositório privado `marcoshocampos/lancardespesas` |

Os segredos moram em `.env`, na raiz, a partir do `.env.example`. **`.env`, e não
`.env.local`** — o CLI do Prisma lê o primeiro nativamente e não lê o segundo, então
migrations não achariam a conexão. O arquivo está no `.gitignore` e nunca apareceu em
nenhum commit, o que foi verificado na árvore inteira.

## Como retomar

```bash
git switch fase-1
npm install
npm test
```

Depois abra [`docs/plans/fase-1/README.md`](plans/fase-1/README.md), veja qual é a próxima
tarefa nesta página, e execute só ela. Leia também
[`docs/decisoes.md`](decisoes.md) antes de mudar qualquer escolha estrutural — várias
parecem melhoráveis e não são.

## Pendências menores para triar

Encontradas em revisão, classificadas como menores e adiadas de propósito. Nenhuma bloqueia
o trabalho atual; todas devem ser triadas na revisão final da Fase 1.

1. **`reaisParaCentavos('12,3,4')` devolve `1230` em silêncio** em vez de recusar. A
   desestruturação de `split(',')` descarta tudo depois da segunda vírgula. É a mais
   relevante das quatro: entrada plausível produzindo valor de dinheiro errado sem aviso.
2. **`avancarCompetencia` quebra antes do ano `0000`**, porque o operador `%` do JavaScript
   preserva o sinal do dividendo e o resultado vira mês zero ou negativo. Só alcançável com
   um delta na casa de -24000 meses; nenhum caminho do sistema chega perto.
3. **O ramo `TOTAL` de `gerarParcelas` nunca é exercitado com valor negativo.** Não é bug —
   com uma parcela a expressão colapsa e a soma fecha por álgebra —, mas é caminho sem teste.
4. **`ratear` produz `-0`** quando uma cota trunca para zero num valor negativo. A soma
   fecha e `toEqual` não distingue, mas pode morder teste futuro com `toBe` ou serialização
   que preserve o sinal.

## Histórico de commits da Fase 1

```
cae2eca  Exige e-mail verificado pelo Google antes da allowlist
d18df64  Restringe o acesso ao login Google com allowlist
41042a6  Modela o banco e semeia contas, categorias e membros
5d362a3  Adiciona o plano de implementacao da Fase 1
043b9dc  Registra que o Neon Auth fica desativado
fd1c63b  Documenta as variaveis de ambiente e protege os segredos
04adf84  Recusa entrada incoerente na matriz de totais
86753c6  Calcula a matriz de totais de pessoas por contas
69dceb0  Rateia lancamentos de escopo conjunto
30e4fa9  Gera as parcelas de um lancamento
1236a27  Calcula a competencia a partir da data e do fechamento da conta
fa408de  Adiciona os tipos base de dinheiro e data do dominio
e200f8c  Remove dependencia de teste de componente que nao e usada
50e6413  Cria o esqueleto do projeto com TypeScript estrito e Vitest
```
