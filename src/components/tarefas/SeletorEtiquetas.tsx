import { useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { EtiquetaChip } from '@/components/tarefas/EtiquetaChip';
import { cn } from '@/lib/utils';
import type { Etiqueta } from '@/types/tarefas';

/**
 * Escolha das etiquetas da tarefa, do catálogo `tarefa_etiqueta` — a loja
 * cria as dela em Cadastros > Listas do Sistema > Tarefas da equipe.
 *
 * `selecionadas` serve para mostrar etiqueta já escolhida que foi desativada
 * no catálogo (regra das listas editáveis): sem isso, ela sumiria do seletor
 * e o próximo clique a apagaria da tarefa sem ninguém pedir.
 */
export function SeletorEtiquetas({
  etiquetas,
  valor,
  onChange,
  selecionadas = [],
  disabled = false,
  children,
}: {
  /** Catálogo (ativos). */
  etiquetas: Etiqueta[];
  valor: string[];
  onChange: (ids: string[]) => void;
  /** As etiquetas que a tarefa já tem (para incluir as desativadas). */
  selecionadas?: Etiqueta[];
  disabled?: boolean;
  /** Gatilho próprio (ex.: os chips da célula da Tabela). */
  children?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const escolhidas = new Set(valor ?? []);

  const opcoes = [...etiquetas];
  for (const e of selecionadas) if (!opcoes.some((o) => o.id === e.id)) opcoes.push(e);
  const visiveis = opcoes.filter((e) => escolhidas.has(e.id));

  const alternar = (id: string) => {
    const novo = new Set(escolhidas);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    onChange([...novo]);
  };

  return (
    <Popover open={aberto} onOpenChange={(v) => !disabled && setAberto(v)}>
      <PopoverTrigger asChild disabled={disabled}>
        {children ?? (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            disabled={disabled}
            className="h-auto min-h-10 w-full justify-between font-normal"
          >
            {visiveis.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {visiveis.map((e) => (
                  <EtiquetaChip key={e.id} etiqueta={e} pequena />
                ))}
              </span>
            ) : (
              <span className="text-muted-foreground">Sem etiqueta</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Buscar etiqueta..." />
          <CommandList>
            <CommandEmpty>
              Nenhuma etiqueta com esse nome. Crie em Cadastros &gt; Listas do Sistema.
            </CommandEmpty>
            <CommandGroup>
              {opcoes.map((e) => {
                const marcada = escolhidas.has(e.id);
                return (
                  <CommandItem key={e.id} value={`${e.descricao} ${e.id}`} onSelect={() => alternar(e.id)}>
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        marcada ? 'bg-primary text-primary-foreground' : 'opacity-50',
                      )}
                    >
                      {marcada && <Check className="h-3 w-3" />}
                    </span>
                    <EtiquetaChip etiqueta={e} pequena />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
