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
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { FILTROS_VENDA_VAZIO, type FiltrosVendaValores } from '@/lib/filtrosVenda';

/**
 * Painel de filtros do histórico de vendas.
 *
 * A tela tinha um campo de busca só, por número e cliente. Isso responde
 * "cadê aquela venda", mas não as perguntas do dia a dia da loja: quanto cada
 * vendedor vendeu no mês, para quem saiu determinada peça, quanto entrou em
 * cartão, quais vendas passaram de um valor.
 *
 * Produto e número de série filtram pelo que foi VENDIDO, não pela venda: as
 * duas informações vivem nos itens, e é por elas que alguém procura quando o
 * cliente volta com um aparelho na mão.
 */

const STATUS = [
  { valor: 'pago', label: 'Pago' },
  { valor: 'faturado', label: 'Faturado' },
  { valor: 'rascunho', label: 'Rascunho' },
  { valor: 'cancelado', label: 'Cancelado' },
];

interface Props {
  valores: FiltrosVendaValores;
  onChange: (v: FiltrosVendaValores) => void;
  vendedores?: { id: string; nome: string }[];
  resultados?: number;
}

export function FiltrosVenda({ valores, onChange, vendedores = [], resultados }: Props) {
  const alterar = <C extends keyof FiltrosVendaValores>(
    campo: C,
    valor: FiltrosVendaValores[C]
  ) => onChange({ ...valores, [campo]: valor });

  const temFiltro = Object.values(valores).some((v) => v !== '');

  return (
    <Card className="mb-6">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" />
            Filtros
          </p>
          <div className="flex items-center gap-3">
            {resultados !== undefined && (
              <span className="text-sm text-muted-foreground">
                {resultados} {resultados === 1 ? 'venda' : 'vendas'}
              </span>
            )}
            {temFiltro && (
              <Button variant="outline" size="sm" onClick={() => onChange(FILTROS_VENDA_VAZIO)}>
                <X className="mr-2 h-4 w-4" />
                Limpar filtro
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fv-busca" className="text-xs">
              Buscar
            </Label>
            <Input
              id="fv-busca"
              value={valores.busca}
              onChange={(e) => alterar('busca', e.target.value)}
              placeholder="Nº da venda, cliente ou vendedor"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-de" className="text-xs">
              Data de
            </Label>
            <Input
              id="fv-de"
              type="date"
              value={valores.de}
              onChange={(e) => alterar('de', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-ate" className="text-xs">
              Data até
            </Label>
            <Input
              id="fv-ate"
              type="date"
              value={valores.ate}
              onChange={(e) => alterar('ate', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-produto" className="text-xs">
              Produto vendido
            </Label>
            <Input
              id="fv-produto"
              value={valores.produto}
              onChange={(e) => alterar('produto', e.target.value)}
              placeholder="Nome do produto"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-serie" className="text-xs">
              IMEI / Nº de série
            </Label>
            <Input
              id="fv-serie"
              value={valores.serie}
              onChange={(e) => alterar('serie', e.target.value)}
              placeholder="Do produto vendido"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-vendedor" className="text-xs">
              Vendedor
            </Label>
            <Select
              value={valores.vendedorId || 'todos'}
              onValueChange={(v) => alterar('vendedorId', v === 'todos' ? '' : v)}
            >
              <SelectTrigger id="fv-vendedor">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-status" className="text-xs">
              Situação
            </Label>
            <Select
              value={valores.status || 'todas'}
              onValueChange={(v) => alterar('status', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="fv-status">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {STATUS.map((s) => (
                  <SelectItem key={s.valor} value={s.valor}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fv-pagamento" className="text-xs">
              Forma de pagamento
            </Label>
            <Select
              value={valores.formaPagamento || 'todas'}
              onValueChange={(v) => alterar('formaPagamento', v === 'todas' ? '' : v)}
            >
              <SelectTrigger id="fv-pagamento">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {Object.entries(FORMAS_PAGAMENTO).map(([chave, cfg]) => (
                  <SelectItem key={chave} value={chave}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="fv-min" className="text-xs">
                Valor de
              </Label>
              <Input
                id="fv-min"
                type="number"
                min={0}
                step="0.01"
                value={valores.valorMin}
                onChange={(e) => alterar('valorMin', e.target.value)}
                placeholder="R$"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fv-max" className="text-xs">
                até
              </Label>
              <Input
                id="fv-max"
                type="number"
                min={0}
                step="0.01"
                value={valores.valorMax}
                onChange={(e) => alterar('valorMax', e.target.value)}
                placeholder="R$"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
