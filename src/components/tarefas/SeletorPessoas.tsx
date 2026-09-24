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
import { AvataresPessoas } from '@/components/tarefas/AvataresPessoas';
import { cn } from '@/lib/utils';
import type { Pessoa } from '@/types/tarefas';

/**
 * Escolha de quem faz a tarefa (ou de quem é a coluna, com `unico`).
 *
 * A lista vem do CADASTRO (usePessoasDaLoja), nunca das tarefas carregadas —
 * senão quem ainda não tem tarefa não poderia receber a primeira.
 *
 * Quem já estava escolhido mas saiu do cadastro ativo (arquivado, desativado)
 * continua na tarefa quando se mexe nos outros: tirar alguém em silêncio só
 * porque ele não aparece mais na lista apagaria o histórico sem ninguém pedir.
 */
export function SeletorPessoas({
  pessoas,
  valor,
  onChange,
  disabled = false,
  unico = false,
  children,
  placeholder = 'Ninguém',
}: {
  pessoas: Pessoa[];
  valor: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Uma pessoa só (responsável da coluna). Escolher fecha o seletor. */
  unico?: boolean;
  /** Gatilho próprio (ex.: os avatares da célula da Tabela). */
  children?: ReactNode;
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const escolhidos = new Set(valor ?? []);
  const visiveis = pessoas.filter((p) => escolhidos.has(p.id));

  const alternar = (id: string) => {
    if (unico) {
      onChange(escolhidos.has(id) ? [] : [id]);
      setAberto(false);
      return;
    }
    const novo = new Set(escolhidos);
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
            className="w-full justify-between font-normal"
          >
            {visiveis.length > 0 ? (
              <span className="flex min-w-0 items-center gap-2">
                <AvataresPessoas pessoas={visiveis} max={3} />
                <span className="truncate">{visiveis.map((p) => p.nome).join(', ')}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Buscar pessoa..." />
          <CommandList>
            <CommandEmpty>Ninguém com esse nome no cadastro.</CommandEmpty>
            <CommandGroup>
              {pessoas.map((p) => {
                const marcado = escolhidos.has(p.id);
                return (
                  <CommandItem key={p.id} value={`${p.nome} ${p.id}`} onSelect={() => alternar(p.id)}>
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        marcado ? 'bg-primary text-primary-foreground' : 'opacity-50',
                      )}
                    >
                      {marcado && <Check className="h-3 w-3" />}
                    </span>
                    <AvataresPessoas pessoas={[p]} max={1} />
                    <span className="ml-2 truncate">{p.nome}</span>
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
