import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useCatalogo } from '@/hooks/useCatalogos';
import { cn } from '@/lib/utils';

/**
 * Campo que escolhe um item de um cadastro de Listas do Sistema.
 *
 * Existe por causa de uma regra do projeto: campo que a loja cadastra tem que
 * aparecer sozinho na tela que o usa. Antes disso, telas importantes usavam
 * digitação livre — e o banco acabava com "Samsung", "samsung" e "SANSUNG"
 * como três marcas diferentes, o que estraga qualquer relatório.
 *
 * Cadastrar na hora é parte do desenho, não um extra. Lista fechada trava o
 * balcão quando aparece um modelo novo, e quem está com fila resolve
 * escolhendo o item errado — o que suja o cadastro do mesmo jeito, só que sem
 * ninguém perceber. Aqui, digitar algo que não existe oferece criar.
 *
 * O item já escolhido aparece mesmo se for desativado depois: sem isso, editar
 * a ficha apagaria em silêncio uma escolha antiga.
 */

interface Props {
  /** Tipo do catálogo, como em `src/config/catalogos.ts` (ex.: 'marca'). */
  tipo: string;
  valor: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  /** Deixa a pessoa cadastrar item novo daqui. Ligado por padrão. */
  permiteCriar?: boolean;
  /** Marca o rótulo com o asterisco vermelho de campo obrigatório. */
  obrigatorio?: boolean;
  disabled?: boolean;
  id?: string;
}

export function CampoCatalogo({
  tipo,
  valor,
  onChange,
  label,
  placeholder = 'Selecione...',
  permiteCriar = true,
  obrigatorio = false,
  disabled,
  id,
}: Props) {
  const catalogo = useCatalogo(tipo);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);

  const itens = useMemo(
    () => (catalogo.data ?? []).filter((i) => i.ativo || i.id === valor),
    [catalogo.data, valor]
  );

  const escolhido = itens.find((i) => i.id === valor);
  const termo = busca.trim();

  // Só oferece criar quando o que foi digitado não existe — nem ativo, nem
  // desativado. Senão a loja criaria duplicata do que já tem.
  const jaExiste = (catalogo.data ?? []).some(
    (i) => i.descricao.toLowerCase() === termo.toLowerCase()
  );
  const podeCriar = permiteCriar && termo.length >= 2 && !jaExiste;

  const criarEEscolher = async () => {
    setCriando(true);
    try {
      const novo = await catalogo.criar.mutateAsync(termo);
      if (novo?.id) onChange(novo.id);
      setBusca('');
      setAberto(false);
    } catch {
      // O hook já avisou o motivo em português.
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id}>
          {label}
          {obrigatorio && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={aberto}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !escolhido && 'text-muted-foreground')}>
              {escolhido
                ? `${escolhido.descricao}${escolhido.ativo ? '' : ' (desativado)'}`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder="Buscar ou digitar novo..." value={busca} onValueChange={setBusca} />
            <CommandList>
              <CommandEmpty>
                {podeCriar ? (
                  <button
                    type="button"
                    onClick={criarEEscolher}
                    disabled={criando}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {criando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Cadastrar <strong>"{termo}"</strong>
                  </button>
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {catalogo.isLoading ? 'Carregando...' : 'Nada encontrado.'}
                  </p>
                )}
              </CommandEmpty>

              <CommandGroup>
                {/* Deixa limpar a escolha: campo opcional preenchido por engano
                    não pode virar prisão. */}
                {valor && (
                  <CommandItem
                    value="__limpar__"
                    onSelect={() => {
                      onChange('');
                      setAberto(false);
                    }}
                    className="text-muted-foreground"
                  >
                    Limpar seleção
                  </CommandItem>
                )}
                {itens.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.descricao}
                    onSelect={() => {
                      onChange(item.id === valor ? '' : item.id);
                      setAberto(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        item.id === valor ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {item.descricao}
                    {!item.ativo && (
                      <span className="ml-2 text-xs text-muted-foreground">(desativado)</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>

              {/* Também oferece criar quando a busca traz parecidos mas não o
                  item exato — ex.: já existe "128GB" e a pessoa quer "1TB". */}
              {podeCriar && itens.length > 0 && (
                <CommandGroup>
                  <CommandItem value={`criar-${termo}`} onSelect={criarEEscolher}>
                    {criando ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Cadastrar "{termo}"
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
