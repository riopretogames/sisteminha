import { DIAS_SEMANA, TODOS_OS_DIAS, TODOS_OS_DIAS_LISTA } from '@/config/tarefas';
import { cn } from '@/lib/utils';

/**
 * Escolha dos dias em que a tarefa se repete: sete botões liga/desliga nas
 * cores do Trello, mais os atalhos "Todos os dias" e "Limpar" (= avulsa).
 *
 * Nenhum dia marcado quer dizer tarefa avulsa, feita uma vez só — o texto de
 * apoio diz isso, porque "nenhum dia" sozinho parece "nunca".
 */
export function SeletorDias({
  valor,
  onChange,
  disabled = false,
}: {
  valor: number[];
  onChange: (dias: number[]) => void;
  disabled?: boolean;
}) {
  const marcados = new Set(valor ?? []);
  const todos = marcados.size >= 7;

  const alternar = (n: number) => {
    const novo = new Set(marcados);
    if (novo.has(n)) novo.delete(n);
    else novo.add(n);
    onChange([...novo].sort((a, b) => a - b));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {DIAS_SEMANA.map((d) => {
          const ativo = marcados.has(d.n);
          return (
            <button
              key={d.n}
              type="button"
              disabled={disabled}
              aria-pressed={ativo}
              title={d.nome}
              onClick={() => alternar(d.n)}
              className={cn(
                'h-8 min-w-[2.75rem] rounded-md px-2 text-xs font-bold uppercase transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                ativo ? d.cor : 'border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {d.curto}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={todos}
          onClick={() => onChange(todos ? [] : [...TODOS_OS_DIAS_LISTA])}
          className={cn(
            'rounded-md px-2 py-1 font-semibold transition-colors disabled:opacity-50',
            todos ? TODOS_OS_DIAS.cor : 'border bg-background hover:bg-muted',
          )}
        >
          {TODOS_OS_DIAS.label}
        </button>
        {marcados.size > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Limpar
          </button>
        )}
        {marcados.size === 0 && (
          <span className="text-muted-foreground">Nenhum dia marcado: tarefa avulsa, feita uma vez só.</span>
        )}
      </div>
    </div>
  );
}
