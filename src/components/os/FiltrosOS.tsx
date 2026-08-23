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
import { FILTROS_OS_VAZIO, type FiltrosOSValores } from '@/lib/filtrosOS';

/**
 * Painel de filtros das listas de OS.
 *
 * Pedido do Felipe em 09/08, com o sistema antigo como referência: as telas de
 * consulta precisam filtrar por cliente, período, equipamento, marca, modelo,
 * técnico e número — não só por um campo de busca solto.
 *
 * O motivo é operacional: quando o cliente liga perguntando "e o meu console?",
 * quem atende tem o telefone dele, ou a marca, ou a data — quase nunca o número
 * da OS. Uma busca por texto só acha quem já sabe o que procurar.
 *
 * As listas de equipamento/marca/modelo vêm dos catálogos DA ASSISTÊNCIA
 * (`os_*`), nunca dos de produto — são cadastros separados.
 */

interface Props {
  valores: FiltrosOSValores;
  onChange: (v: FiltrosOSValores) => void;
  /** Pessoas que aparecem no filtro de técnico. */
  tecnicos?: { id: string; nome: string }[];
  /** Quantas linhas o filtro deixou passar, para dar retorno imediato. */
  resultados?: number;
}

export function FiltrosOS({ valores, onChange, tecnicos = [], resultados }: Props) {
  const equipamentos = useCatalogo('os_equipamento');
  const marcas = useCatalogo('os_marca');
  const modelos = useCatalogo('os_modelo');

  const alterar = <C extends keyof FiltrosOSValores>(campo: C, valor: FiltrosOSValores[C]) =>
    onChange({ ...valores, [campo]: valor });

  const temFiltro = Object.values(valores).some((v) => v !== '');

  const lista = (dados: { id: string; descricao: string; ativo: boolean }[] | undefined, atual: string) =>
    (dados ?? []).filter((i) => i.ativo || i.id === atual);

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-slate-800 px-4 py-2.5 text-white dark:bg-slate-700">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" />
            Filtros
          </p>
          <div className="flex items-center gap-3">
            {resultados !== undefined && (
              <span className="text-sm text-white/90">
                {resultados} {resultados === 1 ? 'ordem' : 'ordens'}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!temFiltro}
              onClick={() => onChange(FILTROS_OS_VAZIO)}
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
              placeholder="Nº da OS, cliente, telefone, IMEI ou nº de série"
            />
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

          <div className="space-y-1.5">
            <Label htmlFor="f-equip" className="text-xs">
              Equipamento
            </Label>
            <Select
              value={valores.equipamentoId || 'todos'}
              onValueChange={(v) => alterar('equipamentoId', v === 'todos' ? '' : v)}
            >
              <SelectTrigger id="f-equip">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {lista(equipamentos.data, valores.equipamentoId).map((i) => (
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
            <Label htmlFor="f-tecnico" className="text-xs">
              Técnico
            </Label>
            <Select
              value={valores.tecnicoId || 'todos'}
              onValueChange={(v) => alterar('tecnicoId', v === 'todos' ? '' : v)}
            >
              <SelectTrigger id="f-tecnico">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sem">Sem técnico</SelectItem>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
