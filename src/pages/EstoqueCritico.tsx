import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { moeda } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * Estoque Crítico — o alerta de reposição.
 *
 * Cada produto tem seu próprio `estoque_minimo` (não é um número fixo pra
 * todo mundo): esta tela lista quem está NO mínimo ou abaixo dele, do mais
 * urgente pro menos urgente, com um jeito rápido de repor sem precisar abrir
 * o cadastro completo do produto.
 *
 * O corte crítico/ok é sempre calculado no cliente (estoque_atual <=
 * estoque_minimo) porque o PostgREST não compara duas colunas da mesma
 * linha direto no filtro — mesma limitação documentada no bug corrigido no
 * card do Dashboard.
 */

interface Produto {
  id: string;
  nome: string;
  marca: string | null;
  categoria: string;
  /** Vem nulo para quem não tem `inventory.cost.view` — a view decide. */
  custo?: number | null;
  preco?: number | null;
  estoque_atual: number;
  estoque_minimo: number;
}

export default function EstoqueCritico() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const podeRepor = can(PERMISSIONS.INVENTORY_ADJUST);

  const [repondo, setRepondo] = useState<Produto | null>(null);
  const [quantidadeRepor, setQuantidadeRepor] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['estoque-critico'],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from('vw_produtos')
        .select('id, nome, marca, categoria, estoque_atual, estoque_minimo, custo, preco')
        .eq('ativo', true);
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const criticos = (data ?? [])
    .filter((p) => p.estoque_atual <= p.estoque_minimo)
    .sort((a, b) => (a.estoque_atual - a.estoque_minimo) - (b.estoque_atual - b.estoque_minimo));

  const zerados = criticos.filter((p) => p.estoque_atual === 0).length;

  /**
   * Quanto custa resolver a lista inteira.
   *
   * "12 produtos em alerta" não ajuda a decidir nada. "Repor tudo custa
   * R$ 3.400 e devolve R$ 5.900 na prateleira" é uma decisão de compra — e é
   * essa a pergunta de quem abre esta tela.
   *
   * A quantidade considerada é o que falta para chegar ao mínimo, não um
   * palpite de quanto comprar.
   */
  const faltando = criticos.reduce(
    (soma, p) => soma + Math.max(0, p.estoque_minimo - p.estoque_atual),
    0
  );
  const custoReposicao = criticos.reduce(
    (soma, p) => soma + Math.max(0, p.estoque_minimo - p.estoque_atual) * Number(p.custo ?? 0),
    0
  );
  const valorEmVenda = criticos.reduce(
    (soma, p) => soma + Math.max(0, p.estoque_minimo - p.estoque_atual) * Number(p.preco ?? 0),
    0
  );
  const vecusto = custoReposicao > 0;

  const abrirReposicao = (produto: Produto) => {
    setRepondo(produto);
    setQuantidadeRepor(String(Math.max(produto.estoque_minimo - produto.estoque_atual, 1)));
  };

  const confirmarReposicao = async () => {
    if (!repondo) return;
    const quantidade = parseInt(quantidadeRepor, 10);
    if (!quantidade || quantidade <= 0) {
      toast({ title: 'Informe uma quantidade válida', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.rpc('ajustar_estoque_produto', {
        _produto_id: repondo.id,
        _nova_quantidade: repondo.estoque_atual + quantidade,
        _motivo: 'Reposição de estoque',
      });
      if (error) throw error;

      toast({
        title: 'Estoque reposto!',
        description: `${repondo.nome}: +${quantidade} unidade(s).`,
      });
      setRepondo(null);
      queryClient.invalidateQueries({ queryKey: ['estoque-critico'] });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao repor estoque',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Estoque Crítico"
        hint="Produtos no ou abaixo do estoque mínimo — cada um tem seu próprio limite de reposição, configurado no cadastro do produto."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Produtos em alerta"
          valor={String(criticos.length)}
          detalhe="No ou abaixo do estoque mínimo"
          tom={criticos.length > 0 ? 'alerta' : 'positivo'}
        />
        <Indicador
          rotulo="Zerados"
          valor={String(zerados)}
          detalhe="Sem nenhuma unidade disponível"
          tom={zerados > 0 ? 'negativo' : 'positivo'}
        />
        <Indicador
          rotulo="Peças faltando"
          valor={String(faltando)}
          detalhe="Para todos chegarem ao mínimo"
        />
        {vecusto ? (
          <Indicador
            rotulo="Custo para repor tudo"
            valor={moeda(custoReposicao)}
            detalhe={`Venderia por ${moeda(valorEmVenda)}`}
          />
        ) : (
          <Indicador
            rotulo="Valor em venda"
            valor={moeda(valorEmVenda)}
            detalhe="Do que falta repor"
          />
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">Carregando…</div>
      ) : criticos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <PartyPopper className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 font-medium">Nenhum produto em estoque crítico</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Todo mundo está acima do próprio mínimo configurado.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Atual</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Faltam</TableHead>
                {podeRepor && <TableHead className="w-[1%]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {criticos.map((p) => {
                const faltam = Math.max(p.estoque_minimo - p.estoque_atual, 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.estoque_atual === 0 ? (
                          <Badge variant="destructive" className="text-[10px]">Zerado</Badge>
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                        <div>
                          <p className="font-medium">{p.nome}</p>
                          {p.marca && <p className="text-xs text-muted-foreground">{p.marca}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.categoria}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.estoque_atual}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.estoque_minimo}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-red-600">
                      {faltam || '—'}
                    </TableCell>
                    {podeRepor && (
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => abrirReposicao(p)}>
                          <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                          Repor
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!repondo} onOpenChange={(open) => !open && setRepondo(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Repor estoque</DialogTitle>
            <DialogDescription>
              {repondo?.nome} — atualmente {repondo?.estoque_atual} unidade(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="qtd-repor">Quantidade a adicionar</Label>
            <Input
              id="qtd-repor"
              type="number"
              min={1}
              value={quantidadeRepor}
              onChange={(e) => setQuantidadeRepor(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepondo(null)}>Cancelar</Button>
            <Button onClick={confirmarReposicao} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Confirmar reposição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
