import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useCatalogo } from '@/hooks/useCatalogos';
import { PRODUTO_CATEGORIAS, PRODUTO_LOCALIZACOES } from '@/lib/constants';
import { FILTROS_PRODUTOS_VAZIO, type FiltrosProdutosValores } from '@/lib/filtrosProdutos';

/**
 * Painel de filtros do Estoque. Mesmo desenho de `FiltrosOS`/`FiltrosVenda`
 * (pedido do Felipe em 09/08, agora estendido pro Estoque em 10/08, com o
 * sistema antigo como referência) — a tela só tinha uma busca por texto.
 */

interface Props {
  valores: FiltrosProdutosValores;
  onChange: (v: FiltrosProdutosValores) => void;
  resultados?: number;
}

export function FiltrosProdutos({ valores, onChange, resultados }: Props) {
  const grupos = useCatalogo('grupo_produto');
  const marcas = useCatalogo('marca');
  const modelos = useCatalogo('modelo');
  const cores = useCatalogo('cor');
  const condicoes = useCatalogo('condicao');
  const memorias = useCatalogo('memoria');

  const alterar = <C extends keyof FiltrosProdutosValores>(
    campo: C,
    valor: FiltrosProdutosValores[C]
  ) => onChange({ ...valores, [campo]: valor });

  const temFiltro = Object.values(valores).some((v) => v !== '');

  const lista = (dados: { id: string; descricao: string; ativo: boolean }[] | undefined, atual: string) =>
    (dados ?? []).filter((i) => i.ativo || i.id === atual);

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4" />
          Filtros
        </p>
        <div className="flex items-center gap-3">
          {resultados !== undefined && (
            <span className="text-sm text-white/90">
              {resultados} {resultados === 1 ? 'produto' : 'produtos'}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!temFiltro}
            onClick={() => onChange(FILTROS_PRODUTOS_VAZIO)}
          >
            <X className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-busca" className="text-xs">
              Buscar
            </Label>
            <Input
              id="f-busca"
              value={valores.busca}
              onChange={(e) => alterar('busca', e.target.value)}
              placeholder="Nome, código de barras, IMEI ou nº de série"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-apto" className="text-xs">
              Apto à Venda
            </Label>
            <Select
              value={valores.aptoVenda || 'todos'}
              onValueChange={(v) => alterar('aptoVenda', (v === 'todos' ? '' : v) as FiltrosProdutosValores['aptoVenda'])}
            >
              <SelectTrigger id="f-apto">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-grupo" className="text-xs">
              Grupo
            </Label>
            <Select
              value={valores.grupoProdutoId || 'todos'}
              onValueChange={(v) => alterar('grupoProdutoId', v === 'todos' ? '' : v)}
            >
              <SelectTrigger id="f-grupo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {lista(grupos.data, valores.grupoProdutoId).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-marca" className="text-xs">
              Marca
            </Label>
            <Select
              value={valores.marcaId || 'todas'}
              onValueChange={(v) => alterar('marcaId', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="f-marca">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {lista(marcas.data, valores.marcaId).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-modelo" className="text-xs">
              Modelo
            </Label>
            <Select
              value={valores.modeloId || 'todos'}
              onValueChange={(v) => alterar('modeloId', v === 'todos' ? '' : v)}
            >
              <SelectTrigger id="f-modelo">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {lista(modelos.data, valores.modeloId).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-cor" className="text-xs">
              Cor
            </Label>
            <Select
              value={valores.corId || 'todas'}
              onValueChange={(v) => alterar('corId', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="f-cor">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {lista(cores.data, valores.corId).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-condicao" className="text-xs">
              Condição
            </Label>
            <Select
              value={valores.condicaoId || 'todas'}
              onValueChange={(v) => alterar('condicaoId', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="f-condicao">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {lista(condicoes.data, valores.condicaoId).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-memoria" className="text-xs">
              Memória
            </Label>
            <Select
              value={valores.memoriaId || 'todas'}
              onValueChange={(v) => alterar('memoriaId', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="f-memoria">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {lista(memorias.data, valores.memoriaId).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-categoria" className="text-xs">
              Categoria
            </Label>
            <Select
              value={valores.categoria || 'todas'}
              onValueChange={(v) => alterar('categoria', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="f-categoria">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {Object.entries(PRODUTO_CATEGORIAS).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-localizacao" className="text-xs">
              Localização
            </Label>
            <Select
              value={valores.localizacao || 'todas'}
              onValueChange={(v) => alterar('localizacao', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="f-localizacao">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {Object.entries(PRODUTO_LOCALIZACOES).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-de" className="text-xs">
              Entrada de
            </Label>
            <Input
              id="f-de"
              type="date"
              value={valores.de}
              onChange={(e) => alterar('de', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="f-ate" className="text-xs">
              Entrada até
            </Label>
            <Input
              id="f-ate"
              type="date"
              value={valores.ate}
              onChange={(e) => alterar('ate', e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
