import { describe, expect, it } from 'vitest';
import {
  competenciaDeDestino,
  correspondeABusca,
  interpretarBusca,
  normalizarTexto,
  type CandidatoDaBusca,
} from './busca';

const candidato = (extras: Partial<CandidatoDaBusca> = {}): CandidatoDaBusca => ({
  descricao: 'Farmácia São João',
  devedorNome: null,
  parcelas: [{ valorCentavos: 4590, cancelada: false }],
  ...extras,
});

const parcelas = (...valores: number[]) =>
  valores.map((valorCentavos) => ({ valorCentavos, cancelada: false }));

function acha(termo: string, c: CandidatoDaBusca): boolean {
  const busca = interpretarBusca(termo);
  if (!busca) throw new Error(`termo que nao busca: "${termo}"`);
  return correspondeABusca(busca, c);
}

describe('normalizarTexto', () => {
  it('tira acento e caixa', () => {
    expect(normalizarTexto('Farmácia São João AÇÚCAR')).toBe('farmacia sao joao acucar');
  });
});

describe('interpretarBusca', () => {
  it('termo vazio ou so de espacos nao busca', () => {
    expect(interpretarBusca('')).toBeNull();
    expect(interpretarBusca('   ')).toBeNull();
  });

  it('separa as palavras, normalizadas', () => {
    expect(interpretarBusca('  Uber   VIAGEM ')?.palavras).toEqual(['uber', 'viagem']);
  });

  it('le valor quando o termo inteiro tem forma de valor', () => {
    expect(interpretarBusca('89,90')?.centavos).toBe(8990);
    expect(interpretarBusca('R$ 89,90')?.centavos).toBe(8990);
    expect(interpretarBusca('r$89,90')?.centavos).toBe(8990);
    expect(interpretarBusca('89')?.centavos).toBe(8900);
    expect(interpretarBusca('1.025,51')?.centavos).toBe(102551);
    expect(interpretarBusca('-50,00')?.centavos).toBe(-5000);
  });

  it('nao le valor de texto com numero no meio', () => {
    // reaisParaCentavos descarta letras antes de ler: sem a guarda de forma,
    // "uber 89" viraria R$ 89,00 e "12x" viraria R$ 12,00.
    expect(interpretarBusca('uber 89')?.centavos).toBeNull();
    expect(interpretarBusca('12x')?.centavos).toBeNull();
  });

  it('ponto sem virgula e ambiguo, e vale so como texto', () => {
    expect(interpretarBusca('89.90')).toEqual({ palavras: ['89.90'], centavos: null });
  });
});

describe('correspondeABusca — por texto', () => {
  it('ignora acento e caixa', () => {
    expect(acha('farmacia', candidato())).toBe(true);
    expect(acha('SÃO JOÃO', candidato())).toBe(true);
  });

  it('acha pedaco de palavra', () => {
    expect(acha('farm', candidato())).toBe(true);
  });

  it('exige todas as palavras, em qualquer ordem', () => {
    const c = candidato({ descricao: 'Viagem Uber' });
    expect(acha('uber viagem', c)).toBe(true);
    expect(acha('uber taxi', c)).toBe(false);
  });

  it('procura tambem no nome do terceiro', () => {
    const c = candidato({ descricao: 'Ingresso show', devedorNome: 'Joana' });
    expect(acha('joana', c)).toBe(true);
    expect(acha('ingresso joana', c)).toBe(true);
  });
});

describe('correspondeABusca — por valor', () => {
  const geladeira = candidato({ descricao: 'Geladeira', parcelas: parcelas(8990, 8990, 8990) });

  it('acha pelo valor da parcela', () => {
    expect(acha('89,90', geladeira)).toBe(true);
  });

  it('acha pelo total, que e a soma das parcelas', () => {
    expect(acha('269,70', geladeira)).toBe(true);
  });

  it('nao acha valor so parecido', () => {
    expect(acha('89,91', geladeira)).toBe(false);
  });

  it('compara sem sinal: estorno acha pelo valor positivo, e vice-versa', () => {
    const estorno = candidato({ descricao: 'Estorno', parcelas: parcelas(-5000) });
    expect(acha('50,00', estorno)).toBe(true);
    expect(acha('-50,00', candidato({ descricao: 'Mercado', parcelas: parcelas(5000) }))).toBe(true);
  });

  it('parcela cancelada nao casa pelo proprio valor, mas entra no total', () => {
    const quitado = candidato({
      descricao: 'Sofa',
      parcelas: [
        { valorCentavos: 10000, cancelada: false },
        { valorCentavos: 12345, cancelada: true },
      ],
    });
    expect(acha('123,45', quitado)).toBe(false);
    expect(acha('223,45', quitado)).toBe(true);
  });

  it('texto e valor se somam: "89" acha pela descricao e pelo valor', () => {
    expect(acha('89', candidato({ descricao: 'Uber 89', parcelas: parcelas(1500) }))).toBe(true);
    expect(acha('89', candidato({ descricao: 'Mercado', parcelas: parcelas(8900) }))).toBe(true);
    expect(acha('89', candidato({ descricao: 'Mercado', parcelas: parcelas(8990) }))).toBe(false);
  });

  it('"89.90" nao casa por valor', () => {
    expect(acha('89.90', candidato({ descricao: 'Mercado', parcelas: parcelas(8990) }))).toBe(false);
  });
});

describe('competenciaDeDestino', () => {
  it('prefere a competencia de onde a pessoa veio, se o lancamento estiver nela', () => {
    expect(competenciaDeDestino(['2026-10', '2026-11', '2026-12'], '2026-11')).toBe('2026-11');
  });

  it('senao, a primeira competencia do lancamento', () => {
    expect(competenciaDeDestino(['2026-12', '2026-10', '2026-11'], '2027-05')).toBe('2026-10');
  });

  it('sem parcela ativa, nao ha destino', () => {
    expect(competenciaDeDestino([], '2026-11')).toBeNull();
  });
});
