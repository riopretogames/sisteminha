import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { corDaEtiqueta } from '@/lib/cores';
import { iniciais } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { Pessoa } from '@/types/tarefas';


/**
 * As bolinhas de quem faz a tarefa, sobrepostas como no Trello.
 *
 * Passou do máximo, mostra "+2" em vez de encolher todo mundo. O nome de
 * todos fica no `title`: passar o mouse diz quem é, sem abrir a ficha. Sem
 * foto, a bolinha ganha uma cor fixa pelo nome (a mesma regra das etiquetas),
 * para o Pedro ter sempre a mesma cor em qualquer quadro.
 */
export function AvataresPessoas({
  pessoas,
  max = 3,
  tamanho = 'sm',
}: {
  pessoas: Pessoa[];
  max?: number;
  tamanho?: 'sm' | 'md';
}) {
  if (!pessoas || pessoas.length === 0) return null;

  const visiveis = pessoas.slice(0, max);
  const resto = pessoas.length - visiveis.length;
  const medida = tamanho === 'md' ? 'h-8 w-8 text-xs' : 'h-6 w-6 text-[10px]';

  return (
    <div className="flex items-center -space-x-1.5" title={pessoas.map((p) => p.nome).join(', ')}>
      {visiveis.map((p) => (
        <Avatar key={p.id} className={cn(medida, 'ring-2 ring-background')}>
          {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.nome} />}
          <AvatarFallback className={cn('font-semibold', corDaEtiqueta(null, p.nome))}>
            {iniciais(p.nome)}
          </AvatarFallback>
        </Avatar>
      ))}
      {resto > 0 && (
        <span
          className={cn(
            medida,
            'relative flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background',
          )}
        >
          +{resto}
        </span>
      )}
    </div>
  );
}
