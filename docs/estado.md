# Estado do projeto

Atualizado em 2026-10-04. Este arquivo responde "onde paramos" para quem chega agora —
inclusive uma sessão nova de agente, que não tem memória da conversa anterior.

## Onde estamos

**Fase 1 e o redesenho visual estão os dois em `main`, enviados ao GitHub, e o sistema está
publicado em https://lancardespesas.vercel.app.** O merge do redesenho é o `39bb8e4`, com 61
commits. As branches de trabalho foram apagadas; só existe `main`.

**O login em produção está quebrado: falta `AUTH_SECRET` nas variáveis de ambiente da
Vercel.** Toda rota de `/api/auth/*` devolve 500 com `MissingSecret`, e a página mostra
*"Server error — There is a problem with the server configuration"*. O `.env` local tem a
variável; o ambiente de produção, não. Conserto: cadastrar no painel da Vercel, escopo
Production, **e refazer o deploy** — variável nova não alcança deploy que já existe.

Uma lição de leitura, registrada porque custou uma afirmação errada: este arquivo chegou a
dizer que *"o middleware funciona em produção"*, com base em ver `/despesas` redirecionar
para `/entrar`. O log mostrou que **aquele 307 vinha junto do mesmo `MissingSecret`** — o
redirecionamento acontecia apesar da configuração quebrada, não por causa dela funcionar.
Observar o resultado certo não prova o caminho certo. **A proteção de rota em produção
continua não verificada**, e só pode ser dada por boa depois que o segredo existir lá.

A allowlist também segue sem teste em produção, porque exige login de verdade.

O redesenho visual é o trabalho do plano
[`plans/redesenho-visual/`](plans/redesenho-visual/README.md): a camada visual que a Fase 1 não
construiu. As sete etapas estão concluídas, cada tarefa com revisão própria.

| Etapa | Entrega | Situação |
|---|---|---|
| [01 — Fundação](plans/redesenho-visual/01-fundacao.md) | Tokens, tipografia, shadcn revestido, login | Concluída |
| [02 — Casco](plans/redesenho-visual/02-casco.md) | Grupo `(app)/`, barra lateral, faixa de competência | Concluída |
| [03 — Grade](plans/redesenho-visual/03-grade.md) | `agrupamento.ts`, seções por pessoa, chips, estados vazios | Concluída |
| [04 — Painel](plans/redesenho-visual/04-painel.md) | Criar e editar fundidos, dica de competência, diálogo de exclusão | Concluída |
| [05 — Resumo](plans/redesenho-visual/05-resumo.md) | Cartões, matriz em bandas, conferência, fronteira de erro | Concluída |
| [06 — Configurações](plans/redesenho-visual/06-configuracoes.md) | Repositório, actions e as três listas | Concluída |
| [07 — Acabamento](plans/redesenho-visual/07-acabamento.md) | Varredura de cor, verificação guiada, documentação, fechamento | T1 e T3 feitas; **T2 não**; T4 depende da T2 |

**A Tarefa 2 da Etapa 07 — a conferência visual tela a tela — não foi feita por ninguém**, e a
razão é simples: tudo da Etapa 02 em diante está atrás do login com Google, e nenhum agente
conseguiu entrar. É a dívida 1 mais abaixo, e é ela que segura a Tarefa 4, o fechamento.

Três consertos nasceram fora do plano, de revisão, e entraram junto: conta inativa com
histórico derrubando o mês (`9232252`), categoria arquivada sendo trocada em silêncio ao editar
(`29d7538`), e o reset de formulário do React 19 apagando o que foi digitado (`35ba027`). Os
três viraram armadilha registrada em [`arquitetura.md`](arquitetura.md).

## O que já funciona

**`npm test` hoje: 118 passando e 12 pulados, em 10 arquivos passando e 3 pulados.** Saída
literal:

```
 Test Files  10 passed | 3 skipped (13)
      Tests  118 passed | 12 skipped (130)
```

Os 12 pulados são **todos** os testes de banco, atrás de `TESTE_DESTRUTIVO=1`, em três
arquivos: `repositorios/configuracao.test.ts` (5), `repositorios/lancamento.test.ts` (6) e
`repositorios/resumo.test.ts` (1). Eles **passaram a rodar** — `npm run test:banco`, 130
passando, nenhum pulado; a seção sobre isso está mais abaixo. Ficam fora do `npm test` de
propósito, para que a suíte rápida continue sem rede e sem banco.

O Playwright de `e2e/` é pulado à parte e **não** entra no `npm test`, que é `vitest run`.

O domínio de cálculo, puro e sem I/O:

- Dinheiro em centavos, com conversão e formatação em real. Recusa entrada ambígua: `129.54`
  com ponto **não** é aceito como 129 reais e 54 centavos, porque `1.234` seria indistinguível
  de mil duzentos e trinta e quatro
- Datas sem fuso, como string `AAAA-MM-DD`
- Competência a partir da data e do dia de fechamento, com o dia do fechamento inclusive
- Geração de parcelas, com a soma sempre fechando com o total
- Rateio do conjunto, com a sobra de centavos em destino determinístico
- **A matriz de totais reproduzindo a planilha de agosto** — é a prova de paridade
- Conferência do somado contra o valor real do extrato, e o **fechamento do mês**: registrar o
  extrato grava `CONFERIDA` quando bate e desfaz quando é corrigido para um valor que não bate;
  travar exige o extrato preenchido, deixa a fatura somente-leitura e grava quem fechou na
  tabela `Auditoria`; destravar pede confirmação e devolve o status ao que o extrato diz, não a
  `ABERTA` por decreto. **Verificado por execução** contra o banco real, com o estado restaurado
  depois — o ciclo inteiro, incluindo a recusa de lançar com a fatura travada
- Agrupamento com subtotal e contagem, que lança para chave desconhecida ou repetida em vez de
  descartar ou duplicar em silêncio

O produto, ponta a ponta:

- Login com Google restrito à allowlist, com `email_verified` exigido e middleware protegendo
  todas as rotas, inclusive as que ainda não existem
- Grade do mês em `/despesas`, com filtro por conta, e editar e excluir
- Resumo em `/resumo`, com a matriz de pessoas por contas e a conferência da fatura
- Gravação com lock otimista e barreira de fatura travada em criar, editar e excluir
- Importador da planilha, que aborta alto em vez de descartar linha em silêncio

O que a branch `navegacao` acrescentou — **camada visual, sem tocar em nenhum cálculo**:

- **Um casco comum** às telas com sessão, no grupo de rota `(app)/`: barra lateral com os
  destinos, identidade de quem está logado e botão de sair — que até então não existia em
  lugar nenhum do sistema. As URLs não mudaram
- **Navegação que preserva contexto:** trocar de tela preserva o mês, trocar de mês preserva o
  filtro de conta. Gráficos e Lixeira aparecem desabilitados, porque as páginas não existem
- **Faixa de competência** com o mês, as setas de mês, e os totais do mês por membro e por
  fatura de cartão — pelo mesmo `calcularResumo` que o Resumo usa, então as duas telas não
  divergem
- **Grade em seções por pessoa**, com cabeçalho, subtotal por seção e dois estados vazios
  distintos (mês sem lançamento × filtro que não bateu)
- **Painel único de lançamento:** criar e editar no mesmo lugar, com a dica dizendo em qual
  fatura a compra vai cair, aviso antes de regerar parcelas, e exclusão numa caixa desenhada
  em vez do `window.confirm` do navegador
- **Resumo com cartões no topo**, matriz em bandas e o selo de conferência nas quatro situações
- **Tela de Configurações** (`/configuracoes`), nova: criar, editar e arquivar categoria;
  editar conta, inclusive os dias de cartão e o `ativa`; editar nome e cor de pessoa e escolher
  quem absorve a sobra de centavos. **Nada disso precisa mais do `prisma studio`**
- **Fronteira de erro** para as três telas: tela branca virou aviso que não chuta a causa, com
  botão que de fato tenta de novo no servidor
- **Nenhuma cor literal em `src/`.** A varredura da Etapa 07 volta vazia; a única cor escrita à
  mão é `COR_INICIAL` em `lista-categorias.tsx`, que é **dado** (vai para `Categoria.cor`), não
  estilo

## O que ainda não existe

Nenhuma dessas ausências é esquecimento; todas foram decididas ou registradas em revisão.

- **Não há tela de lixeira.** A exclusão marca `deletadoEm` e não apaga, mas para o casal o
  efeito é definitivo até a Fase 3
- **Não há tela de resolução de conflito.** A proteção contra sobrescrita existe e a recusa
  aparece — e desde `35ba027` a recusa não apaga mais o que foi digitado —, mas sem o
  comparativo lado a lado
- **Não há tela para marcar reembolso como recebido.** O cálculo já obedece a regra — o
  reembolso sai do gasto do casal e continua na fatura, na linha *A receber* do Resumo —, mas
  marcar um lançamento como reembolso ainda é trabalho de banco: o painel de lançamento não
  tem o campo, e nem `devedorNome` nem `statusReembolso` são graváveis pela tela. **A
  renderização da linha nova nunca foi vista por ninguém**, pelo mesmo motivo de sempre: está
  atrás do login. É o passo novo do [roteiro](verificacao-visual.md)
- **Não há "A receber" fora do Resumo.** A regra fala de uma visão de pendências; o que existe
  é a linha na matriz do mês
- **Não há histórico de auditoria na tela.** A tabela `Auditoria` passou a receber linhas —
  travar e destravar fatura, com quem e quando —, mas nada as mostra. Hoje só por SQL
- **Não há tema escuro.** Os tokens estão prontos para receber um, o bloco escuro não foi
  escrito, e o `@media (prefers-color-scheme: dark)` do template do Next foi **removido de
  propósito**. Ver [`decisoes.md`](decisoes.md) antes de achar que é regressão
- **Não há gráficos.** O destino existe na barra lateral, desabilitado. Precisa de Recharts,
  consultas que atravessam meses e decisões de regra em aberto
- **Não há criar conta pela tela.** Configurações edita as contas que existem; conta nova
  continua sendo trabalho de banco
- **Não há desativar pessoa.** `editarMembro` grava só `nome` e `cor`; `Membro.ativo` é rótulo
  na lista. **Quando essa tela existir, leia antes a armadilha 12 de
  [`arquitetura.md`](arquitetura.md)** — há três pontos que precisam ser consertados juntos
- **`Categoria.icone` existe no schema e não é usado em lugar nenhum**
- **`Recorrente` e `Preferencia` não existem no banco**, por serem de Fase 2. É a `Preferencia`
  que segura o tema escuro por pessoa e o layout A da grade
- **O layout A da grade — painéis lado a lado — continua adiado.** As seções por pessoa **não**
  são ele: é um renderizador só. Ver [`decisoes.md`](decisoes.md)

A tela de cadastro de categoria, que constava aqui como ausente, **passou a existir** com a
Etapa 06 — junto com a de contas e a de pessoas.

## As duas dívidas que dependem do usuário

**Leia esta seção antes de qualquer outra coisa.** Nenhuma das duas pode ser resolvida por um
agente sozinho, e as duas ficam abertas entre uma sessão e a seguinte.

A dívida 1, *"os 12 testes de banco nunca foram executados"*, **está fechada** — virou a seção
abaixo.

## Os testes de banco rodam, e o que eles acharam na estreia

```bash
npm run test:banco
```

**130 passando, nenhum pulado.** O usuário criou uma branch no Neon só para teste, e a conexão
dela mora em `DATABASE_URL_TESTE` no `.env`. O `npm test` continua sem tocar banco: 118
passando e 12 pulados, em menos de um segundo.

O runner é [`scripts/testar-banco.mjs`](../scripts/testar-banco.mjs) e existe para que apontar
a suíte destrutiva para produção **deixe de ser possível**: ele lê a variável de teste, ignora
a `DATABASE_URL` de verdade, e recusa rodar se as duas apontarem para o mesmo endpoint do
Neon. As três recusas foram testadas com `.env` falso num diretório temporário.

**Branch do Neon nasce como cópia do pai**, então a de teste veio com os 58 lançamentos reais
dentro. Foram apagados dela — categorias, membros e contas ficaram, porque a suíte os lê como
fixture pelo `findFirstOrThrow`. Quem criar outra branch de teste repete isso, ou a guarda da
suíte recusa rodar.

### A estreia achou duas falhas, e nenhuma era bug de produção

Na primeira execução, 2 de 130 falharam: uma leitura dizendo *"No record was found"* logo
depois de uma gravação bem-sucedida, e a sobra de centavos indo para o membro errado. As duas
pareciam bug grave. **As duas eram os arquivos de teste atropelando um ao outro:** o Vitest roda
arquivos em paralelo, o `limpar()` de `lancamento.test.ts` faz `deleteMany()`, e os três
arquivos compartilham um banco só.

Em série, os mesmos 130 passam. O `--no-file-parallelism` está assado no runner por isso — ver
[`decisoes.md`](decisoes.md) antes de tirar em nome de velocidade.

### 1. A conferência visual da camada nova não foi feita por ninguém

Tudo da Etapa 02 em diante — casco, grade, painel, resumo, configurações — está atrás do login
com Google, e **nenhum agente conseguiu entrar**. Nada da camada visual foi visto numa tela de
verdade. Não há teste automatizado dela: o projeto não tem teste de componente, e o único
Playwright está pulado por exigir login.

O roteiro operacional, escrito para não depender de memória, está em
[`verificacao-visual.md`](verificacao-visual.md) — sete passos, incluindo a prova de paridade,
que é conferida contra a planilha do casal e não contra número escrito aqui.

Para ver as telas com conteúdo sem tocar em dado real:

```bash
npx tsx scripts/dados-ficticios.ts criar
npm run dev
# ao terminar
npx tsx scripts/dados-ficticios.ts limpar
```

### 2. As cores dos membros colidem com as de categoria

`prisma/seed.ts` dá aos dois membros exatamente as cores de duas categorias:

| Quem | Cor | Colide com |
|---|---|---|
| Nardy | `#A8710F` | categoria **Compra Online** |
| Nick | `#9C4275` | categoria **Beleza** |

Na grade, a faixa do cabeçalho de uma pessoa pode ficar idêntica à bolinha de categoria de um
lançamento dela. Ficou decidido trocar a cor dos **membros**, e não a das categorias — são dois
registros contra oito, e a cor de membro aparece em menos lugares.

**A proposta em aberto é `#6D3551` para Nardy e `#2E4A63` para Nick.** São dois `UPDATE` na
tabela `Membro`, contra o banco de produção do casal, e **ninguém deve rodá-los sem a palavra
do usuário**. Até lá o código lê `Membro.cor` normalmente e nada precisa mudar.

## O centavo em que a planilha e o sistema discordam

**O sistema está certo e a planilha erra**, e vale saber disso antes da conferência.

Num conjunto de valor ímpar a metade não existe em centavos. A planilha arredonda as duas para
cima: em R$ 101,01 ela dá R$ 50,50 a cada um, e os dois totais gerais passam a somar um
centavo **mais** do que a fatura que se paga de fato. O sistema dá a sobra a quem tem
`absorveSobra` — Nick — e fecha exato.

Na importação de setembro isso aparece assim, com nove lançamentos conjuntos:

| | planilha | sistema |
|---|---|---|
| Total geral Nardy | R$ 474,25 | R$ 474,25 |
| Total geral Nick | R$ 551,26 | R$ 551,26 |
| Soma | R$ 1.025,52 | **R$ 1.025,51**, igual à fatura |

A diferença **não é de um centavo no total**: é de um centavo por lançamento conjunto ímpar, e
toda ela recai sobre a mesma pessoa. Com nove lançamentos deu dois centavos. Está registrado
como armadilha 15 em [`arquitetura.md`](arquitetura.md).

A seção 4 de [`regras-de-negocio.md`](regras-de-negocio.md) mostra as duas metades em linhas
separadas justamente por isso — a linha única "Metade cada" da planilha não tem como ser
verdadeira quando o conjunto é ímpar.

## Serviços externos

| Serviço | Situação |
|---|---|
| Neon (Postgres) | Criado, migration aplicada, seed rodado, **planilha reimportada como `2026-09`** (58 lançamentos, fatura conferida contra a linha `FATURA:`). É o banco de produção do casal, com dado financeiro real |
| Neon — banco de teste | **Criado**, como branch do projeto. Conexão em `DATABASE_URL_TESTE`; os 130 testes rodam com `npm run test:banco` |
| Google OAuth | Credenciais criadas; os dois e-mails constam como *test users* em Público-alvo |
| Vercel | **Publicado** em https://lancardespesas.vercel.app, mas o **login está quebrado**: falta `AUTH_SECRET` no ambiente. Nada de `/api/auth/*` responde |
| GitHub | Repositório privado `marcoshocampos/lancardespesas`. `main` enviada e única; branches de trabalho apagadas |

Os segredos moram em `.env`, na raiz, a partir do `.env.example`. **`.env`, e não
`.env.local`** — o CLI do Prisma lê o primeiro nativamente e não lê o segundo, então
migrations não achariam a conexão. O arquivo está no `.gitignore` e nunca apareceu em nenhum
commit, o que foi verificado na árvore inteira.

## Como retomar

```bash
git switch navegacao
npm install
npm test          # esperado: 109 passando, 12 pulados
```

O `DATABASE_URL` aponta para o **banco de produção do casal**, com a planilha já importada.
Nada de `TESTE_DESTRUTIVO=1` aqui, e nenhum `UPDATE` sem a palavra do usuário.

Para ver as telas com conteúdo, `npx tsx scripts/dados-ficticios.ts criar` insere dez
lançamentos inventados e `... limpar` os remove — ele só apaga o que ele mesmo criou.

Leia [`docs/decisoes.md`](decisoes.md) antes de mudar qualquer escolha estrutural, e as
armadilhas de [`docs/arquitetura.md`](arquitetura.md) antes de mexer no casco, no painel de
lançamento ou em qualquer consulta que filtre por `ativa`/`arquivada`/`ativo`.

## Antes de usar de verdade

1. **Fazer a conferência visual da Tarefa 2** (dívida 1 acima). É o que separa "está bonito"
   de afirmação verificável
2. **Testar o login no navegador**, com um e-mail da allowlist e um de fora. Continua sendo o
   teste que nenhum agente conseguiu fazer
3. **Decidir as cores dos membros** (dívida 2 acima)
4. **Publicar na Vercel**, se quiserem acessar de fora de casa

A importação da planilha, que constava aqui como pendente, **já foi feita**.

## Pendências menores para triar

Sobraram **cinco**, todas triadas na revisão final da Fase 1 como não bloqueantes. As duas que
bloqueavam — o parser de dinheiro aceitando entrada ambígua e a suíte destrutiva deixando
lançamento no banco — já foram corrigidas. Estas são de baixo nível e nenhuma ficou pior com o
redesenho visual; as pendências que importam agora são as duas dívidas lá em cima.

1. **`avancarCompetencia` quebra antes do ano `0000`**, porque o `%` do JavaScript preserva o
   sinal do dividendo. Só alcançável com um delta na casa de -24000 meses
2. **O ramo `TOTAL` de `gerarParcelas` nunca é exercitado com valor negativo.** Não é bug: com
   uma parcela a expressão colapsa e a soma fecha por álgebra
3. **`ratear` produz `-0`** quando uma cota trunca para zero num valor negativo
4. **O middleware não exclui `public/`**, então asset estático também redireciona. Proteção a
   mais, nunca a menos; vai incomodar quando entrar `robots.txt` ou manifest
5. **`docs/regras-de-negocio.md` descreve "editar uma parcela" sem redistribuir as demais**,
   enquanto `editarLancamento` sempre regera todas. Divergência entre documento e código

O item que era o 5 — *"a mensagem de recusa em `linha-nova.tsx` ignora o `motivo`"* — saiu de
pauta com o arquivo: `linha-nova.tsx` e `linha-edicao.tsx` não existem mais, e o painel que os
substituiu trata os motivos um a um.

Também sem transação: `gravarFilhos` faz `deleteMany` e `createMany` separados, então uma
falha entre os dois deixaria lançamento sem parcela.

## Histórico de commits da Fase 1

Já em `main`, mais oito commits que vieram depois dela — o importador colunar e a sobra de
centavos explícita. Os 52 commits do redesenho visual estão em `navegacao` e saem de
`git log --oneline main..HEAD`.

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
