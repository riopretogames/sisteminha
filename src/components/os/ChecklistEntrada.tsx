import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCatalogo } from '@/hooks/useCatalogos';

/**
 * Um bloco de marcações da entrada do aparelho.
 *
 * Serve aos três blocos do check-in — sintomas relatados, pertences deixados e
 * estado físico —, porque os três são a mesma coisa por baixo: uma lista
 * editável em Listas do Sistema, marcada com liga/desliga.
 *
 * Os itens NÃO são lista fixa no código. Criar "Não lê cartão" no cadastro faz
 * o item aparecer aqui sozinho, e o botão de cadastrar leva direto pra lá sem
 * perder o que já foi preenchido na OS.
 */

interface Props {
  tipo: string;
  titulo: string;
  hint: string;
  selecionados: string[];
  onChange: (ids: string[]) => void;
  /** Cor da faixa do título, para os blocos se distinguirem de relance. */
  tom?: 'defeito' | 'item' | 'condicao';
  /**
   * Âncora para o aviso de campo obrigatório rolar até aqui.
   *
   * Sem ela, a loja que exige "condição de entrada" via o aviso e a tela não
   * saía do lugar — o bloco fica no meio da página e o aviso apontava para o
   * nada.
   */
  id?: string;
  /** Marca o título com o asterisco vermelho: a loja exige pelo menos um. */
  obrigatorio?: boolean;
}

const TOM = {
  defeito: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  item: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
  condicao: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
};

export function ChecklistEntrada({
  tipo,
  titulo,
  hint,
  selecionados,
  onChange,
  tom = 'defeito',
  id,
  obrigatorio = false,
}: Props) {
  const catalogo = useCatalogo(tipo);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState('');
  const [criando, setCriando] = useState(false);

  // Item desativado depois de marcado continua aparecendo: senão editar a OS
  // apagaria em silêncio o registro de que o cliente deixou uma fonte junto.
  const itens = (catalogo.data ?? []).filter((i) => i.ativo || selecionados.includes(i.id));

  const filtrados = busca.trim()
    ? itens.filter((i) => i.descricao.toLowerCase().includes(busca.trim().toLowerCase()))
    : itens;

  const alternar = (id: string) =>
    onChange(
      selecionados.includes(id) ? selecionados.filter((s) => s !== id) : [...selecionados, id]
    );

  const cadastrar = async () => {
    const descricao = novo.trim();
    if (descricao.length < 2) return;

    setCriando(true);
    try {
      const criado = await catalogo.criar.mutateAsync(descricao);
      // Já entra marcado: quem cadastrou no meio do check-in é porque o
      // aparelho tem aquilo agora, não pra usar depois.
      if (criado?.id) onChange([...selecionados, criado.id]);
      setNovo('');
    } catch {
      // O hook já mostrou o motivo.
    } finally {
      setCriando(false);
    }
  };

  return (
    <div id={id} className="flex flex-col rounded-lg border">
      <div className={`rounded-t-lg px-3 py-2 ${TOM[tom]}`}>
        <p className="text-sm font-semibold">
          {titulo}
          {obrigatorio && <span className="text-destructive"> *</span>}
        </p>
        <p className="text-xs opacity-80">{hint}</p>
      </div>

      <div className="border-b p-2">
        <Input
          placeholder="Filtrar..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-8"
        />
      </div>

      <ScrollArea className="h-64">
        <div className="divide-y">
          {filtrados.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {catalogo.isLoading ? 'Carregando...' : 'Nenhum item. Cadastre abaixo.'}
            </p>
          ) : (
            filtrados.map((item) => (
              <label
                key={item.id}
                htmlFor={`${tipo}-${item.id}`}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
              >
                <Switch
                  id={`${tipo}-${item.id}`}
                  checked={selecionados.includes(item.id)}
                  onCheckedChange={() => alternar(item.id)}
                />
                <span className="text-sm">
                  {item.descricao}
                  {!item.ativo && (
                    <span className="ml-2 text-xs text-muted-foreground">(desativado)</span>
                  )}
                </span>
              </label>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t p-2">
        <Label htmlFor={`novo-${tipo}`} className="sr-only">
          Cadastrar item novo
        </Label>
        <Input
          id={`novo-${tipo}`}
          placeholder="Cadastrar item novo..."
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void cadastrar();
            }
          }}
          className="h-8"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={cadastrar}
          disabled={criando || novo.trim().length < 2}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
