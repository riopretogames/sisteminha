import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface OpcaoPintada<V extends string> {
  valor: V;
  rotulo: string;
  /** Classe completa ("bg-amber-500 text-white"), vinda de config/tarefas.ts. */
  cor: string;
}

const BASE =
  'flex h-10 w-full items-center justify-center px-2 text-center text-xs font-semibold leading-tight';

/**
 * A célula inteira pintada, o jeito do Monday de mostrar prioridade e status:
 * a cor se lê de longe, antes do texto. Clicar abre as opções, cada uma já na
 * sua cor, e escolher grava na hora.
 *
 * Sem permissão para mudar, é só a cor — sem cara de botão, para ninguém
 * clicar e achar que o sistema travou.
 */
export function CelulaPintada<V extends string>({
  coluna,
  rotulo,
  cor,
  opcoes,
  atual,
  podeMudar,
  onEscolher,
  explicacao,
  motivoSemPermissao,
}: {
  /** "Prioridade", "Status": vira o título do seletor ("Mudar status"). */
  coluna: string;
  rotulo: string;
  cor: string;
  opcoes: OpcaoPintada<V>[];
  /** Valor marcado no seletor (null = nenhum, como no "Atrasada", que é derivado). */
  atual: V | null;
  podeMudar: boolean;
  onEscolher: (valor: V) => void;
  /** Frase leiga no pé do seletor (ex.: o "Feito" da recorrente vale só hoje). */
  explicacao?: ReactNode;
  motivoSemPermissao?: string;
}) {
  const [aberto, setAberto] = useState(false);

  if (!podeMudar) {
    return (
      <div className={cn(BASE, cor, 'cursor-default')} title={motivoSemPermissao}>
        {rotulo}
      </div>
    );
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Mudar ${coluna.toLowerCase()}`}
          className={cn(
            BASE,
            cor,
            'transition-[filter] hover:brightness-110 active:brightness-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80',
          )}
        >
          {rotulo}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="center">
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Mudar {coluna.toLowerCase()}</p>
        <div className="space-y-1.5" role="listbox" aria-label={coluna}>
          {opcoes.map((o) => {
            const marcada = o.valor === atual;
            return (
              <button
                key={o.valor}
                type="button"
                role="option"
                aria-selected={marcada}
                onClick={() => {
                  setAberto(false);
                  if (!marcada) onEscolher(o.valor);
                }}
                className={cn(
                  'relative flex h-9 w-full items-center justify-center rounded-md px-8 text-xs font-semibold shadow-sm',
                  'transition-[filter,transform] hover:brightness-110 active:scale-[0.98]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  o.cor,
                  marcada && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover',
                )}
              >
                {o.rotulo}
                {marcada && <Check className="absolute right-2.5 h-4 w-4" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        {explicacao && <p className="mt-2 px-1 text-[11px] leading-snug text-muted-foreground">{explicacao}</p>}
      </PopoverContent>
    </Popover>
  );
}
