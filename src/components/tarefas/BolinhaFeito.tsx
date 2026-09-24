import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A bolinha de "feito" do cartão e de Minhas Tarefas.
 *
 * `stopPropagation` porque ela mora dentro do cartão, e o clique no cartão
 * abre a ficha: sem isso, marcar feito abriria a ficha junto. O mesmo vale
 * para o `pointerdown`, que é o que começa um arrasto no Kanban.
 */
export function BolinhaFeito({
  feita,
  onClick,
  disabled = false,
  titulo,
  tamanho = 'sm',
}: {
  feita: boolean;
  onClick: () => void;
  disabled?: boolean;
  titulo?: string;
  /** 'lg' é a caixa grande de Minhas Tarefas. */
  tamanho?: 'sm' | 'lg';
}) {
  const rotulo = titulo ?? (feita ? 'Desmarcar feito' : 'Marcar como feito');
  return (
    <button
      type="button"
      aria-pressed={feita}
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        tamanho === 'lg' ? 'h-7 w-7' : 'h-5 w-5',
        feita
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-muted-foreground/40 bg-background text-transparent hover:border-emerald-500 hover:text-emerald-500/60',
      )}
    >
      <Check className={tamanho === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} strokeWidth={3} />
    </button>
  );
}
