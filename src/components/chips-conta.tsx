type Conta = { id: string; nome: string; tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };

type Props = {
  competencia: string;
  contas: Conta[];
  contaSelecionada: string | undefined;
};

/**
 * Chips de filtro por conta, no topo da grade. "Todos" limpa o filtro; cada
 * chip de conta leva o `conta` para a query string, preservando a competência.
 */
export function ChipsConta({ competencia, contas, contaSelecionada }: Props) {
  return (
    <nav className="mt-4 flex gap-2">
      <a
        href={`/despesas?competencia=${competencia}`}
        className={`rounded-full border px-3 py-1 text-sm ${!contaSelecionada ? 'bg-neutral-900 text-white' : ''}`}
      >
        Todos
      </a>
      {contas.map((c) => (
        <a
          key={c.id}
          href={`/despesas?competencia=${competencia}&conta=${c.id}`}
          className={`rounded-full border px-3 py-1 text-sm ${contaSelecionada === c.id ? 'bg-neutral-900 text-white' : ''}`}
        >
          {c.nome}
        </a>
      ))}
    </nav>
  );
}
