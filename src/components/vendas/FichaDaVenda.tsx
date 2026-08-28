import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { moeda, dataHora } from '@/lib/format';
import { FORMAS_PAGAMENTO } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * A ficha de uma venda — tudo que o balcão precisa saber sobre ela.
 *
 * Nasceu dentro do Histórico de Vendas e virou componente em 28/08, a pedido
 * do Felipe: *"quando eu clico na OV0006 abre todas as informações, porém em
 * outros canais eu não consigo ter essas informações"*. Ele estava certo — a
 * mesma venda aparece em Pagamentos e no Relatório de Vendas, e nas duas era
 * uma linha morta.
 *
 * A decisão que faz a diferença: esta ficha recebe **só o id** e busca o resto
 * sozinha. A versão anterior aproveitava o que a lista do Histórico já tinha
 * carregado (telefone, CPF, vendedor, subtotal), e por isso não servia para
 * mais ninguém: cada tela nova teria que ampliar a própria consulta e lembrar
 * de manter igual à do Histórico. Uma consulta a mais ao abrir custa pouco;
 * quatro consultas parecidas espalhadas custam caro todo mês.
 */

interface Venda {
  id: string;
  numero_venda: string | null;
  created_at: string;
  status: string;
  total: number | null;
  subtotal: number | null;
  descontos: number | null;
  vendedor_id: string | null;
  clientes: { nome: string; telefones: string[] | null; cpf_cnpj: string | null } | null;
  vendedor: { nome: string } | null;
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

/** Um evento na linha do tempo, já normalizado — cada fonte (criação, mudança
 *  de status, devolução) vira um item deste tipo antes de entrar na lista
 *  ordenada por hora. */
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

interface Props {
  /** Venda a mostrar. `null` mantém a ficha fechada e não consulta nada. */
  vendaId: string | null;
  aoFechar: () => void;
}

export function FichaDaVenda({ vendaId, aoFechar }: Props) {
  const { data: venda, isLoading: carregandoVenda } = useQuery({
    queryKey: ['venda-ficha', vendaId],
    queryFn: async (): Promise<Venda | null> => {
      const { data, error } = await supabase
        .from('vendas')
        .select(
          `id, numero_venda, created_at, status, total, subtotal, descontos, vendedor_id,
           clientes(nome, telefones, cpf_cnpj),
           vendedor:profiles!vendas_vendedor_id_fkey(nome)`
        )
        .eq('id', vendaId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Venda | null;
    },
    enabled: !!vendaId,
  });

  // Nome de quem fez cada evento. `usuario_id` referencia `auth.users`, não
  // `profiles`, então não dá pra pedir o nome junto num embed do PostgREST.
  // Traz todos, inclusive inativos: quem já saiu da loja precisa continuar
  // aparecendo no histórico.
  const { data: perfisTodos } = useQuery({
    queryKey: ['profiles-todos'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome');
      return data ?? [];
    },
    enabled: !!vendaId,
  });
  const nomeUsuario = (usuarioId: string | null) =>
    (usuarioId && (perfisTodos ?? []).find((p) => p.id === usuarioId)?.nome) || '—';

  const { data: detalhe, isLoading: carregandoDetalhe } = useQuery({
    queryKey: ['venda-detalhe', vendaId],
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
          .eq('venda_id', vendaId!),
        supabase
          .from('pagamentos_venda')
          .select('id, forma, valor, parcelas, created_at, formas_pagamento(descricao)')
          .eq('venda_id', vendaId!),
        supabase
          .from('venda_status_historico')
          .select('id, usuario_id, status_anterior, status_novo, created_at')
          .eq('venda_id', vendaId!)
          .order('created_at', { ascending: true }),
        supabase
          .from('devolucoes')
          .select('id, numero_devolucao, usuario_id, motivo, valor_devolvido_cliente, valor_cliente_pagou_a_mais, created_at')
          .eq('venda_original_id', vendaId!)
          .order('created_at', { ascending: true }),
        // Aparelho recebido como parte do pagamento. Nao aparecia na ficha em
        // lugar nenhum -- so o valor entrava, somado aos pagamentos, sem
        // dizer O QUE a loja recebeu em troca.
        supabase
          .from('entradas_produto')
          .select('id, valor_entrada, observacoes, created_at, produtos:vw_produtos(nome, imei_serial, preco)')
          .eq('venda_id', vendaId!)
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
    enabled: !!vendaId,
  });

  // Somas que a ficha mostra separadas do total. Ficam aqui, e não dentro do
  // JSX, para o cálculo não repetir a cada redesenho da tela.
  const totalEntradas = (detalhe?.entradas ?? []).reduce(
    (soma, e) => soma + Number(e.valor_entrada ?? 0),
    0,
  );
  const devolvidoDestaVenda = (detalhe?.devolucoesDetalhe ?? []).reduce(
    (soma, d) => soma + Number(d.valor_devolvido_cliente ?? 0),
    0,
  );

  // Junta as três fontes (criação, mudança de status, devolução) numa lista
  // só, em ordem de hora — é a "linha do tempo" que o Felipe pediu (22/08)
  // pra não precisar caçar em Logs/Auditoria quem fez o quê e quando.
  const linhaDoTempo: EventoLinhaDoTempo[] = venda
    ? [
        {
          id: 'criacao',
          created_at: venda.created_at,
          usuario_id: venda.vendedor_id,
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

  const carregando = carregandoVenda || carregandoDetalhe;

  /**
   * Fechar a ficha zera o id, e sem id não há nada guardado sob a etiqueta da
   * consulta — os dados somem no mesmo instante. Só que a janela ainda leva
   * 200 milésimos desaparecendo, e nesse tempo ela continua desenhada: sem
   * este cuidado, TODA vez que alguém fechava a ficha piscava um "Esta venda
   * não foi encontrada" no lugar do conteúdo. Erro que aparece quando nada
   * deu errado é pior que informação nenhuma — a loja liga achando que perdeu
   * a venda.
   *
   * Enquanto está fechando, mantém o último conteúdo desenhado.
   */
  // Guarda o número da última venda aberta só para o título não piscar
  // enquanto a janela desaparece.
  const ultimoNumero = useRef<string | null>(null);
  useEffect(() => {
    if (venda?.numero_venda) ultimoNumero.current = venda.numero_venda;
  }, [venda?.numero_venda]);
  const numeroConhecido = ultimoNumero.current;

  const fechando = !vendaId;
  const naoEncontrada = !carregando && !venda && !fechando;

  return (
    <Dialog open={!!vendaId} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          {/* O número fica no título mesmo enquanto carrega e enquanto a
              janela fecha: título que muda de "Venda OV0006" para "Venda"
              chama atenção para o lugar errado. */}
          <DialogTitle>Venda {venda?.numero_venda ?? numeroConhecido ?? ''}</DialogTitle>
        </DialogHeader>
        {carregando ? (
          <div className="py-8 text-center text-muted-foreground">Carregando…</div>
        ) : naoEncontrada ? (
          // Some do banco entre a lista carregar e o clique acontecer é raro,
          // mas dizer isso é melhor que uma ficha vazia com todos os campos
          // em tracinho — que parece defeito.
          <div className="py-8 text-center text-muted-foreground">
            Esta venda não foi encontrada. Atualize a tela (F5) e tente de novo.
          </div>
        ) : (
          venda && (
          <div className="space-y-5">
            {/* Quem, quando, por quanto. Antes era preciso abrir o cadastro
                do cliente para ver um telefone — no meio de um atendimento
                em que a pergunta costuma ser "liga pra ele". */}
            <div className="grid gap-x-6 gap-y-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
              <Campo rotulo="Cliente" valor={venda.clientes?.nome ?? '—'} />
              <Campo rotulo="Vendedor" valor={venda.vendedor?.nome ?? '—'} />
              <Campo
                rotulo="Telefone"
                valor={venda.clientes?.telefones?.filter(Boolean).join(' · ') || '—'}
              />
              <Campo rotulo="CPF/CNPJ" valor={venda.clientes?.cpf_cnpj || 'Não informado'} />
              <Campo rotulo="Data" valor={dataHora(venda.created_at)} />
              <Campo rotulo="Situação" valor={venda.status ?? '—'} />
            </div>

            {/* Os valores separados. O total sozinho esconde o que aconteceu:
                desconto dado, aparelho aceito na troca, dinheiro devolvido. */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Valores</p>
              <div className="space-y-1 text-sm">
                {Number(venda.subtotal ?? 0) > 0 && (
                  <Linha rotulo="Subtotal" valor={moeda(Number(venda.subtotal))} />
                )}
                {Number(venda.descontos ?? 0) > 0 && (
                  <Linha
                    rotulo="Desconto"
                    valor={`- ${moeda(Number(venda.descontos))}`}
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
                  <span>{moeda(Number(venda.total ?? 0))}</span>
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
          )
        )}
      </DialogContent>
    </Dialog>
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
