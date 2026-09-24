import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { estoqueCritico } from '@/lib/estoque';
import { buscarEmPaginas } from '@/lib/buscarEmPaginas';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader, Indicador } from '@/components/PageHeader';
import { DialogNovaEntrada } from '@/components/produtos/DialogNovaEntrada';
import { moeda } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * Estoque Crítico — o alerta de reposição.
 *
 * Cada produto tem seu próprio `estoque_minimo` (não é um número fixo pra
 * todo mundo): esta tela lista quem está NO mínimo ou abaixo dele, do mais
 * urgente pro menos urgente, com um jeito rápido de repor sem precisar abrir
 * o cadastro completo do produto. Produto com mínimo 0 (peça única, como
 * seminovo e troca) não entra — ver `lib/estoque.ts`.
 *
 * O "Repor" abre a ENTRADA DE MERCADORIA já com o produto e a quantidade que
 * falta (revisão de 24/09). Antes ele fazia um ajuste manual por fora: somava
 * o número, mas não pedia fornecedor nem preço pago, não recalculava o custo e
 * não lançava a compra no financeiro. Como o botão estava mais à mão que a
 * Entrada, a compra sumia do contas a pagar e o custo ficava parado. E somava
 * em cima do número carregado quando a tela abriu: uma venda no meio do
 * caminho "desvendia" a unidade. A Entrada soma no banco, sobre o saldo real.
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
  codigo_barra: string | null;
}

export default function EstoqueCritico() {
  const { can } = useAuth();
  // Repor = dar entrada de mercadoria, que exige as mesmas duas permissões
  // que o banco exige em `registrar_entrada_mercadoria`: movimentar estoque E
  // ver custo (o preço de compra é digitado ali).
  const podeRepor =
    can(PERMISSIONS.INVENTORY_ADJUST) && can(PERMISSIONS.INVENTORY_COST_VIEW);

  const [repondo, setRepondo] = useState<Produto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['estoque-critico'],
    // Em páginas: a API do banco corta calada em 1.000 linhas, e o crítico
    // passaria a ser contado sobre uma parte qualquer do catálogo
    // (lib/buscarEmPaginas.ts).
    queryFn: () =>
      buscarEmPaginas<Produto>(() =>
        supabase
          .from('vw_produtos')
          .select('id, nome, marca, categoria, codigo_barra, estoque_atual, estoque_minimo, custo, preco')
          .eq('ativo', true)
          .order('id'),
      ),
  });

  const criticos = (data ?? [])
    .filter(estoqueCritico)
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
  // Achado em 11/08, resgatado em 20/08: isto decidia pelo VALOR calculado
  // (`custoReposicao > 0`), não pela permissão — apesar do nome sugerir o
  // contrário. Funcionava por acidente (quem não tem a permissão recebe
  // custo nulo da view, a soma dá 0 e o rótulo troca), mas errava no caso
  // legítimo: quem TEM a permissão e ainda não cadastrou o preço de compra
  // dos produtos em alerta via "Valor em venda" no lugar de "Custo para
  // repor tudo" — etiqueta errada pra pessoa certa. Agora pergunta a
  // permissão direto, como RelatorioEstoque.tsx já fazia.
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Estoque Crítico"
        hint="Produtos no ou abaixo do estoque mínimo — cada um tem seu próprio limite de reposição, configurado na ficha do produto. Peça única (seminovo, troca) com mínimo 0 não aparece aqui. O botão Repor abre a Entrada de Mercadoria, que soma o estoque e lança a compra no financeiro."
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
        {veCusto ? (
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
                        <Button size="sm" variant="outline" onClick={() => setRepondo(p)}>
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

      {repondo && (
        <DialogNovaEntrada
          onFechar={() => setRepondo(null)}
          itensIniciais={[
            {
              produto: {
                id: repondo.id,
                nome: repondo.nome,
                codigo_barra: repondo.codigo_barra,
                estoque_atual: repondo.estoque_atual,
                custo: repondo.custo ?? null,
              },
              // O que falta para chegar ao mínimo — no mínimo 1, porque
              // produto exatamente no mínimo também está aqui.
              quantidade: Math.max(repondo.estoque_minimo - repondo.estoque_atual, 1),
            },
          ]}
        />
      )}
    </div>
  );
}
