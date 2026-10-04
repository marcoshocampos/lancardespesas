# Roteiro de verificação visual

A camada visual não tem teste automatizado: nenhum agente consegue passar do login com Google,
então tudo daqui pra frente depende de olho humano. Este é o roteiro — escrito para ser seguido
sem memória da conversa que construiu as telas.

É a Tarefa 2 da [Etapa 07](plans/redesenho-visual/07-acabamento.md), a única que continua aberta.

## Antes de começar

```bash
npm run dev
```

**Não rode `scripts/dados-ficticios.ts criar`.** O plano original mandava, porque foi escrito
quando o banco estava vazio. Hoje o banco tem a importação real de agosto, e os lançamentos
fictícios caem nas mesmas competências — julho, agosto e setembro. Você olharia para uma tela
misturando invenção com finança de verdade e não saberia qual número cobrar. O script só detecta
a própria bagunça anterior, não a presença de dado real, então ele não vai te impedir.

Se em algum momento precisar dos fictícios, aponte o `DATABASE_URL` para um banco vazio primeiro.

## Passo 1 — Casco

Abra `http://localhost:3000`. Deve cair em `/despesas` sozinho.

- [ ] A barra lateral mostra **Despesas**, **Resumo** e **Configurações** clicáveis, e
      **Gráficos** e **Lixeira** apagados. Tente alcançar os dois apagados com `Tab`: eles têm
      que ser pulados, não focados.
- [ ] Troque de tela pela barra. **O mês tem que ir junto** — se você estava em julho no
      Despesas, cai em julho no Resumo.
- [ ] Filtre por uma conta no Despesas e troque de mês pelas setas. **O filtro tem que
      sobreviver** à troca.
- [ ] **Sair** encerra a sessão e leva para `/entrar`. Depois disso, digitar `/despesas` na
      barra do navegador não pode abrir a tela.
- [ ] Estreite a janela para ~1100px: a barra vira só ícones e a página **não** ganha rolagem
      horizontal.

## Passo 2 — Despesas

- [ ] Os totais da faixa do topo batem com os do Resumo do mesmo mês. Abra as duas telas lado a
      lado se ajudar.
- [ ] Com um filtro de conta ligado, a faixa continua somando **o mês inteiro** e diz isso em
      algum lugar — ela não passa a somar só o filtrado sem avisar.
- [ ] Some os subtotais de cada seção de pessoa: tem que dar o total do rodapé.
- [ ] Um lançamento à vista **não** mostra `—` na coluna de parcela.
- [ ] Data repetida na linha seguinte aparece esmaecida, não repetida em cheio.
- [ ] `Tab` alcança os botões de editar e excluir de cada linha.
- [ ] Filtre por uma conta que não teve movimento no mês: o estado vazio tem que falar **do
      filtro**, não dizer que o mês está vazio.

## Passo 3 — Painel de lançamento

- [ ] Lance uma compra com data **depois do dia de fechamento** do cartão. A dica tem que
      anunciar o mês seguinte, e a linha **não** pode aparecer no mês atual.
- [ ] Abra um lançamento parcelado, salve **sem mudar nada**, e confira o valor. Ele não pode
      encolher. (Já quebrou assim uma vez: o valor da parcela era gravado como se fosse o total,
      e cada salvamento dividia de novo.)
- [ ] Editar um parcelado avisa antes de enviar.
- [ ] Abra a mesma tela em duas abas, edite o mesmo lançamento nas duas e salve nas duas. A
      segunda tem que **recusar**, mostrar o que ficou gravado, e **não apagar o que você
      digitou**.
- [ ] `Esc` fecha o painel.

## Passo 4 — Resumo

- [ ] Os cartões do topo e a matriz nunca divergem entre si.
- [ ] As duas linhas de metade continuam separadas, uma por pessoa.
- [ ] Zero aparece como `—`, não como `R$ 0,00`.
- [ ] Digite no campo de extrato um valor diferente do somado: o selo da conferência tem que
      mudar de forma, não só de cor.
- [ ] **Sem reembolso no mês, não existe linha "A receber"** — e o `Somado` fecha com a soma
      dos dois `Cabe a`.
- [ ] Marque um lançamento como reembolso de terceiro e volte ao Resumo. Agora: duas linhas
      **A receber** aparecem entre os `Cabe a` e o `Somado`; o `Somado` **não muda** (continua
      sendo a fatura); o `Cabe a` da pessoa cai exatamente o valor do reembolso; e
      `Cabe a` + `A receber` dos dois volta a dar o `Somado`. Desmarque depois.

      Este é o único passo que verifica a linha nova. O cálculo está testado, a renderização
      **não** — nenhum agente consegue passar do login para olhar.

## Passo 5 — Configurações

- [ ] Tente criar uma categoria com nome que já existe: a mensagem aparece **no campo**, não
      numa faixa genérica.
- [ ] Arquive uma categoria: ela some do painel de lançamento e **continua** nos lançamentos
      antigos que já a usavam.
- [ ] Troque duas vezes quem absorve a sobra de centavos. Depois, exatamente **um** membro pode
      estar marcado.

## Passo 6 — Paridade

Esta é a que decide se o cálculo está certo.

Abra `/resumo` na competência da planilha que você importou e compare com a planilha original:

- [ ] O **Somado da coluna do cartão** é igual à linha `FATURA:` da planilha.
- [ ] O total geral de cada pessoa bate com a linha dela na planilha.
- [ ] O que era conta externa na planilha aparece fora da coluna do cartão.

**Se divergir, pare.** Não é ajuste de tela — é o cálculo, e mexer na aparência em cima de um
número errado só esconde o problema.

> Os valores esperados não estão escritos aqui de propósito: são a finança real do casal e o
> repositório não recebe dado financeiro. A planilha é a referência.

## Passo 7 — Quando terminar

Marque a Tarefa 2 na [Etapa 07](plans/redesenho-visual/07-acabamento.md) e atualize o
[`estado.md`](estado.md), que hoje registra esta conferência como a dívida que segura o
fechamento da fase.
