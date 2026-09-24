import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { DialogNovaEntrada } from '@/components/produtos/DialogNovaEntrada';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { supabase } from '@/integrations/supabase/client';
import { moeda, data as formatarData } from '@/lib/format';

/**
 * Entrada de Mercadoria do Fornecedor.
 *
 * Desenhada em cima de como a loja recebe de verdade (respostas do Felipe em
 * 23/08), e cada escolha aqui vem de uma delas:
 *
 *   • A NOTA FISCAL É OPCIONAL. "Somente produto" chega na caixa — a nota vem
 *     dias depois. Exigir o número travaria quem está com a mercadoria na
 *     frente, esperando um papel que ainda não existe.
 *   • DIVERGÊNCIA NÃO BLOQUEIA. Quando vem a menos, trocado ou quebrado, quem
 *     recebe marca e o registro sinaliza para o setor de compras apurar. A
 *     mercadoria já está fisicamente na loja: segurar a entrada só faria o
 *     sistema mentir sobre o que tem na prateleira.
 *   • O CUSTO VIRA MÉDIA, não o último preço pago. A tela mostra o custo atual
 *     e o que ele vai virar, antes de salvar — porque isso muda a margem de
 *     tudo que já estava na prateleira, não só do que chegou.
 *
 * O formulário da entrada mora em `components/produtos/DialogNovaEntrada.tsx`
 * desde 24/09, porque o botão "Repor" do Estoque Crítico abre o mesmo.
 */

export default function EntradaMercadoria() {
  const { can } = useAuth();
  const podeLancar = can(PERMISSIONS.INVENTORY_ADJUST);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  const [abrindo, setAbrindo] = useState(false);

  const entradas = useQuery({
    queryKey: ['entradas-mercadoria'],
    enabled: podeLancar && veCusto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entradas_mercadoria')
        // Em uma linha só de propósito: o TypeScript descobre o formato do
        // resultado lendo este texto literalmente. Partido com `+`, ele desiste
        // e o retorno vira "erro genérico" — que compila mal e esconde engano
        // de nome de coluna.
        .select('id, numero, numero_nota, data_entrada, total, tem_divergencia, fornecedores(nome), entradas_mercadoria_itens(id)')
        .order('data_entrada', { ascending: false })
        .order('numero', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // A regra da tela e a regra do banco são a MESMA: dar entrada exige lançar
  // movimentação E ver custo, porque o preço de compra é digitado aqui. Dizer
  // isso em voz alta evita o modo de falha que já mordeu quatro telas deste
  // sistema — a tela abre, a lista vem vazia, e parece "não tem nada".
  if (!podeLancar || !veCusto) {
    const falta = !podeLancar
      ? 'lançar movimentação de estoque'
      : 'ver custo e margem dos produtos';
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          titulo="Entrada de Mercadoria"
          hint="Recebimento de produto do fornecedor."
        />
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex gap-3 py-5">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium">Esta tela não está liberada para o seu perfil.</p>
              <p className="mt-1 text-muted-foreground">
                Falta a permissão de <strong>{falta}</strong>. Dar entrada mexe no
                preço de compra dos produtos, então o sistema exige as duas
                permissões juntas — não adianta liberar uma só.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Entrada de Mercadoria"
        hint="Chegou produto do fornecedor? Dá entrada aqui: soma o estoque, atualiza o custo e lança a compra no financeiro."
        acoes={
          <Button onClick={() => setAbrindo(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova entrada
          </Button>
        }
      />

      {entradas.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (entradas.data ?? []).length === 0 ? (
        <Vazio titulo="Nenhuma entrada registrada ainda" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Nota fiscal</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(entradas.data ?? []).map((e) => {
                  const fornecedor = e.fornecedores as { nome: string } | null;
                  const itens = (e.entradas_mercadoria_itens ?? []) as { id: string }[];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-sm">
                        {e.numero}
                        {e.tem_divergencia && (
                          <Badge
                            variant="secondary"
                            className="ml-2 bg-amber-500/10 text-amber-700"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            divergência
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatarData(e.data_entrada)}</TableCell>
                      <TableCell>{fornecedor?.nome ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.numero_nota ?? 'ainda não chegou'}
                      </TableCell>
                      <TableCell className="text-right">{itens.length}</TableCell>
                      <TableCell className="text-right font-medium">
                        {moeda(Number(e.total))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {abrindo && <DialogNovaEntrada onFechar={() => setAbrindo(false)} />}
    </div>
  );
}
