'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { agrupar } from '@/domain/agrupamento';
import { formatarCompetencia } from '@/domain/competencia';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import { ChipsConta } from './chips-conta';
import { ID_BOTAO_NOVO_LANCAMENTO, PainelLancamento, type ModoPainel } from './painel-lancamento';
import { SecaoPessoa } from './secao-pessoa';

type Membro = { id: string; nome: string; cor: string };
type Categoria = { id: string; nome: string; cor: string };
type Conta = {
  id: string;
  nome: string;
  tipo: 'CARTAO' | 'EXTERNA';
  diaFechamento: number | null;
  cor: string;
};

type Props = {
  linhas: LinhaGrade[];
  competencia: string;
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
  /** Id da conta filtrada na URL, se houver — decide qual estado vazio mostrar. */
  contaSelecionada?: string | undefined;
};

const CABECALHOS = ['Data', 'Descrição', 'Categoria', 'Parc.', 'Valor', 'Ações'];

// Constante literal: nao ha colisao possivel com um membroId de verdade, que e
// sempre cuid(). E a chave de agrupamento para todo lancamento de escopo
// CONJUNTO, e o fallback (que nao deveria acontecer) para PESSOAL sem membro.
const CHAVE_CONJUNTO = 'CONJUNTO';

function chaveDe(linha: LinhaGrade): string {
  return linha.escopo === 'CONJUNTO' ? CHAVE_CONJUNTO : (linha.membroId ?? CHAVE_CONJUNTO);
}

type EstadoVazioProps = {
  competencia: string;
  contaSelecionada: string | undefined;
  nomeDaConta: string | undefined;
  /** Abre o painel de criacao — substitui a antiga ancora para o formulario fixo no rodape. */
  onNovo: () => void;
};

/**
 * Duas causas diferentes para a grade vir vazia merecem duas mensagens: um mes
 * sem nenhum lancamento (a pessoa provavelmente ainda nao lancou nada), e um
 * filtro de conta que nao bate com nada (a causa e o filtro, nao o mes — e a
 * saida e limpa-lo, nao lancar de novo).
 */
function EstadoVazio({ competencia, contaSelecionada, nomeDaConta, onNovo }: EstadoVazioProps) {
  const mes = formatarCompetencia(competencia);

  if (contaSelecionada) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="max-w-sm text-sm text-tinta-fraca">
          Nenhum lançamento {nomeDaConta ? `de ${nomeDaConta}` : 'desta conta'} em {mes}. O
          filtro de conta é a causa.
        </p>
        <Button asChild variant="outline">
          <Link href={`/despesas?competencia=${competencia}`}>Limpar filtro</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-sm text-tinta-fraca">Nenhum lançamento em {mes}.</p>
      <Button type="button" onClick={onNovo}>
        Lançar uma despesa
      </Button>
    </div>
  );
}

export function GradeLancamentos({
  linhas,
  competencia,
  contas,
  categorias,
  membros,
  contaSelecionada,
}: Props) {
  const [estado, setEstado] = useState<ModoPainel | null>(null);

  const abrirCriacao = () => setEstado({ modo: 'criar' });

  const conteudo = (() => {
    if (linhas.length === 0) {
      const nomeDaConta = contas.find((c) => c.id === contaSelecionada)?.nome;
      return (
        <EstadoVazio
          competencia={competencia}
          contaSelecionada={contaSelecionada}
          nomeDaConta={nomeDaConta}
          onNovo={abrirCriacao}
        />
      );
    }

    // As secoes nascem dos MEMBROS, na ordem `criadoEm asc` que a pagina ja usa
    // (docs/decisoes.md: a ordem de exibicao nao muda), com Conjunto sempre por
    // ultimo. `agrupar` devolve um grupo por chave desta mesma lista, na mesma
    // ordem — entao `secoes[i]` e `grupos[i]` sempre descrevem a mesma secao.
    const secoes = [
      ...membros.map((membro) => ({ chave: membro.id, titulo: membro.nome, cores: [membro.cor] })),
      { chave: CHAVE_CONJUNTO, titulo: 'Conjunto', cores: membros.map((m) => m.cor) },
    ];

    const grupos = agrupar(
      linhas.map((linha) => ({ chave: chaveDe(linha), valorCentavos: linha.valorCentavos, linha })),
      secoes.map((secao) => secao.chave),
    );

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-borda bg-superficie-alta text-xs uppercase tracking-wide text-tinta-fraca">
              {CABECALHOS.map((c) => (
                <th
                  key={c}
                  className={`px-3 py-2 font-medium ${c === 'Valor' || c === 'Ações' ? 'text-right' : 'text-left'}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          {secoes.map((secao, indice) => {
            const grupo = grupos[indice];
            // `secoes` virou `ordem` (o array de chaves passado a `agrupar`) duas
            // linhas acima, entao ha exatamente um grupo por secao, nesta mesma
            // posicao — agrupamento.test.ts cobre essa garantia. Nao achar aqui e
            // as duas listas terem se descolado, bug interno desta funcao.
            if (!grupo) {
              throw new Error(`Falha interna: grupo ausente para a secao ${secao.chave}`);
            }

            return (
              <SecaoPessoa
                key={secao.chave}
                titulo={secao.titulo}
                cores={secao.cores}
                grupo={grupo}
                colSpan={CABECALHOS.length}
                competencia={competencia}
                categorias={categorias}
                onEditar={(linha) => setEstado({ modo: 'editar', linha })}
              />
            );
          })}
        </table>
      </div>
    );
  })();

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-borda p-3">
        <ChipsConta competencia={competencia} contas={contas} contaSelecionada={contaSelecionada} />
        {/* mt-4 acompanha o espacamento que ChipsConta ja traz de fabrica (nav.mt-4),
            para os dois ficarem alinhados nesta barra. */}
        <Button id={ID_BOTAO_NOVO_LANCAMENTO} type="button" className="mt-4" onClick={abrirCriacao}>
          <Plus aria-hidden="true" />
          Novo lançamento
        </Button>
      </div>

      {conteudo}

      <PainelLancamento
        estado={estado}
        contas={contas}
        categorias={categorias}
        membros={membros}
        onFechar={() => setEstado(null)}
      />
    </>
  );
}
