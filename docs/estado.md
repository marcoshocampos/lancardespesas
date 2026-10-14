# Estado do projeto

Atualizado em 2026-10-04. Este arquivo responde "onde paramos" para quem chega agora —
inclusive uma sessão nova de agente, que não tem memória da conversa anterior.

## Onde estamos

**Fase 1 e o redesenho visual estão os dois em `main`, enviados ao GitHub, e o sistema está
publicado em https://lancardespesas.vercel.app.** O merge do redesenho é o `39bb8e4`, com 61
commits. As branches de trabalho foram apagadas; só existe `main`.

**O login em produção funciona, e a autenticação está verificada pelo par completo:** os dois
e-mails da allowlist entraram, e um e-mail de fora foi bloqueado. É a primeira vez que alguém
passou da tela de login em produção, e com isso a proteção de rota deixa de ser suposição.

**Por que o par importa, e não só a metade que barra:** este arquivo chegou a dizer que *"o
middleware funciona em produção"* com base em ver `/despesas` redirecionar para `/entrar`. O
log mostrou que aquele 307 vinha junto de `MissingSecret` — o redirecionamento acontecia
apesar da configuração quebrada. Sistema quebrado barra todo mundo igual. Ver armadilha 17 em
[`arquitetura.md`](arquitetura.md).

A publicação atravessou dois erros até aqui, os dois registrados porque voltam:

- **`AUTH_SECRET` ausente** no ambiente da Vercel. Toda rota de `/api/auth/*` em 500 com
  `MissingSecret`. Resolvido importando o `.env` para lá — e **variável nova exige deploy
  novo**, não alcança o que já existe
- **`redirect_uri_mismatch` do Google**, resolvido cadastrando
  `https://lancardespesas.vercel.app/api/auth/callback/google`. O URI que o Auth.js realmente
  usa não se adivinha: `GET /api/auth/providers` devolve o `callbackUrl` dele em JSON, sem
  autenticação. **E só dá para entrar pelo domínio estável** — a URL própria de cada deploy
  muda sempre e não há como cadastrá-la (armadilha 18)

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

**A Tarefa 2 da Etapa 07 — a conferência visual tela a tela — continua sem ser feita**, mas
não há mais impedimento: o login em produção funciona. Até agora a razão era que tudo da Etapa
02 em diante está atrás do Google e nenhum agente entra. É a dívida 1 mais abaixo, e é ela que
segura a Tarefa 4, o fechamento.

Três consertos nasceram fora do plano, de revisão, e entraram junto: conta inativa com
histórico derrubando o mês (`9232252`), categoria arquivada sendo trocada em silêncio ao editar
(`29d7538`), e o reset de formulário do React 19 apagando o que foi digitado (`35ba027`). Os
três viraram armadilha registrada em [`arquitetura.md`](arquitetura.md).

## O que já funciona

**`npm test` hoje: 118 passando e 26 pulados.** Com banco, `npm run test:banco`, são **144
passando e nenhum pulado**. Saída literal dos dois:

```
 Test Files  10 passed | 3 skipped (13)        Test Files  13 passed (13)
      Tests  118 passed | 26 skipped (144)          Tests  144 passed (144)
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
  filtro de conta. Só Gráficos aparece desabilitado, porque a página não existe
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

- **Não há apagar definitivo.** A lixeira só restaura; nada sai do banco. Escolha explícita,
  fiel ao invariante 6 — ver [`decisoes.md`](decisoes.md)
- **Não há tela de resolução de conflito.** A proteção contra sobrescrita existe e a recusa
  aparece — e desde `35ba027` a recusa não apaga mais o que foi digitado —, mas sem o
  comparativo lado a lado
- **Não há visão de pendências que atravesse meses.** A seção *A receber* é por competência, e
  uma dívida de agosto não reaparece em outubro — foi decisão explícita, não lacuna. Ver
  [`decisoes.md`](decisoes.md)
- **Não há busca.** Achar um lançamento antigo exige lembrar o mês dele
- **Não há histórico de auditoria na tela.** A tabela `Auditoria` passou a receber linhas —
  travar e destravar fatura, com quem e quando —, mas nada as mostra. Hoje só por SQL
- **Não há tema por pessoa.** O escuro existe e segue o sistema operacional, com um botão que
  força claro ou escuro — mas a escolha forçada é por aparelho, num cookie. Preferência que
  segue a pessoa depende da tabela `Preferencia`, de Fase 2
- **Não há gráficos.** O destino existe na barra lateral, desabilitado. Precisa de Recharts,
  consultas que atravessam meses e decisões de regra em aberto
- **Desativar pessoa não existe e NÃO SERÁ construído** — decisão do usuário em 2026-10-14.
  `editarMembro` grava só `nome` e `cor`, e `Membro.ativo` segue como rótulo na lista. A
  armadilha 12 de [`arquitetura.md`](arquitetura.md) continua valendo, mas como *não construa*:
  são três pontos do código que se comportam mal com membro desconhecido, e nenhum deles é
  alcançável enquanto a tela não existir
- **`Categoria.icone` existe no schema e não é usado em lugar nenhum**
- **`Recorrente` e `Preferencia` não existem no banco**, por serem de Fase 2. É a `Preferencia`
  que segura o tema escuro por pessoa e o layout A da grade
- **O layout A da grade — painéis lado a lado — continua adiado.** As seções por pessoa **não**
  são ele: é um renderizador só. Ver [`decisoes.md`](decisoes.md)

A tela de cadastro de categoria, que constava aqui como ausente, **passou a existir** com a
Etapa 06 — junto com a de contas e a de pessoas.

## A dívida que ainda depende do usuário

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

### 1. ~~A conferência visual~~ — **feita**

Os quatorze passos de [`verificacao-visual.md`](verificacao-visual.md) foram conferidos pelo
usuário em 2026-10-12, incluindo a prova de paridade contra a planilha. **Era a dívida mais
antiga do projeto**, aberta desde setembro, e o que a destravou foi o login em produção passar
a funcionar — nenhum agente consegue entrar, então ela nunca dependeu de trabalho, só de
acesso.

Saíram dela dois pedidos, os dois já implementados: o botão flutuante de novo lançamento e a
marca de reembolso no painel. **Nada mais foi apontado como errado** — nem a paridade, nem os
totais, nem o fechamento do mês.

Os passos **8 (lixeira)** e **9 (tema)**, acrescentados depois, também foram conferidos pelo
usuário em 2026-10-14, e os dois passaram. Isso cobre tudo que foi entregue até aqui: **nenhuma
tela do sistema está sem ter sido vista funcionando.**

A camada visual continua sem teste automatizado: o projeto não tem teste de componente, e o
único Playwright está pulado por exigir login. Mudança nessas telas continua precisando de
olho humano, e o roteiro continua valendo como lista.

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

**Resolvido assim: o casal escolhe na tela, e nenhum agente mexe no banco.** A lista de
Pessoas em `/configuracoes` já tem o seletor de cor por membro (`CampoCor`, ligado a
`acaoEditarMembro`) — a capacidade existe desde a Etapa 06 e ninguém sabia, porque a tela
nunca foi vista. É o Passo 5 do [roteiro](verificacao-visual.md).

Se faltar ponto de partida, `#6D3551` para Nardy e `#2E4A63` para Nick não colidem com
nenhuma das treze categorias. Mas a cor de cada um é escolha deles, não proposta de agente.

## O centavo em que a planilha e o sistema discordam

**O sistema está certo e a planilha erra**, e vale saber disso antes da conferência.

Num conjunto de valor ímpar a metade não existe em centavos. A planilha arredonda as duas para
cima; o sistema dá a sobra a quem tem `absorveSobra` e fecha exato.

Com os números da fixture — pessoal de R$ 423,75 e R$ 500,75, conjunto de R$ 101,01, que não
divide ao meio:

| | planilha | sistema |
|---|---|---|
| Metade de cada um | R$ 50,51 e R$ 50,51 | R$ 50,50 e R$ 50,51 |
| Total geral Nardy | R$ 474,26 | **R$ 474,25** |
| Total geral Nick | R$ 551,26 | R$ 551,26 |
| Soma | R$ 1.025,52 | **R$ 1.025,51**, igual à fatura |

A planilha cria um centavo que ninguém paga. E a diferença **não é de um centavo no total**: é
de um centavo por lançamento conjunto ímpar, e toda ela recai sobre a mesma pessoa — num mês
com nove lançamentos conjuntos, deu dois centavos. Está registrado como armadilha 15 em
[`arquitetura.md`](arquitetura.md).

A seção 4 de [`regras-de-negocio.md`](regras-de-negocio.md) mostra as duas metades em linhas
separadas justamente por isso — a linha única "Metade cada" da planilha não tem como ser
verdadeira quando o conjunto é ímpar.

## Serviços externos

| Serviço | Situação |
|---|---|
| Neon (Postgres) | Criado, migration aplicada, seed rodado, **planilha reimportada como `2026-09`** (58 lançamentos, fatura conferida contra a linha `FATURA:`). É o banco de produção do casal, com dado financeiro real |
| Neon — banco de teste | **Criado**, como branch do projeto. Conexão em `DATABASE_URL_TESTE`; os 130 testes rodam com `npm run test:banco` |
| Google OAuth | Credenciais criadas; os dois e-mails constam como *test users* em Público-alvo. URIs de redirecionamento de `localhost` e de produção cadastrados. **Login verificado nos dois sentidos** |
| Vercel | **Publicado e funcionando** em https://lancardespesas.vercel.app. Variáveis importadas do `.env` local. O `DATABASE_URL_TESTE`, que veio junto na importação do `.env`, já foi removido de lá |
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

1. **Fazer a conferência visual** pelo [roteiro](verificacao-visual.md), quatorze passos. É o
   que separa "está bonito" de afirmação verificável, e **agora é possível** — até o login
   funcionar, ninguém conseguia passar da primeira tela
2. **Escolher as cores dos membros** em `/configuracoes` → Pessoas (Passo 5 do roteiro)

Já feitos, e que constavam aqui como pendentes: a importação da planilha, a publicação na
Vercel, e o **teste de login** — os dois e-mails da allowlist entraram e um de fora foi
bloqueado, que é o par completo.

## Pendências menores para triar

Sobraram **cinco**, todas triadas na revisão final da Fase 1 como não bloqueantes. As duas que
bloqueavam — o parser de dinheiro aceitando entrada ambígua e a suíte destrutiva deixando
lançamento no banco — já foram corrigidas. Estas são de baixo nível e nenhuma ficou pior com o
redesenho visual; as pendências que importam agora são as duas dívidas lá em cima.

Sobraram **três, e as três foram triadas como não-trabalho** — ficam escritas para que ninguém
as redescubra achando que são tarefa:

1. **`avancarCompetencia` quebra antes do ano `0000`**, porque o `%` do JavaScript preserva o
   sinal do dividendo. Só alcançável com um delta na casa de -24000 meses
2. **O ramo `TOTAL` de `gerarParcelas` nunca é exercitado com valor negativo.** Não é bug: com
   uma parcela a expressão colapsa e a soma fecha por álgebra
3. **`ratear` produz `-0`** quando uma cota trunca para zero num valor negativo. **Nunca
   chega na tela:** `formatarBRL(-0)` imprime `R$ 0,00`, sem sinal — conferido

As que saíram desta lista por terem sido resolvidas:

- *O middleware não excluía `public/`* — asset estático era interceptado e `/robots.txt`
  devolvia **307 para o login** em produção. O `matcher` passou a excluir caminho terminado em
  `.extensão`, e o par foi verificado: arquivo estático serve com 200, rota privada continua
  redirecionando
- *`regras-de-negocio.md` divergia do código sobre editar uma parcela* — resolvido a favor do
  código. A operação **não existe**, e o documento passou a dizer isso em vez de descrever
  comportamento que ninguém construiu
- *`gravarFilhos` sem transação* — as três gravações de lançamento rodam em
  `prisma.$transaction` desde `28f83e7`
- *A mensagem de recusa em `linha-nova.tsx` ignorava o `motivo`* — saiu de pauta com o
  arquivo: `linha-nova.tsx` e `linha-edicao.tsx` não existem mais

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
