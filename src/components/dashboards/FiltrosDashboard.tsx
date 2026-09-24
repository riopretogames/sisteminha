import { Filter, X, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ATALHOS, ROTULO_ATALHO, resolverPeriodo, type Atalho } from '@/lib/periodo';
import {
  temFiltroAplicado,
  type FiltrosDashboardValores,
} from '@/lib/filtrosDashboard';
import type { OpcaoFiltro } from '@/lib/listasDeFiltro';
import { hojeISO } from '@/lib/format';

/**
 * Barra de filtros dos dashboards.
 *
 * Os painéis nasceram sem filtro nenhum: eram sempre "hoje" e "esta semana",
 * fixos no código. Isso respondia "como estamos agora" e mais nada — não dava
 * para ver o mês passado, comparar com o ano anterior, olhar só um vendedor
 * ou só uma categoria. Esta barra é o que destrava todas essas perguntas, e é
 * a mesma nas quatro telas de propósito: quem aprende a filtrar em Vendas já
 * sabe filtrar em Assistência.
 *
 * A lista de pessoas e de categorias vem de fora porque cada tela conhece a
 * sua: Vendas manda vendedores, Assistência manda técnicos, Estoque não manda
 * ninguém (e aí o campo simplesmente não aparece).
 */

interface Props {
  valores: FiltrosDashboardValores;
  onChange: (v: FiltrosDashboardValores) => void;
  onLimpar: () => void;
  /**
   * Pessoas para o filtro — vêm do CADASTRO de gente da loja, não de quem
   * apareceu no movimento do período (ver lib/listasDeFiltro.ts). Vazio ou
   * ausente esconde o campo.
   */
  pessoas?: OpcaoFiltro[];
  /** Como chamar a pessoa nesta tela: "Vendedor", "Técnico"… */
  rotuloPessoa?: string;
  /** Categorias para o filtro, também vindas do cadastro. */
  categorias?: OpcaoFiltro[];
  rotuloCategoria?: string;
  /** Some com a chave de comparação (telas onde ela não faz sentido). */
  ocultarComparacao?: boolean;
}

export function FiltrosDashboard({
  valores,
  onChange,
  onLimpar,
  pessoas = [],
  rotuloPessoa = 'Vendedor',
  categorias = [],
  rotuloCategoria = 'Categoria',
  ocultarComparacao = false,
}: Props) {
  const periodo = resolverPeriodo(valores.periodo);
  const personalizado = valores.periodo.atalho === 'personalizado';

  const trocarAtalho = (atalho: Atalho) => {
    // Ao escolher "Escolher as datas" sem ter datas ainda, já sugere o dia de
    // hoje nos dois campos — melhor que dois campos vazios, que não mostram
    // número nenhum até alguém preencher os dois.
    if (atalho === 'personalizado' && !valores.periodo.de) {
      onChange({ ...valores, periodo: { atalho, de: hojeISO(), ate: hojeISO() } });
      return;
    }
    onChange({ ...valores, periodo: { ...valores.periodo, atalho } });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800 px-4 py-2.5 text-white dark:bg-slate-700">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4" />
          Filtros
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-white/90">
            <CalendarRange className="h-4 w-4" />
            {periodo.rotulo}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!temFiltroAplicado(valores)}
            onClick={onLimpar}
          >
            <X className="mr-2 h-4 w-4" />
            Limpar filtros
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="fd-periodo" className="text-xs">
              Período
            </Label>
            <Select value={valores.periodo.atalho} onValueChange={(v) => trocarAtalho(v as Atalho)}>
              <SelectTrigger id="fd-periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATALHOS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {ROTULO_ATALHO[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {personalizado && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fd-de" className="text-xs">
                  De
                </Label>
                <Input
                  id="fd-de"
                  type="date"
                  value={valores.periodo.de ?? ''}
                  onChange={(e) =>
                    onChange({ ...valores, periodo: { ...valores.periodo, de: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fd-ate" className="text-xs">
                  Até
                </Label>
                <Input
                  id="fd-ate"
                  type="date"
                  value={valores.periodo.ate ?? ''}
                  onChange={(e) =>
                    onChange({ ...valores, periodo: { ...valores.periodo, ate: e.target.value } })
                  }
                />
              </div>
            </>
          )}

          {pessoas.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="fd-pessoa" className="text-xs">
                {rotuloPessoa}
              </Label>
              <Select
                value={valores.pessoaId || 'todos'}
                onValueChange={(v) => onChange({ ...valores, pessoaId: v === 'todos' ? '' : v })}
              >
                <SelectTrigger id="fd-pessoa">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {categorias.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="fd-categoria" className="text-xs">
                {rotuloCategoria}
              </Label>
              <Select
                value={valores.categoria || 'todas'}
                onValueChange={(v) => onChange({ ...valores, categoria: v === 'todas' ? '' : v })}
              >
                <SelectTrigger id="fd-categoria">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!ocultarComparacao && (
            <div className="flex items-end gap-2 pb-1">
              <Switch
                id="fd-comparar"
                checked={valores.comparar}
                onCheckedChange={(c) => onChange({ ...valores, comparar: c })}
              />
              <Label htmlFor="fd-comparar" className="text-xs leading-tight">
                Comparar com o<br />período anterior
              </Label>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
