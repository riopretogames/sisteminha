import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock, Loader2, Plus, Save, Trash2, Wrench, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora, data as formatarData } from '@/lib/format';
import { OS_PRIORITY } from '@/lib/constants';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SenhaPadraoLeitura } from '@/components/os/SenhaPadrao';
import { TrocarEtapaOS } from '@/components/os/TrocarEtapaOS';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { OS_ETAPAS, OS_CANCELADO } from '@/config/osStatus';

/**
 * Detalhe de uma OS.
 *
 * As duas visões de OS (Kanban e tabela) já tentavam navegar pra
 * `/os/:id` — a rota simplesmente não existia (clicar num card caía em
 * "Página não encontrada"). Esta tela resolve isso e, junto, guarda o
 * "Valor do orçamento": até agora não havia NENHUM lugar pra editar esse
 * campo depois que a OS era criada, então ele sempre ficava zerado — e é
 * dele que a conta a receber (Passo 4) precisa pra existir de verdade.
 *
 * Passo 6: ganhou a seção "Peças e serviços" — o gatilho de baixa de
 * estoque por peça usada em OS (`baixar_estoque_ao_usar_em_os`, criado no
 * Passo 2) existia no banco desde 05/08 mas nenhuma tela criava esse tipo
 * de registro. Agora cria: escolher "Peça do estoque" insere com
 * `produto_id` preenchido (dispara a baixa automática e o rastro em
 * `movimentos_estoque`, motivo "Peça usada em OS"); escolher "Serviço
 * avulso" insere só com `descricao` livre (sem mexer em estoque), com
 * atalho opcional pra puxar preço/custo do catálogo de Serviços.
 *
 * Corte de escopo deliberado: item já lançado não tem edição — só
 * exclusão, e só de item SEM peça vinculada. Excluir um item de peça
 * reverteria a baixa de estoque sem deixar rastro — pra corrigir um
 * lançamento errado de peça, o caminho é o ajuste manual de estoque já
 * existente (auditado). Mesma permissão que já gateia o campo de
 * orçamento (`orders.edit`).
 *
 * ✅ 17/08 — as duas travas abaixo, que só existiam nesta tela, agora
 * também existem no banco (migration `20260817150000`), fechando o
 * mesmo tipo de furo que o resto do projeto já vinha fechando ("Opção
 * B"): a policy de DELETE em `service_order_items` recusa excluir item
 * com `produto_id` preenchido, e um gatilho novo recusa lançar
 * qualquer item (peça ou serviço) numa OS já entregue ou cancelada —
 * antes, só "entregue" tinha alguma barreira, e mesmo essa só existia
 * aqui (`jaFoiEntregue`/`osEncerrada`), nunca no banco.
 *
 * Diagnóstico técnico, constatação e demais campos do laudo completo
 * continuam fora desta versão.
 */

/**
 * Uma mudança de etapa, gravada sozinha pelo gatilho `track_os_status_change`
 * (existe desde a criação do schema) sempre que `service_orders.status`
 * muda — mas até 17/08 nenhuma tela lia esta tabela. `usuario_id` referencia
 * `auth.users`, não `public.profiles`, então não dá pra pedir o nome junto
 * num embed do PostgREST — resolvido à parte contra a lista de perfis.
 */
interface HistoricoOS {
  id: string;
  usuario_id: string | null;
  status_anterior: string | null;
  status_novo: string;
  created_at: string;
}

interface ItemOS {
  id: string;
  produto_id: string | null;
  descricao: string | null;
  quantidade: number | null;
  preco_cobrado: number;
  custo_unitario: number | null;
  horas_mao_obra: number | null;
  garantia_item_meses: number | null;
  produtos: { nome: string } | null;
}

interface ProdutoOpcao {
  id: string;
  nome: string;
  preco: number | null;
  custo: number | null;
  estoque_atual: number;
}

interface ServicoOpcao {
  id: string;
  nome: string;
  preco_referencia: number;
  custo_estimado: number;
  tempo_estimado_horas: number | null;
}

interface OSCompleta {
  id: string;
  numero_os: string;
  status: string;
  tipo: 'paga' | 'garantia' | 'cortesia';
  prioridade: keyof typeof OS_PRIORITY;
  marca: string | null;
  modelo: string | null;
  cor: string | null;
  memoria: string | null;
  numero_serie: string | null;
  defeito_cliente: string;
  observacoes: string | null;
  anotacoes_checkin: string | null;
  senha_aparelho: string | null;
  senha_padrao: string | null;
  prazo_previsto: string | null;
  garantia_dias: number | null;
  total_orcamento: number;
  valor_final_pago: number | null;
  data_finalizacao: string | null;
  created_at: string;
  clientes: { nome: string; telefones: string[] } | null;
  /** Marcações do check-in, com o item de catálogo que cada uma representa. */
  os_checklist: { catalogo_id: string; catalogos: { descricao: string; tipo: string } | null }[];
  // Laudo completo (padrão da casa, ver CLAUDE.md raiz — "Padrão de
  // atendimento"): 3 níveis de certeza, nunca misturados. Nível 1
  // (defeito_cliente) já existia na tela; os 3 campos abaixo faltavam.
  tecnico_id: string | null;
  tecnico: { nome: string } | null;
  /** Nível 2 — hipótese a partir do sintoma, SEM confirmação física. */
  suspeita_tecnica: string | null;
  /** Nível 3 — confirmado em bancada. */
  constatacao_tecnica: string | null;
  /** Quando o cliente foi avisado do risco em reparo avançado. NULL = ainda não avisado. */
  risco_informado_em: string | null;
  /** Placa com dano severo: laudo declara inviabilidade em vez de orçamento. */
  reparo_inviavel: boolean;
}

export default function OSDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const podeEditar = can(PERMISSIONS.ORDERS_EDIT);
  const veCusto = can(PERMISSIONS.INVENTORY_COST_VIEW);
  const { getStatusConfig } = useOsStatuses();

  const [orcamento, setOrcamento] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // ── Diagnóstico técnico (laudo completo) ────────────────────────────────
  const [suspeitaEdit, setSuspeitaEdit] = useState<string | null>(null);
  const [constatacaoEdit, setConstatacaoEdit] = useState<string | null>(null);
  const [reparoInviavelEdit, setReparoInviavelEdit] = useState<boolean | null>(null);
  const [salvandoDiagnostico, setSalvandoDiagnostico] = useState(false);

  // ── Peças e serviços ─────────────────────────────────────────────────────
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [tipoItem, setTipoItem] = useState<'peca' | 'servico'>('peca');
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([]);
  const [servicos, setServicos] = useState<ServicoOpcao[]>([]);
  const [itemForm, setItemForm] = useState({
    produtoId: '',
    servicoId: '',
    descricao: '',
    quantidade: '1',
    precoCobrado: '',
    custoUnitario: '',
    horasMaoObra: '',
    garantiaMeses: '',
  });
  const [salvandoItem, setSalvandoItem] = useState(false);

  const { data: itens, isLoading: carregandoItens } = useQuery({
    queryKey: ['os-itens', id],
    queryFn: async (): Promise<ItemOS[]> => {
      const { data, error } = await supabase
        .from('vw_os_itens')
        .select(
          'id, produto_id, descricao, quantidade, preco_cobrado, custo_unitario, horas_mao_obra, garantia_item_meses, produtos:vw_produtos(nome)'
        )
        .eq('os_id', id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as ItemOS[];
    },
    enabled: !!id,
  });

  // Catálogos pro dialog de adicionar item — busca só quando abre, não no
  // mount da página (a tela é acessada bem mais vezes só pra ver o
  // andamento da OS do que pra lançar item).
  useEffect(() => {
    if (!itemDialogOpen) return;

    supabase
      .from('vw_produtos')
      .select('id, nome, preco, custo, estoque_atual')
      .eq('ativo', true)
      .gt('estoque_atual', 0)
      .order('nome')
      .then(({ data }) => setProdutos((data ?? []) as ProdutoOpcao[]));

    supabase
      .from('vw_servicos')
      .select('id, nome, preco_referencia, custo_estimado, tempo_estimado_horas')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setServicos((data ?? []) as ServicoOpcao[]));
  }, [itemDialogOpen]);

  const abrirDialogItem = () => {
    setTipoItem('peca');
    setItemForm({
      produtoId: '',
      servicoId: '',
      descricao: '',
      quantidade: '1',
      precoCobrado: '',
      custoUnitario: '',
      horasMaoObra: '',
      garantiaMeses: '',
    });
    setItemDialogOpen(true);
  };

  const escolherProduto = (produtoId: string) => {
    const produto = produtos.find((p) => p.id === produtoId);
    setItemForm((f) => ({
      ...f,
      produtoId,
      precoCobrado: produto?.preco != null ? String(produto.preco) : f.precoCobrado,
      custoUnitario: produto?.custo != null ? String(produto.custo) : f.custoUnitario,
    }));
  };

  const escolherServico = (servicoId: string) => {
    const servico = servicos.find((s) => s.id === servicoId);
    setItemForm((f) => ({
      ...f,
      servicoId,
      descricao: servico?.nome ?? f.descricao,
      precoCobrado: servico ? String(servico.preco_referencia) : f.precoCobrado,
      custoUnitario: servico ? String(servico.custo_estimado) : f.custoUnitario,
      horasMaoObra: servico?.tempo_estimado_horas != null ? String(servico.tempo_estimado_horas) : f.horasMaoObra,
    }));
  };

  const salvarItem = async () => {
    if (!os) return;

    const preco = parseFloat(itemForm.precoCobrado);
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Informe um preço válido', variant: 'destructive' });
      return;
    }
    if (tipoItem === 'peca' && !itemForm.produtoId) {
      toast({ title: 'Escolha uma peça do estoque', variant: 'destructive' });
      return;
    }
    if (tipoItem === 'servico' && !itemForm.descricao.trim()) {
      toast({ title: 'Descreva o serviço', variant: 'destructive' });
      return;
    }

    const quantidade = tipoItem === 'peca' ? Math.max(1, parseInt(itemForm.quantidade, 10) || 1) : 1;

    if (tipoItem === 'peca') {
      const produtoSelecionado = produtos.find((p) => p.id === itemForm.produtoId);
      if (produtoSelecionado && quantidade > produtoSelecionado.estoque_atual) {
        toast({
          title: 'Estoque insuficiente',
          description: `"${produtoSelecionado.nome}" tem só ${produtoSelecionado.estoque_atual} unidade(s) em estoque.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSalvandoItem(true);
    try {
      const payload: {
        os_id: string;
        produto_id: string | null;
        descricao: string | null;
        quantidade: number;
        preco_cobrado: number;
        custo_unitario?: number;
        horas_mao_obra?: number;
        garantia_item_meses?: number;
      } = {
        os_id: os.id,
        produto_id: tipoItem === 'peca' ? itemForm.produtoId : null,
        descricao:
          tipoItem === 'servico'
            ? itemForm.descricao.trim()
            : produtos.find((p) => p.id === itemForm.produtoId)?.nome ?? null,
        quantidade,
        preco_cobrado: preco,
      };

      // Quem não vê custo não grava custo — mesma cautela de CadastroServicos.tsx.
      if (veCusto && itemForm.custoUnitario.trim()) {
        const custo = Number(itemForm.custoUnitario);
        if (!Number.isNaN(custo)) payload.custo_unitario = custo;
      }
      if (itemForm.horasMaoObra.trim()) {
        const horas = Number(itemForm.horasMaoObra);
        if (!Number.isNaN(horas)) payload.horas_mao_obra = horas;
      }
      if (itemForm.garantiaMeses.trim()) {
        const meses = parseInt(itemForm.garantiaMeses, 10);
        if (!Number.isNaN(meses)) payload.garantia_item_meses = meses;
      }

      const { error } = await supabase.from('service_order_items').insert(payload);
      if (error) throw error;

      toast({
        title: tipoItem === 'peca' ? 'Peça lançada!' : 'Serviço lançado!',
        description:
          tipoItem === 'peca'
            ? 'O estoque já foi descontado automaticamente.'
            : 'Item adicionado à OS.',
      });

      setItemDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['os-itens', id] });
    } catch (error) {
      toast({
        title: 'Erro ao lançar item',
        description:
          error instanceof Error && /row-level security|policy/i.test(error.message)
            ? 'Seu perfil de acesso não permite fazer isso.'
            : error instanceof Error
              ? error.message
              : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvandoItem(false);
    }
  };

  const excluirItem = async (item: ItemOS) => {
    if (!confirm('Excluir este item da OS?')) return;
    try {
      const { error } = await supabase.from('service_order_items').delete().eq('id', item.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['os-itens', id] });
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const somaItens = (itens ?? []).reduce(
    (acc, item) => acc + Number(item.preco_cobrado) * (item.quantidade ?? 1),
    0
  );

  // Achado no plano de refinamento (17/08): service_orders.total_pecas/
  // total_mao_obra existem desde a criação do schema, mas NENHUM gatilho ou
  // tela nunca gravou nelas — não são "dado escondido", são colunas mortas
  // de verdade (confirmado: nenhuma migration faz UPDATE nelas). Em vez de
  // ressuscitar duas colunas denormalizadas com um gatilho novo pra manter
  // sincronizado, o valor de verdade já está em service_order_items — o
  // breakdown abaixo computa ao vivo, direto da fonte. As duas colunas
  // continuam no schema, intencionalmente não usadas.
  const totalPecasValor = (itens ?? [])
    .filter((item) => item.produto_id != null)
    .reduce((acc, item) => acc + Number(item.preco_cobrado) * (item.quantidade ?? 1), 0);
  const totalMaoObraValor = (itens ?? [])
    .filter((item) => item.produto_id == null)
    .reduce((acc, item) => acc + Number(item.preco_cobrado) * (item.quantidade ?? 1), 0);

  const { data: os, isLoading } = useQuery({
    queryKey: ['os-detalhe', id],
    queryFn: async (): Promise<OSCompleta | null> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          `id, numero_os, status, tipo, prioridade, marca, modelo, cor, memoria, numero_serie,
           defeito_cliente, observacoes, anotacoes_checkin, senha_aparelho, senha_padrao,
           prazo_previsto, garantia_dias, total_orcamento, valor_final_pago, data_finalizacao,
           created_at, clientes(nome, telefones),
           os_checklist(catalogo_id, catalogos(descricao, tipo)),
           tecnico_id, tecnico:profiles!service_orders_tecnico_id_fkey(nome),
           suspeita_tecnica, constatacao_tecnica, risco_informado_em, reparo_inviavel`
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OSCompleta | null;
    },
    enabled: !!id,
  });

  // Mesma query de OSOrcamentos.tsx (queryKey igual, cache reaproveitado).
  const { data: tecnicos } = useQuery({
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

  // Timeline de mudança de etapa — dado gravado desde a criação do schema
  // (gatilho track_os_status_change), nenhuma tela lia até 17/08.
  const { data: historico } = useQuery({
    queryKey: ['os-historico', id],
    queryFn: async (): Promise<HistoricoOS[]> => {
      const { data, error } = await supabase
        .from('service_order_history')
        .select('id, usuario_id, status_anterior, status_novo, created_at')
        .eq('os_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as HistoricoOS[];
    },
    enabled: !!id,
  });

  // Pra resolver o nome de quem mudou cada etapa — TODOS os perfis, não só
  // ativos: alguém que mudou uma etapa no passado pode ter sido desativado
  // depois, e a timeline não deveria "esquecer" quem fez o quê.
  const { data: perfisTodos } = useQuery({
    queryKey: ['profiles-todos'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome');
      return data ?? [];
    },
  });

  const nomeUsuario = (usuarioId: string | null) =>
    (usuarioId && (perfisTodos ?? []).find((p) => p.id === usuarioId)?.nome) || '—';

  const valorAtual = orcamento ?? (os ? String(os.total_orcamento) : '');
  const mudou = os && parseFloat(valorAtual || '0') !== Number(os.total_orcamento);

  const salvarOrcamento = async () => {
    if (!os) return;
    const valor = parseFloat(valorAtual);
    if (isNaN(valor) || valor < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ total_orcamento: valor })
        .eq('id', os.id);
      if (error) throw error;

      toast({ title: 'Orçamento salvo!' });
      setOrcamento(null);
      queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  // ── Diagnóstico técnico (laudo completo) ────────────────────────────────
  // Mesmo padrão de rascunho local do orçamento acima: o campo mostra o
  // valor editado até salvar, sem gravar a cada tecla.
  const suspeitaAtual = suspeitaEdit ?? os?.suspeita_tecnica ?? '';
  const constatacaoAtual = constatacaoEdit ?? os?.constatacao_tecnica ?? '';
  const reparoInviavelAtual = reparoInviavelEdit ?? os?.reparo_inviavel ?? false;
  const mudouDiagnostico =
    !!os &&
    (suspeitaAtual !== (os.suspeita_tecnica ?? '') ||
      constatacaoAtual !== (os.constatacao_tecnica ?? '') ||
      reparoInviavelAtual !== os.reparo_inviavel);

  const salvarDiagnostico = async () => {
    if (!os) return;
    setSalvandoDiagnostico(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({
          suspeita_tecnica: suspeitaAtual.trim() || null,
          constatacao_tecnica: constatacaoAtual.trim() || null,
          reparo_inviavel: reparoInviavelAtual,
        })
        .eq('id', os.id);
      if (error) throw error;

      toast({ title: 'Diagnóstico salvo!' });
      setSuspeitaEdit(null);
      setConstatacaoEdit(null);
      setReparoInviavelEdit(null);
      queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSalvandoDiagnostico(false);
    }
  };

  // Técnico e risco informado são ações diretas (salvam na hora), não
  // rascunho — diferente do orçamento e do diagnóstico acima, que são texto
  // longo e se beneficiam de um botão Salvar explícito.
  const atribuirTecnico = async (tecnicoId: string) => {
    if (!os) return;
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ tecnico_id: tecnicoId || null })
        .eq('id', os.id);
      if (error) throw error;
      toast({ title: 'Técnico responsável atualizado!' });
      queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
    } catch (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const marcarRiscoInformado = async (informado: boolean) => {
    if (!os) return;
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ risco_informado_em: informado ? new Date().toISOString() : null })
        .eq('id', os.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
    } catch (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!os) {
    return <Vazio titulo="OS não encontrada" descricao="Ela pode ter sido excluída." />;
  }

  const statusCfg = getStatusConfig(os.status);
  const jaFoiEntregue = os.status === OS_ETAPAS.ENTREGUE;
  // Pra peças e serviços especificamente: "entregue" OU "cancelado" travam
  // lançamento novo — o banco já recusa os dois (gatilho
  // impedir_item_em_os_encerrada, migration 20260817150000), esta tela só
  // esconde o botão pra não deixar tentar à toa. O trancamento do "Valor do
  // orçamento" acima continua só olhando jaFoiEntregue, sem mudança.
  const osEncerrada = jaFoiEntregue || os.status === OS_CANCELADO;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo={`OS ${os.numero_os}`}
        hint={`Aberta em ${dataHora(os.created_at)}`}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {/* Mover a etapa daqui: abrir uma OS nova cai nesta tela, e antes
                era preciso voltar à lista só para avançar o fluxo. */}
            <TrocarEtapaOS
              osId={os.id}
              statusAtual={os.status}
              onMudou={() => {
                queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
                queryClient.invalidateQueries({ queryKey: ['os-itens', id] });
              }}
            />
            <Button variant="outline" onClick={() => navigate('/os')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge className={statusCfg?.color ?? ''}>{statusCfg?.label ?? os.status}</Badge>
        <Badge variant="outline">{OS_PRIORITY[os.prioridade]?.label ?? os.prioridade}</Badge>
        <Badge variant="outline" className="capitalize">{os.tipo}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{os.clientes?.nome ?? '—'}</p>
            <p className="text-muted-foreground">{os.clientes?.telefones?.[0] ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparelho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">
              {[os.marca, os.modelo].filter(Boolean).join(' ') || '—'}
            </p>
            {(os.cor || os.memoria) && (
              <p className="text-muted-foreground">
                {[os.cor, os.memoria].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="text-muted-foreground">
              {os.numero_serie ? `Nº série/IMEI: ${os.numero_serie}` : 'Sem nº de série informado'}
            </p>
            {/* Prazo e garantia: é o que o cliente cobra no balcão, então tem
                que estar visível sem precisar abrir o laudo. */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2">
              <span>
                <span className="text-muted-foreground">Prazo prometido: </span>
                {os.prazo_previsto ? formatarData(os.prazo_previsto) : 'não combinado'}
              </span>
              <span>
                <span className="text-muted-foreground">Garantia: </span>
                {os.garantia_dias ? `${os.garantia_dias} dias` : '—'}
              </span>
            </div>
            {(os.senha_aparelho || os.senha_padrao) && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {os.senha_aparelho && (
                  <span>
                    <span className="text-muted-foreground">Senha: </span>
                    <code className="rounded bg-muted px-1.5 py-0.5">{os.senha_aparelho}</code>
                  </span>
                )}
                {os.senha_padrao && <SenhaPadraoLeitura valor={os.senha_padrao} />}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Defeito relatado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{os.defeito_cliente}</p>
            {os.anotacoes_checkin && (
              <p className="mt-2 whitespace-pre-wrap">{os.anotacoes_checkin}</p>
            )}
            {os.observacoes && (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                <span className="font-medium">Interno: </span>
                {os.observacoes}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Padrão de laudo da casa (CLAUDE.md raiz): 3 níveis de certeza,
            nunca misturados. Nível 1 (o que o cliente relatou) é o card
            "Defeito relatado" acima — este é o Nível 2 (suspeita, sem
            confirmação física) e Nível 3 (constatado em bancada). */}
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Diagnóstico técnico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="tecnico">Técnico responsável</Label>
              <Select
                value={os.tecnico_id ?? 'nenhum'}
                onValueChange={(v) => atribuirTecnico(v === 'nenhum' ? '' : v)}
                disabled={!podeEditar}
              >
                <SelectTrigger id="tecnico" className="max-w-xs">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {(tecnicos ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="suspeita">
                Suspeita técnica{' '}
                <span className="font-normal text-muted-foreground">
                  — hipótese a partir do sintoma, sem confirmação física. Não apresentar ao cliente como certeza.
                </span>
              </Label>
              <Textarea
                id="suspeita"
                rows={2}
                value={suspeitaAtual}
                onChange={(e) => setSuspeitaEdit(e.target.value)}
                disabled={!podeEditar}
                placeholder="Ex.: possível oxidação por líquido, a confirmar em bancada"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="constatacao">
                Constatação técnica{' '}
                <span className="font-normal text-muted-foreground">
                  — só o que foi confirmado em bancada.
                </span>
              </Label>
              <Textarea
                id="constatacao"
                rows={2}
                value={constatacaoAtual}
                onChange={(e) => setConstatacaoEdit(e.target.value)}
                disabled={!podeEditar}
                placeholder="Ex.: confirmado curto na trilha X após abertura"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="font-medium">Reparo inviável</p>
                <p className="text-xs text-muted-foreground">
                  Placa com dano severo — o laudo declara inviabilidade em vez de emitir orçamento.
                </p>
              </div>
              <Switch
                checked={reparoInviavelAtual}
                onCheckedChange={(v) => setReparoInviavelEdit(v)}
                disabled={!podeEditar}
              />
            </div>

            {podeEditar && (
              <Button onClick={salvarDiagnostico} disabled={salvandoDiagnostico || !mudouDiagnostico}>
                <Save className="mr-2 h-4 w-4" />
                {salvandoDiagnostico ? 'Salvando…' : 'Salvar diagnóstico'}
              </Button>
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="font-medium">Risco informado ao cliente</p>
                <p className="text-xs text-muted-foreground">
                  {os.risco_informado_em
                    ? `Avisado em ${dataHora(os.risco_informado_em)}.`
                    : 'Ainda não avisado — marque antes de reparos avançados (reballing, reflow, banho químico, oxidação).'}
                </p>
              </div>
              {podeEditar && (
                <Button
                  variant={os.risco_informado_em ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => marcarRiscoInformado(!os.risco_informado_em)}
                >
                  {os.risco_informado_em ? 'Desmarcar' : 'Marcar como informado'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Check-in: o que foi marcado na entrada. Sem isto, a marcação seria
            dado gravado que ninguém vê — e é justamente o que a loja mostra ao
            cliente quando ele volta dizendo que deixou uma fonte junto. */}
        {os.os_checklist?.length > 0 && (
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Check-in do aparelho</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {[
                { tipo: 'checklist_defeito', titulo: 'Sintomas relatados' },
                { tipo: 'acessorio_entrada', titulo: 'Itens que vieram junto' },
                { tipo: 'condicao_entrada', titulo: 'Estado na entrada' },
              ].map((bloco) => {
                const itens = os.os_checklist.filter((c) => c.catalogos?.tipo === bloco.tipo);
                if (itens.length === 0) return null;
                return (
                  <div key={bloco.tipo}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {bloco.titulo}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {itens.map((c) => (
                        <Badge key={c.catalogo_id} variant="secondary">
                          {c.catalogos?.descricao}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Valor do orçamento</CardTitle>
          </CardHeader>
          <CardContent>
            {os.tipo !== 'paga' && (
              <p className="mb-3 text-sm text-muted-foreground">
                OS do tipo <span className="font-medium capitalize">{os.tipo}</span> — não gera
                cobrança quando entregue.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="orcamento">Valor (R$)</Label>
                <Input
                  id="orcamento"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-40"
                  value={valorAtual}
                  onChange={(e) => setOrcamento(e.target.value)}
                  disabled={!podeEditar || jaFoiEntregue}
                />
              </div>
              {podeEditar && !jaFoiEntregue && (
                <Button onClick={salvarOrcamento} disabled={salvando || !mudou}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              )}
              {podeEditar && !jaFoiEntregue && (itens?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setOrcamento(somaItens.toFixed(2))}
                  disabled={somaItens === Number(valorAtual || 0)}
                >
                  Usar soma dos itens ({moeda(somaItens)})
                </Button>
              )}
            </div>
            {jaFoiEntregue && (
              <p className="mt-3 text-sm text-muted-foreground">
                Esta OS já foi entregue
                {os.data_finalizacao ? ` em ${dataHora(os.data_finalizacao)}` : ''} — valor
                travado
                {os.valor_final_pago != null ? `: ${moeda(Number(os.valor_final_pago))}` : ''}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Peças e serviços</CardTitle>
            {podeEditar && !osEncerrada && (
              <Button size="sm" onClick={abrirDialogItem}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {carregandoItens ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (itens?.length ?? 0) === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhuma peça ou serviço lançado nesta OS ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    {veCusto && <TableHead className="text-right">Custo</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(itens ?? []).map((item) => {
                    const ehPeca = item.produto_id != null;
                    const qtd = item.quantidade ?? 1;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            {ehPeca ? (
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {item.produtos?.nome ?? item.descricao ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{qtd}</TableCell>
                        <TableCell className="text-right">{moeda(Number(item.preco_cobrado))}</TableCell>
                        {veCusto && (
                          <TableCell className="text-right text-muted-foreground">
                            {item.custo_unitario != null ? moeda(Number(item.custo_unitario)) : '—'}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          {moeda(Number(item.preco_cobrado) * qtd)}
                        </TableCell>
                        <TableCell>
                          {podeEditar && !osEncerrada && !ehPeca && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => excluirItem(item)}
                              title="Excluir item"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {(itens?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  Peças: <span className="font-medium text-foreground">{moeda(totalPecasValor)}</span>
                </span>
                <span className="text-muted-foreground">
                  Mão de obra:{' '}
                  <span className="font-medium text-foreground">{moeda(totalMaoObraValor)}</span>
                </span>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Peça do estoque desconta automaticamente e não pode ser excluída por aqui — se foi
              lançada errada, corrija pelo ajuste manual de estoque. Serviço avulso pode ser
              removido normalmente.
            </p>
          </CardContent>
        </Card>

        {/* Histórico da OS — timeline de mudança de etapa. Achado no plano de
            refinamento (17/08): o gatilho track_os_status_change grava isso
            desde a criação do schema, nenhuma tela lia até agora. */}
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Histórico da OS</CardTitle>
          </CardHeader>
          <CardContent>
            {!historico?.length ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nenhuma mudança de etapa registrada ainda.
              </p>
            ) : (
              <div className="space-y-2.5">
                {historico.map((h) => {
                  const de = h.status_anterior ? getStatusConfig(h.status_anterior) : null;
                  const para = getStatusConfig(h.status_novo);
                  return (
                    <div key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="whitespace-nowrap text-muted-foreground">
                        {dataHora(h.created_at)}
                      </span>
                      {de && (
                        <>
                          <Badge className={`${de.color} border-0`}>{de.label}</Badge>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </>
                      )}
                      <Badge className={`${para?.color ?? ''} border-0`}>
                        {para?.label ?? h.status_novo}
                      </Badge>
                      <span className="text-muted-foreground">— {nomeUsuario(h.usuario_id)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de adicionar item */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Adicionar item à OS</DialogTitle>
            <DialogDescription>
              Peça do estoque desconta automaticamente. Serviço avulso é só um lançamento —
              não mexe em estoque.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tipoItem} onValueChange={(v) => setTipoItem(v as 'peca' | 'servico')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="peca">Peça do estoque</TabsTrigger>
              <TabsTrigger value="servico">Serviço avulso</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 py-2">
            {tipoItem === 'peca' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="produto">Produto *</Label>
                  <Select value={itemForm.produtoId} onValueChange={escolherProduto}>
                    <SelectTrigger id="produto">
                      <SelectValue placeholder="Escolha uma peça com estoque disponível" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} (estoque: {p.estoque_atual})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantidade">Quantidade</Label>
                  <Input
                    id="quantidade"
                    type="number"
                    min={1}
                    max={produtos.find((p) => p.id === itemForm.produtoId)?.estoque_atual}
                    value={itemForm.quantidade}
                    onChange={(e) => setItemForm({ ...itemForm, quantidade: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="servico_catalogo">Puxar do catálogo (opcional)</Label>
                  <Select value={itemForm.servicoId} onValueChange={escolherServico}>
                    <SelectTrigger id="servico_catalogo">
                      <SelectValue placeholder="Ou digite livremente abaixo" />
                    </SelectTrigger>
                    <SelectContent>
                      {servicos.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descricao_servico">Descrição *</Label>
                  <Input
                    id="descricao_servico"
                    value={itemForm.descricao}
                    onChange={(e) => setItemForm({ ...itemForm, descricao: e.target.value })}
                    placeholder="Ex.: Troca de tela, mão de obra..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="horas">Horas de mão de obra (opcional)</Label>
                  <Input
                    id="horas"
                    type="number"
                    min={0}
                    step={0.5}
                    value={itemForm.horasMaoObra}
                    onChange={(e) => setItemForm({ ...itemForm, horasMaoObra: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preco_cobrado">Preço cobrado (R$) *</Label>
                <Input
                  id="preco_cobrado"
                  type="number"
                  min={0}
                  step={0.01}
                  value={itemForm.precoCobrado}
                  onChange={(e) => setItemForm({ ...itemForm, precoCobrado: e.target.value })}
                />
              </div>
              {veCusto && (
                <div className="space-y-2">
                  <Label htmlFor="custo_unitario">Custo (R$)</Label>
                  <Input
                    id="custo_unitario"
                    type="number"
                    min={0}
                    step={0.01}
                    value={itemForm.custoUnitario}
                    onChange={(e) => setItemForm({ ...itemForm, custoUnitario: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="garantia_item">Garantia deste item (meses, opcional)</Label>
              <Input
                id="garantia_item"
                type="number"
                min={0}
                value={itemForm.garantiaMeses}
                onChange={(e) => setItemForm({ ...itemForm, garantiaMeses: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarItem} disabled={salvandoItem}>
              {salvandoItem ? 'Salvando…' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
