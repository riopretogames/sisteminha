import { cn } from '@/lib/utils';
import type { SegmentoResumo } from './resumoDoGrupo';

/**
 * A barrinha colorida do rodapé de cada grupo — o gráfico de barras do Monday.
 * Cada cor ocupa a fatia do total que ela representa: bate o olho e vê se a
 * coluna do Pedro está mais verde (feito) ou mais cinza (não iniciado).
 *
 * O texto por extenso fica no `title` (passar o mouse) e no nome acessível.
 */
export function BarraResumo({
  segmentos,
  descricao,
  className,
}: {
  segmentos: SegmentoResumo[];
  descricao: string;
  className?: string;
}) {
  const total = segmentos.reduce((s, x) => s + x.quantidade, 0);
  return (
    <div
      role="img"
      aria-label={descricao}
      title={descricao}
      className={cn('flex h-6 w-full overflow-hidden rounded-md bg-muted', className)}
    >
      {total > 0 &&
        segmentos
          .filter((s) => s.quantidade > 0)
          .map((s) => (
            <div
              key={s.chave}
              className={cn('h-full transition-[width] duration-300', s.cor)}
              style={{ width: `${(s.quantidade / total) * 100}%` }}
            />
          ))}
    </div>
  );
}
