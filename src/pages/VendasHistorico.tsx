import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { moeda, dataHora } from '@/lib/format';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FiltrosVenda } from '@/components/vendas/FiltrosVenda';
import {
  FILTROS_VENDA_VAZIO,
  aplicarFiltrosVenda,
  type FiltrosVendaValores,
} from '@/lib/filtrosVenda';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * Histórico de Vendas — diferente do Relatório de Vendas (que é uma
 * fotografia com totais e exportação CSV): aqui é pra achar UMA venda
 * específica e ver o que tinha dentro dela (produtos e pagamentos), tipo
 * "essa venda de ontem, o que o cliente levou mesmo?".
 */

interface Venda {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  total: number;
  /** NULL em toda venda comum (usa `total`). Só a venda nova de uma troca
   *  preenche — quanto entrou de dinheiro novo de verdade, pra não contar
   *  o produto trocado duas vezes no faturamento. Ver TrocaDevolucao.tsx. */
  valor_faturamento_real: number | null;
  vendedor_id: string | null;
  subtotal: number | null;
  descontos: number | null;
  clientes: { nome: string; telefone: string | null; cpf_cnpj: string | null } | null;
  vendedor: { nome: string } | null;
  /** Só o necessário para os filtros de produto e número de série. O detalhe
   *  completo dos itens continua sendo buscado ao abrir a venda. */
  itens_venda: { produtos: { nome: string; imei_serial: string | null } | null }[] | null;
  pagamentos_venda: { forma: string | null }[] | null;
  /** Devoluções desta venda. Vem presa à linha, e não somada por período,
   *  porque esta tela filtra no cliente por critério livre — assim o
   *  desconto acompanha qualquer filtro que o usuário aplicar. */
  devolucoes: { valor_devolvido_cliente: number | null }[] | null;
}

interface ItemVenda {
  id: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number | null;
  total: number;
  produtos: {
    nome: string;
    imei_serial: string | null;
    marca: string | null;
    modelo: string | null;
    categoria: string | null;
    cor: { descricao: string } | null;
    memoria: { descricao: string } | null;
  } | null;
}

interface PagamentoVenda {
  id: string;
  forma: keyof typeof FORMAS_PAGAMENTO;
  valor: number;
  parcelas: number;
  created_at: string;
  /** Nome cadastrado da forma ("Cartão Crédito - Taxa"), quando existe. O
   *  campo `forma` é o tipo amplo; este é o que a loja escolheu. */
  formas_pagamento: { descricao: string } | null;
}

/** Aparelho que o cliente entregou como parte do pagamento. */
interface EntradaTroca {
  id: string;
  valor_entrada: number;
  observacoes: string | null;
  created_at: string;
  produtos: { nome: string; imei_serial: string | null; preco: number | null } | null;
}

/** Uma mudança de status depois de criada (ex.: cancelamento). A maioria das
 *  vendas nasce "pago" e nunca muda, então fica sem nenhuma linha aqui — a
 *  hora de criação vem de `Venda.created_at`/`vendedor_id`, não daqui. */
interface HistoricoStatusVenda {
  id: string;
  usuario_id: string | null;
  status_anterior: string | null;
  status_novo: string;
  created_at: string;
}

interface DevolucaoDetalhe {
  id: string;
  numero_devolucao: string | null;
  usuario_id: string | null;
  motivo: string | null;
  valor_devolvido_cliente: number;
  valor_cliente_pagou_a_mais: number;
  created_at: string;
}

/** Um evento na linha do tempo da venda, já normalizado — cada fonte
 *  (criação, mudança de status, devolução) vira um item deste tipo antes de
 *  entrar na lista ordenada por hora. */
interface EventoLinhaDoTempo {
  id: string;
  created_at: string;
  usuario_id: string | null;
  descricao: string;
  statusAnterior?: string | null;
  statusNovo?: string | null;
}

// Segue os tons de `lib/acoes.ts`: verde terminou bem, vermelho foi desfeito,
// azul está andando, cinza ainda não é nada.
const STATUS_COR: Record<string, string> = {
  pago: 'bg-emerald-500 text-white',
  faturado: 'bg-blue-500 text-white',
  rascunho: 'bg-slate-400 text-white',
  cancelado: 'bg-red-500 text-white',
};

export default function VendasHistorico() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState<FiltrosVendaValores>(FILTROS_VENDA_VAZIO);
  const [vendaAberta, setVendaAberta] = useState<Venda | null>(null);

  /**
   * O período vai para o BANCO, não para a memória.
   *
   * Achado em 18/08: a consulta trazia sempre as últimas 500 vendas e os
   * filtros de data eram aplicados só sobre essas 500 já carregadas. Passando
   * de 500 vendas no intervalo, as mais antigas do período sumiam **sem
   * aviso** — e a mesma pergunta ("quanto o vendedor X vendeu esse mês")
   * respondia diferente aqui e no Relatório de Vendas, que sempre filtrou no
   * banco. Número que muda conforme a tela destrói a confiança nos dois.
   *
   * Os outros filtros (vendedor, forma de pagamento, produto, texto) seguem
   * em memória de propósito: eles refinam DENTRO do período, e o período já
   * limita o volume.
   */
  const { data, isLoading } = useQuery({
    queryKey: ['vendas-historico', filtros.de, filtros.ate],
    queryFn: async (): Promise<Venda[]> => {
      let q = supabase
        .from('vendas')
        // Traz vendedor, itens e pagamentos junto: sao eles que os filtros de
        // produto, numero de serie e forma de pagamento consultam. Produto vem
        // por `vw_produtos` (regra de custo protegido), com apelido para o JSON
        // manter a chave `produtos`.
        .select(
          `id, numero_venda, created_at, status, total, valor_faturamento_real, vendedor_id,
           subtotal, descontos,
           clientes(nome, telefone, cpf_cnpj),
           vendedor:profiles!vendas_vendedor_id_fkey(nome),
           itens_venda(produtos:vw_produtos(nome, imei_serial)),
           pagamentos_venda(forma),
           devolucoes!venda_original_id(valor_devolvido_cliente)`
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (filtros.de) q = q.gte('created_at', filtros.de);
      // O `ate` é data pura; sem o T23:59:59 o último dia ficaria de fora —
      // mesma régua do Relatório de Vendas.
      if (filtros.ate) q = q.lte('created_at', `${filtros.ate}T23:59:59`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Venda[];
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ['profiles-ativos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      return data ?? [];
    },
  });

  // TODOS os perfis (não só ativo), pra resolver "quem" na linha do tempo —
  // mesmo raciocínio de OSDetalhe.tsx: um evento de meses atrás pode ter
  // sido feito por alguém que já saiu da loja, e o nome tem que continuar
  // aparecendo. `usuario_id` referencia `auth.users`, não `profiles`, então
  // não dá pra pedir o nome junto num embed do PostgREST.
  const { data: perfisTodos } = useQuery({
    queryKey: ['profiles-todos'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome');
      return data ?? [];
    },
  });
  const nomeUsuario = (usuarioId: string | null) =>
    (usuarioId && (perfisTodos ?? []).find((p) => p.id === usuarioId)?.nome) || '—';

  const { data: detalhe, isLoading: carregandoDetalhe } = useQuery({
    queryKey: ['venda-detalhe', vendaAberta?.id],
    queryFn: async (): Promise<{
      itens: ItemVenda[];
      pagamentos: PagamentoVenda[];
      historicoStatus: HistoricoStatusVenda[];
      devolucoesDetalhe: DevolucaoDetalhe[];
      entradas: EntradaTroca[];
    }> => {
      const [itensRes, pagamentosRes, historicoRes, devolucoesRes, entradasRes] =
        await Promise.all([
        supabase
          .from('itens_venda')
          // Numa linha so: o TypeScript le este texto literalmente. Cor e
          // memoria sao itens de catalogo, por isso o join; marca e modelo
          // ja vem como texto na view.
          .select('id, quantidade, preco_unitario, desconto, total, produtos:vw_produtos(nome, imei_serial, marca, modelo, categoria, cor:catalogos!produtos_cor_id_fkey(descricao), memoria:catalogos!produtos_memoria_id_fkey(descricao))')
          .eq('venda_id', vendaAberta!.id),
        supabase
          .from('pagamentos_venda')
          .select('id, forma, valor, parcelas, created_at, formas_pagamento(descricao)')
          .eq('venda_id', vendaAberta!.id),
        supabase
          .from('venda_status_historico')
          .select('id, usuario_id, status_anterior, status_novo, created_at')
          .eq('venda_id', vendaAberta!.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('devolucoes')
          .select('id, numero_devolucao, usuario_id, motivo, valor_devolvido_cliente, valor_cliente_pagou_a_mais, created_at')
          .eq('venda_original_id', vendaAberta!.id)
          .order('created_at', { ascending: true }),
        // Aparelho recebido como parte do pagamento. Nao aparecia na ficha em
        // lugar nenhum -- so o valor entrava, somado aos pagamentos, sem
        // dizer O QUE a loja recebeu em troca.
        supabase
          .from('entradas_produto')
          .select('id, valor_entrada, observacoes, created_at, produtos:vw_produtos(nome, imei_serial, preco)')
          .eq('venda_id', vendaAberta!.id)
          .order('created_at', { ascending: true }),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (pagamentosRes.error) throw pagamentosRes.error;
      if (historicoRes.error) throw historicoRes.error;
      if (devolucoesRes.error) throw devolucoesRes.error;
      if (entradasRes.error) throw entradasRes.error;
      return {
        itens: (itensRes.data ?? []) as unknown as ItemVenda[],
        pagamentos: (pagamentosRes.data ?? []) as unknown as PagamentoVenda[],
        historicoStatus: (historicoRes.data ?? []) as unknown as HistoricoStatusVenda[],
        devolucoesDetalhe: (devolucoesRes.data ?? []) as unknown as DevolucaoDetalhe[],
        entradas: (entradasRes.data ?? []) as unknown as EntradaTroca[],
      };
    },
    enabled: !!vendaAberta,
  });

  // Somas que a ficha mostra separadas do total. Ficam aqui, e não dentro do
  // JSX, para o cálculo não repetir a cada redesenho da tela.
  const totalEntradas = (detalhe?.entradas ?? []).reduce(
    (soma, e) => soma + Number(e.valor_entrada ?? 0),
    0,
  );
  // Nome comprido de propósito: já existe um `totalDevolvido` nesta tela, que
  // soma TODAS as vendas do filtro para o rodapé. Este é só o da venda aberta.
  const devolvidoDestaVenda = (detalhe?.devolucoesDetalhe ?? []).reduce(
    (soma, d) => soma + Number(d.valor_devolvido_cliente ?? 0),
    0,
  );

  // Junta as três fontes (criação, mudança de status, devolução) numa lista
  // só, em ordem de hora — é a "linha do tempo" que o Felipe pediu (22/08)
  // pra não precisar caçar em Logs/Auditoria quem fez o quê e quando.
  const linhaDoTempo: EventoLinhaDoTempo[] = vendaAberta
    ? [
        {
          id: 'criacao',
          created_at: vendaAberta.created_at,
          usuario_id: vendaAberta.vendedor_id,
          descricao: 'Venda criada',
        },
        ...((detalhe?.historicoStatus ?? []).map((h) => ({
          id: h.id,
          created_at: h.created_at,
          usuario_id: h.usuario_id,
          descricao: 'Mudança de status',
          statusAnterior: h.status_anterior,
          statusNovo: h.status_novo,
        }))),
        ...((detalhe?.devolucoesDetalhe ?? []).map((d) => ({
          id: d.id,
          created_at: d.created_at,
          usuario_id: d.usuario_id,
          descricao:
            d.valor_devolvido_cliente > 0
              ? `Devolução ${d.numero_devolucao ?? ''} — devolveu ${moeda(d.valor_devolvido_cliente)} ao cliente${d.motivo ? ` (${d.motivo})` : ''}`
              : d.valor_cliente_pagou_a_mais > 0
                ? `Troca ${d.numero_devolucao ?? ''} — cliente pagou ${moeda(d.valor_cliente_pagou_a_mais)} a mais${d.motivo ? ` (${d.motivo})` : ''}`
                : `Troca ${d.numero_devolucao ?? ''} sem diferença a acertar${d.motivo ? ` (${d.motivo})` : ''}`,
        }))),
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];

  const vendas = data ?? [];
  // Bateu exatamente no teto: quase certo que há mais fora da lista.
  const atingiuOLimite = vendas.length === 500;
  const filtradas = aplicarFiltrosVenda(vendas, filtros);

  const validas = filtradas.filter((v) => v.status !== 'cancelado');
  // COALESCE, não `total` sozinho: a venda nova de uma troca grava o preço
  // cheio do produto em `total` (pra não perder a contagem de vendas por
  // produto), mas só `valor_faturamento_real` reflete o dinheiro novo de
  // verdade — ver TrocaDevolucao.tsx.
  //
  // Achado em 18/08, resolvido em 21/08: o rodapé não descontava devolução.
  // O desconto por período usado nos painéis não servia aqui, porque esta
  // tela filtra no cliente por critério livre (vendedor, forma, texto) e não
  // dá pra casar uma devolução com um filtro arbitrário. A saída foi trazer
  // a devolução PRESA À LINHA da venda: aí ela acompanha qualquer filtro,
  // aparece na própria linha, e o total fecha com o que está na tela.
  const devolvidoDaVenda = (v: Venda) =>
    (v.devolucoes ?? []).reduce(
      (acc, d) => acc + Number(d.valor_devolvido_cliente ?? 0),
      0
    );

  const faturamento = validas.reduce(
    (acc, v) => acc + Number(v.valor_faturamento_real ?? v.total) - devolvidoDaVenda(v),
    0
  );
  const totalDevolvido = validas.reduce((acc, v) => acc + devolvidoDaVenda(v), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Histórico de Vendas"
        hint={
          filtros.de || filtros.ate
            ? 'Vendas do período escolhido. Clique numa linha para ver os produtos e pagamentos daquela venda.'
            : 'Últimas 500 vendas. Use o filtro de período para ver um intervalo específico. Clique numa linha para ver os produtos e pagamentos daquela venda.'
        }
      />

      {/*
        O limite de 500 continua existindo — o que mudou é que agora ele se
        aplica DENTRO do período pedido, não sobre "as últimas 500 de todas".
        Quando bate no teto, a tela precisa dizer: um total que parece completo
        e não está é pior do que um total assumidamente parcial.
      */}
      {atingiuOLimite && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-800">
            Esta lista mostra <strong>as 500 vendas mais recentes</strong> do
            período escolhido, e existem mais. Os totais abaixo contam só o que
            está na lista — para o número fechado do mês, use o{' '}
            <strong>Relatório de Vendas</strong>, que soma direto no banco.
            Reduzir o período também resolve.
          </p>
        </div>
      )}

      <FiltrosVenda
        valores={filtros}
        onChange={setFiltros}
        vendedores={vendedores ?? []}
        resultados={filtradas.length}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Vendas listadas" valor={String(filtradas.length)} />
        <Indicador
          rotulo="Faturamento"
          valor={moeda(faturamento)}
          tom="positivo"
          detalhe={
            totalDevolvido > 0
              ? `Sem canceladas, menos ${moeda(totalDevolvido)} devolvido`
              : 'Sem contar canceladas'
          }
        />
        <Indicador
          rotulo="Ticket médio"
          valor={moeda(validas.length ? faturamento / validas.length : 0)}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <Vazio titulo="Nenhuma venda encontrada" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer"
                  onClick={() => setVendaAberta(v)}
                >
                  <TableCell className="font-medium">{v.numero_venda ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{dataHora(v.created_at)}</TableCell>
                  <TableCell>{v.clientes?.nome ?? 'Consumidor final'}</TableCell>
                  {/* Agora que dá para filtrar por vendedor, o nome precisa
                      estar visível: filtrar por algo que a lista não mostra
                      obriga a confiar no filtro sem poder conferir. */}
                  <TableCell className="text-muted-foreground">
                    {v.vendedor?.nome ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COR[v.status] ?? ''} border-0 capitalize`}>
                      {v.status}
                    </Badge>
                    {/* Venda com devolução fica marcada na própria linha: sem
                        isso, o total do rodapé (que agora desconta) não batia
                        com a soma que a pessoa faz de cabeça olhando a
                        coluna, e parecia erro de conta. */}
                    {devolvidoDaVenda(v) > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 border border-amber-500 bg-amber-500/10 text-amber-700"
                      >
                        Devolvida
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {moeda(Number(v.total))}
                    {devolvidoDaVenda(v) > 0 && (
                      <span className="block text-xs font-normal text-amber-700">
                        −{moeda(devolvidoDaVenda(v))} devolvido
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Pedido do Felipe (10/08): sempre ter um botão
                        Imprimir na gestão de vendas, igual ao sistema
                        antigo. stopPropagation pra não abrir também o
                        Dialog de detalhe da linha (o clique nele já navega
                        pra outro lugar). */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Imprimir comprovante"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/vendas/${v.id}/comprovante`);
                      }}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!vendaAberta} onOpenChange={(open) => !open && setVendaAberta(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Venda {vendaAberta?.numero_venda}</DialogTitle>
          </DialogHeader>
          {carregandoDetalhe ? (
            <div className="py-8 text-center text-muted-foreground">Carregando…</div>
          ) : (
            <div className="space-y-5">
              {/* Quem, quando, por quanto. Antes era preciso abrir o cadastro
                  do cliente para ver um telefone — no meio de um atendimento
                  em que a pergunta costuma ser "liga pra ele". */}
              <div className="grid gap-x-6 gap-y-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
                <Campo rotulo="Cliente" valor={vendaAberta?.clientes?.nome ?? '—'} />
                <Campo rotulo="Vendedor" valor={vendaAberta?.vendedor?.nome ?? '—'} />
                <Campo rotulo="Telefone" valor={vendaAberta?.clientes?.telefone || '—'} />
                <Campo rotulo="CPF/CNPJ" valor={vendaAberta?.clientes?.cpf_cnpj || 'Não informado'} />
                <Campo rotulo="Data" valor={vendaAberta ? dataHora(vendaAberta.created_at) : '—'} />
                <Campo rotulo="Situação" valor={vendaAberta?.status ?? '—'} />
              </div>

              {/* Os valores separados. O total sozinho esconde o que aconteceu:
                  desconto dado, aparelho aceito na troca, dinheiro devolvido. */}
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium text-muted-foreground">Valores</p>
                <div className="space-y-1 text-sm">
                  {Number(vendaAberta?.subtotal ?? 0) > 0 && (
                    <Linha rotulo="Subtotal" valor={moeda(Number(vendaAberta?.subtotal))} />
                  )}
                  {Number(vendaAberta?.descontos ?? 0) > 0 && (
                    <Linha
                      rotulo="Desconto"
                      valor={`- ${moeda(Number(vendaAberta?.descontos))}`}
                      classe="text-destructive"
                    />
                  )}
                  {totalEntradas > 0 && (
                    <Linha rotulo="Recebido em troca" valor={moeda(totalEntradas)} />
                  )}
                  {devolvidoDestaVenda > 0 && (
                    <Linha
                      rotulo="Devolvido ao cliente"
                      valor={`- ${moeda(devolvidoDestaVenda)}`}
                      classe="text-destructive"
                    />
                  )}
                  <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
                    <span>Total da venda</span>
                    <span>{moeda(Number(vendaAberta?.total ?? 0))}</span>
                  </div>
                </div>
              </div>

              {/* Produtos, com o que identifica o aparelho. Sem IMEI e número
                  de série, não dá para saber QUAL unidade foi vendida quando
                  o cliente volta com defeito. */}
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Produtos</p>
                <div className="space-y-2">
                  {detalhe?.itens.map((item) => {
                    const p = item.produtos;
                    const detalhes = [
                      p?.marca,
                      p?.modelo,
                      p?.cor?.descricao,
                      p?.memoria?.descricao,
                    ].filter(Boolean);
                    return (
                      <div key={item.id} className="rounded-md border p-2.5">
                        <div className="flex justify-between gap-3">
                          <span className="text-sm font-medium">
                            {item.quantidade}× {p?.nome ?? '—'}
                          </span>
                          <span className="whitespace-nowrap text-sm font-medium">
                            {moeda(Number(item.total))}
                          </span>
                        </div>
                        {detalhes.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {detalhes.join(' · ')}
                          </p>
                        )}
                        {p?.imei_serial && (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            IMEI/Série: {p.imei_serial}
                          </p>
                        )}
                        {Number(item.desconto ?? 0) > 0 && (
                          <p className="mt-0.5 text-xs text-destructive">
                            Desconto de {moeda(Number(item.desconto))} nesta linha
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {!detalhe?.itens.length && (
                    <p className="text-sm text-muted-foreground">Nenhum item.</p>
                  )}
                </div>
              </div>

              {/* Aparelho recebido como parte do pagamento. Não aparecia em
                  lugar nenhum da ficha: só o valor entrava, somado aos
                  pagamentos, sem dizer O QUE a loja levou em troca. */}
              {(detalhe?.entradas?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                    Recebido em troca
                  </p>
                  <div className="space-y-2">
                    {detalhe?.entradas.map((e) => (
                      <div key={e.id} className="rounded-md border p-2.5">
                        <div className="flex justify-between gap-3">
                          <span className="text-sm font-medium">{e.produtos?.nome ?? '—'}</span>
                          <span className="whitespace-nowrap text-sm font-medium">
                            {moeda(Number(e.valor_entrada))}
                          </span>
                        </div>
                        {e.produtos?.imei_serial && (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            IMEI/Série: {e.produtos.imei_serial}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {Number(e.produtos?.preco ?? 0) > 0
                            ? `Para revender por ${moeda(Number(e.produtos?.preco))}`
                            : 'Sem preço de revenda definido — está esperando revisão'}
                        </p>
                        {e.observacoes && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{e.observacoes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pagamentos, com a hora de cada lançamento: numa venda paga em
                  duas formas, é o que mostra em que ordem entraram. */}
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Pagamentos</p>
                <div className="space-y-1.5">
                  {detalhe?.pagamentos.map((pg) => (
                    <div key={pg.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
                      <span>
                        {pg.formas_pagamento?.descricao ??
                          FORMAS_PAGAMENTO[pg.forma]?.label ??
                          pg.forma}
                        {pg.parcelas > 1 && (
                          <span className="text-muted-foreground">
                            {' '}
                            — {pg.parcelas}x de {moeda(Number(pg.valor) / pg.parcelas)}
                          </span>
                        )}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {dataHora(pg.created_at)}
                        </span>
                      </span>
                      <span className="font-medium">{moeda(Number(pg.valor))}</span>
                    </div>
                  ))}
                  {!detalhe?.pagamentos.length && (
                    <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                  )}
                </div>
              </div>

              {/* Linha do tempo — hora de criação, cada mudança de status e
                  cada devolução, com quem fez. Pedido do Felipe em 22/08:
                  sem isso, essa informação só aparecia (misturada com o
                  resto do sistema) em Logs/Auditoria. */}
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Linha do tempo</p>
                <div className="space-y-2.5">
                  {linhaDoTempo.map((ev) => (
                    <div key={ev.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="whitespace-nowrap text-muted-foreground">
                        {dataHora(ev.created_at)}
                      </span>
                      {ev.statusNovo ? (
                        <>
                          {ev.statusAnterior && (
                            <>
                              <Badge className={`${STATUS_COR[ev.statusAnterior] ?? ''} border-0 capitalize`}>
                                {ev.statusAnterior}
                              </Badge>
                              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </>
                          )}
                          <Badge className={`${STATUS_COR[ev.statusNovo] ?? ''} border-0 capitalize`}>
                            {ev.statusNovo}
                          </Badge>
                        </>
                      ) : (
                        <span>{ev.descricao}</span>
                      )}
                      <span className="text-muted-foreground">— {nomeUsuario(ev.usuario_id)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Rótulo em cima, valor embaixo — o formato do cabeçalho da ficha. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="font-medium">{valor}</p>
    </div>
  );
}

/** Linha de valor: nome à esquerda, dinheiro à direita. */
function Linha({
  rotulo,
  valor,
  classe = '',
}: {
  rotulo: string;
  valor: string;
  classe?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={classe}>{valor}</span>
    </div>
  );
}
