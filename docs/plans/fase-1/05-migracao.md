# Etapa 05 — Migração da planilha

Tarefa 14, **pendente**, com o código completo.

Script de uso único: lê o CSV exportado da aba do mês e cria os lançamentos com as parcelas
restantes já posicionadas nas competências corretas. Não vira tela nem funcionalidade — roda
uma vez e morre.

Restrições globais em [README.md](README.md#restrições-globais).

Duas coisas que definem o sucesso desta etapa:

- **A interpretação da linha é testada sozinha**, sem banco. É ali que a importação erra:
  linha de total confundida com lançamento, parcela mal formada, valor com separador de
  milhar.
- **A conferência é o total.** Se a soma importada não bater com o `FATURA` da planilha, a
  importação falhou e deve ser refeita, não corrigida na mão.

O CSV com dados reais vai em `/dados-privados/`, que está no `.gitignore`. **Nunca versione
o arquivo.**

---

## Tarefa 14 — Importação da planilha

**Arquivos:**
- Criar: `scripts/importar-planilha.ts`, `scripts/importar-planilha.test.ts`

**Interfaces:**
- Consome: `reaisParaCentavos` de `@/domain/money`; `criarLancamento` do repositório
- Produz: `interpretarLinha(colunas: string[]): LinhaPlanilha | null`;
  `type LinhaPlanilha = { descricao: string; valorCentavos: number; parcelaAtual: number; totalParcelas: number; categoria: string }`

- [ ] **Passo 1: Escrever o teste da interpretação**

O parsing é puro e é onde a importação erra. Testado sozinho, sem banco.

`scripts/importar-planilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interpretarLinha } from './importar-planilha';

describe('interpretarLinha', () => {
  it('interpreta uma linha parcelada', () => {
    expect(interpretarLinha(['aparelho', 'R$100,00', '6/12', 'Terceiros'])).toEqual({
      descricao: 'aparelho',
      valorCentavos: 10000,
      parcelaAtual: 6,
      totalParcelas: 12,
      categoria: 'Terceiros',
    });
  });

  it('interpreta uma linha a vista, sem parcela', () => {
    expect(interpretarLinha(['google', 'R$88,00', '', 'Assinatura'])).toEqual({
      descricao: 'google',
      valorCentavos: 8800,
      parcelaAtual: 1,
      totalParcelas: 1,
      categoria: 'Assinatura',
    });
  });

  it('interpreta valor com separador de milhar', () => {
    const linha = interpretarLinha(['moto', 'R$432,10', '2/12', 'Veículo']);
    expect(linha?.valorCentavos).toBe(43210);
    expect(linha?.totalParcelas).toBe(12);
  });

  it('ignora linha vazia da planilha', () => {
    expect(interpretarLinha(['', '', '', ''])).toBeNull();
    expect(interpretarLinha([])).toBeNull();
  });

  it('ignora as linhas de total', () => {
    expect(interpretarLinha(['TOTAL:', 'R$423,75', '', ''])).toBeNull();
    expect(interpretarLinha(['TOTAL GERAL:', 'R$474,25', '', ''])).toBeNull();
    expect(interpretarLinha(['FATURA:', 'R$1.025,51', '', ''])).toBeNull();
  });

  it('recusa parcela mal formada em vez de adivinhar', () => {
    expect(() => interpretarLinha(['x', 'R$10,00', '6-12', 'Jogo'])).toThrow('Parcela invalida');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run scripts/importar-planilha.test.ts
```

Esperado: FAIL, `Failed to resolve import "./importar-planilha"`.

- [ ] **Passo 3: Implementar a interpretação**

`scripts/importar-planilha.ts`:

```ts
import { reaisParaCentavos } from '@/domain/money';

export type LinhaPlanilha = {
  descricao: string;
  valorCentavos: number;
  parcelaAtual: number;
  totalParcelas: number;
  categoria: string;
};

const ROTULOS_DE_TOTAL = ['total:', 'total geral:', 'fatura:', 'metade:'];
const PARCELA = /^(\d+)\/(\d+)$/;

/** Interpreta uma linha do CSV da aba do mes. Devolve null para linha que nao e lancamento. */
export function interpretarLinha(colunas: string[]): LinhaPlanilha | null {
  const [descricaoBruta = '', valorBruto = '', parcelaBruta = '', categoria = ''] = colunas;
  const descricao = descricaoBruta.trim();

  if (descricao === '' || valorBruto.trim() === '') return null;
  if (ROTULOS_DE_TOTAL.includes(descricao.toLowerCase())) return null;

  const parcela = parcelaBruta.trim();
  let parcelaAtual = 1;
  let totalParcelas = 1;

  if (parcela !== '') {
    const casou = PARCELA.exec(parcela);
    if (!casou) throw new Error(`Parcela invalida: ${parcela}`);
    parcelaAtual = Number(casou[1]);
    totalParcelas = Number(casou[2]);
  }

  return {
    descricao,
    valorCentavos: reaisParaCentavos(valorBruto),
    parcelaAtual,
    totalParcelas,
    categoria: categoria.trim(),
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run scripts/importar-planilha.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Passo 5: Escrever a rotina de importação**

Acrescente ao mesmo arquivo uma função `importar(caminhoCsv, competencia, contaId)` que:

1. lê o CSV com `node:fs`, separando por bloco de pessoa (Nardy, Nick, Conjunto);
2. chama `interpretarLinha` em cada linha, pulando os `null`;
3. converte `parcelaAtual`/`totalParcelas` na competência base — a competência da parcela 1 é
   `avancarCompetencia(competencia, -(parcelaAtual - 1))`;
4. chama `criarLancamento` com `origemValor: 'POR_PARCELA'`;
5. ao final, imprime a soma importada por bloco.

A conferência é o total: se a soma não bater com o `FATURA` da planilha, **apague tudo e
refaça**, não corrija na mão.

- [ ] **Passo 6: Rodar contra a aba real**

```bash
npx tsx scripts/importar-planilha.ts ./dados-privados/agosto.csv 2026-08 conta-c6
```

Esperado: soma impressa igual a `R$ 1.025,51`, e `/resumo?competencia=2026-08` reproduzindo
os sete números da planilha.

O arquivo fica em `/dados-privados/`, que está no `.gitignore`. **Não versione o CSV.**

- [ ] **Passo 7: Commit (pedir autorização antes)**

```
Importa o mes corrente e as parcelas em aberto da planilha

Script de uso unico. A interpretacao da linha e testada sozinha, porque e
onde a importacao erra; a conferencia final e o total bater com a fatura.
```

---

