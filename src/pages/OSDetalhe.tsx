import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock, Loader2, Plus, Save, Trash2, Wrench, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, dataHora, data as formatarData } from '@/lib/format';
import { contaDaOS, orcamentoDivergeDosItens } from '@/lib/itensDaOS';
import { OS_PRIORITY } from '@/lib/constants';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SenhaPadraoLeitura } from '@/components/os/SenhaPadrao';
import { TrocarEtapaOS } from '@/components/os/TrocarEtapaOS';
import { IniciarNaBancada } from '@/components/os/IniciarNaBancada';
import { DecisaoDoLaudo } from '@/components/os/DecisaoDoLaudo';
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
  /** peca, servico ou complementar. Antes o sistema deduzia pelo produto_id, e
   *  a peça comprada no dia era contada como serviço (migration 20260831180000). */
  tipo_item: string | null;
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
  /** Quem ABRIU a OS no balcão. Entra na linha do tempo como o primeiro
   *  evento — sem ele a linha começava na primeira troca de etapa, e a
   *  abertura, que é o momento mais consultado, ficava de fora. */
  vendedor_id: string | null;
  /** Quando o aparelho foi para a bancada, e com quem. NULL = ainda na fila.
   *  Não é etapa: a OS segue em Entrada/Análise. Ver components/os/IniciarReparo. */
  diagnostico_iniciado_em: string | null;
  diagnostico_iniciado_por: string | null;
  /** A resposta do cliente ao orçamento. NULL = ainda não respondeu. */
  laudo_aprovado: boolean | null;
  laudo_decidido_em: string | null;
  laudo_decidido_por: string | null;
  laudo_motivo_recusa: string | null;
  /** Quanto valia o orçamento recusado. O valor da OS passou a ser a taxa de
   *  análise, e sem este número a loja saberia que perdeu, mas não quanto. */
  valor_orcado_recusado: number | null;
  /** O segundo começo: depois do laudo aprovado, quando o serviço é executado.
   *  A distância entre os dois é o tempo em que a OS esperou o cliente. */
  execucao_iniciada_em: string | null;
  execucao_iniciada_por: string | null;
  /** Combinado com o cliente na abertura: esta OS passa por análise e laudo
   *  (true) ou é serviço tabelado, com preço e prazo já informados (false). */
  laudo_eletronico: boolean | null;
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
  /**
   * O que está sendo lançado. Quatro casos, e cada um responde a uma pergunta
   * diferente da loja (ver a coluna `tipo_item`, migration 20260831180000):
   *
   *   peca_estoque   peça da prateleira — desconta estoque
   *   peca_avulsa    peça comprada no fornecedor no dia — não passa pelo
   *                  estoque, porque nunca esteve lá. Pedido do Felipe em
   *                  31/08: "tem peças que a gente pega no fornecedor no dia"
   *   servico        mão de obra
   *   complementar   custo que a loja repassa: frete da peça, terceirização
   */
  const [tipoItem, setTipoItem] = useState<
    'peca_estoque' | 'peca_avulsa' | 'servico' | 'complementar'
  >('peca_estoque');

  /** Peça, de qualquer origem: as duas contam como peça no resumo. */
  const ehPeca = tipoItem === 'peca_estoque' || tipoItem === 'peca_avulsa';
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
          // `tipo_item` é o que separa peça, mão de obra e custo repassado.
          // Ficou de fora quando a coluna nasceu (31/08) e o resumo passou a
          // chamar de mão de obra toda peça comprada no dia e todo frete —
          // sem erro nenhum, porque coluna que não vem chega como vazia.
          'id, produto_id, descricao, quantidade, preco_cobrado, custo_unitario, horas_mao_obra, garantia_item_meses, tipo_item, produtos:vw_produtos(nome)'
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
    setTipoItem('peca_estoque');
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

  /**
   * As peças que o serviço escolhido consome (ficha técnica, cadastrada em
   * Cadastros > Serviços). Buscadas na hora da escolha, não antes: são poucas
   * e só interessam para o serviço que a pessoa selecionou.
   */
  const { data: pecasDoServico } = useQuery({
    queryKey: ['pecas-do-servico', itemForm.servicoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servico_pecas')
        .select('produto_id, quantidade, produtos:vw_produtos(nome, preco, custo, estoque_atual)')
        .eq('servico_id', itemForm.servicoId);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        produto_id: string;
        quantidade: number;
        produtos: { nome: string; preco: number | null; custo: number | null; estoque_atual: number | null } | null;
      }>;
    },
    enabled: !!itemForm.servicoId,
  });

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
    if (tipoItem === 'peca_estoque' && !itemForm.produtoId) {
      toast({ title: 'Escolha uma peça do estoque', variant: 'destructive' });
      return;
    }
    if (tipoItem !== 'peca_estoque' && !itemForm.descricao.trim()) {
      toast({
        title:
          tipoItem === 'servico'
            ? 'Descreva o serviço'
            : tipoItem === 'peca_avulsa'
              ? 'Descreva a peça'
              : 'Descreva o custo',
        variant: 'destructive',
      });
      return;
    }

    const quantidade = ehPeca ? Math.max(1, parseInt(itemForm.quantidade, 10) || 1) : 1;

    if (tipoItem === 'peca_estoque') {
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
        tipo_item: string;
        custo_unitario?: number;
        horas_mao_obra?: number;
        garantia_item_meses?: number;
      } = {
        os_id: os.id,
        // Só a peça do estoque aponta para produto: a comprada no dia nunca
        // esteve na prateleira, e forçar um produto para ela criaria cadastro
        // fantasma no estoque só para fechar a OS.
        produto_id: tipoItem === 'peca_estoque' ? itemForm.produtoId : null,
        descricao:
          tipoItem === 'peca_estoque'
            ? produtos.find((p) => p.id === itemForm.produtoId)?.nome ?? null
            : itemForm.descricao.trim(),
        quantidade,
        preco_cobrado: preco,
        tipo_item: ehPeca ? 'peca' : tipoItem === 'servico' ? 'servico' : 'complementar',
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

      /**
       * Serviço com ficha técnica lança as peças junto.
       *
       * Pedido do Felipe em 31/08. Antes eram dois lançamentos, e o segundo é
       * o que se esquece — esquecer tira a peça do estoque da conta e infla a
       * margem daquele serviço. Cada peça vira uma linha própria na OS, com o
       * preço dela: o cliente enxerga o que foi trocado, e o estoque desconta.
       *
       * Uma peça que falhar não derruba o serviço que já entrou: o aviso diz
       * quais faltaram, e elas podem ser lançadas à mão.
       */
      const pecasParaLancar = tipoItem === 'servico' ? (pecasDoServico ?? []) : [];
      const pecasQueFalharam: string[] = [];

      for (const peca of pecasParaLancar) {
        const { error: erroPeca } = await supabase.from('service_order_items').insert({
          os_id: os.id,
          produto_id: peca.produto_id,
          descricao: peca.produtos?.nome ?? null,
          quantidade: Math.max(1, Math.round(Number(peca.quantidade) || 1)),
          preco_cobrado: Number(peca.produtos?.preco ?? 0),
          tipo_item: 'peca',
          ...(veCusto && peca.produtos?.custo != null
            ? { custo_unitario: Number(peca.produtos.custo) }
            : {}),
        });
        if (erroPeca) pecasQueFalharam.push(peca.produtos?.nome ?? 'peça');
      }

      if (pecasQueFalharam.length > 0) {
        toast({
          title: 'Serviço lançado, mas faltaram peças',
          description: `Não deu para lançar: ${pecasQueFalharam.join(', ')}. Confira o estoque e lance à mão.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: ehPeca
            ? 'Peça lançada!'
            : tipoItem === 'servico'
              ? 'Serviço lançado!'
              : 'Custo lançado!',
          description:
            tipoItem === 'peca_estoque'
              ? 'O estoque já foi descontado automaticamente.'
              : tipoItem === 'peca_avulsa'
                ? 'Peça comprada no dia: entra na conta da OS sem passar pelo estoque.'
                : pecasParaLancar.length > 0
                ? `Serviço e ${pecasParaLancar.length} peça(s) da ficha técnica, com o estoque já descontado.`
                : 'Item adicionado à OS.',
          variant: 'success',
        });
      }

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
  /**
   * A conta da OS, separada por tipo. A regra mora em lib/itensDaOS.ts, com 16
   * testes — inclusive o caso que motivou tudo: a peça comprada no fornecedor
   * no dia, que antes era contada como mão de obra porque não tinha produto no
   * estoque.
   */
  const conta = contaDaOS(itens ?? []);
  const totalPecasValor = conta.pecas;
  const totalMaoObraValor = conta.servicos;
  const totalComplementaresValor = conta.complementares;
  const totalDosItens = conta.total;

  const { data: os, isLoading } = useQuery({
    queryKey: ['os-detalhe', id],
    queryFn: async (): Promise<OSCompleta | null> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select(
          `id, numero_os, status, tipo, prioridade, marca, modelo, cor, memoria, numero_serie,
           defeito_cliente, observacoes, anotacoes_checkin, senha_aparelho, senha_padrao,
           prazo_previsto, garantia_dias, total_orcamento, valor_final_pago, data_finalizacao,
           created_at, vendedor_id, diagnostico_iniciado_em, diagnostico_iniciado_por,
           laudo_aprovado, laudo_decidido_em, laudo_decidido_por, laudo_motivo_recusa,
           valor_orcado_recusado,
           execucao_iniciada_em, execucao_iniciada_por, laudo_eletronico,
           clientes(nome, telefones),
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

  /**
   * Linha do tempo da OS: abertura + cada troca de etapa, em ordem de hora.
   *
   * Pedido do Felipe em 23/08: "toda etapa tem que ter histórico de tempo e
   * usuário". O histórico de etapas já existia, mas começava na PRIMEIRA
   * TROCA — a abertura da OS não aparecia ali, porque o gatilho só grava
   * quando o status muda de um valor para outro, e criar não é mudar.
   *
   * Na prática isso deixava de fora justamente o evento mais consultado
   * ("quando esse aparelho entrou, e quem recebeu?"), que ficava só no
   * cabeçalho da ficha, longe do resto da cronologia.
   *
   * A abertura é montada aqui, a partir de `created_at` + `vendedor_id`, em
   * vez de virar linha no banco: gravar um registro de "mudou de nada para
   * aguardando_análise" duplicaria o que `service_orders` já sabe, e faria o
   * histórico de toda OS antiga ficar incompleto em comparação.
   */
  const linhaDoTempo = os
    ? [
        {
          id: 'abertura',
          created_at: os.created_at,
          usuario_id: os.vendedor_id,
          statusAnterior: null as string | null,
          statusNovo: null as string | null,
          descricao: 'OS aberta',
        },
        // O início do reparo não é troca de etapa, então não está no
        // histórico de status — mas é justamente o evento que explica por que
        // a OS ficou parada dois dias e depois andou em uma hora.
        ...(os.diagnostico_iniciado_em
          ? [{
              id: 'diagnostico-iniciado',
              created_at: os.diagnostico_iniciado_em,
              usuario_id: os.diagnostico_iniciado_por,
              statusAnterior: null as string | null,
              statusNovo: null as string | null,
              descricao: 'Diagnóstico iniciado na bancada',
            }]
          : []),
        ...(os.laudo_decidido_em
          ? [{
              id: 'laudo-decidido',
              created_at: os.laudo_decidido_em,
              usuario_id: os.laudo_decidido_por,
              statusAnterior: null as string | null,
              statusNovo: null as string | null,
              descricao: os.laudo_aprovado
                ? 'Cliente aprovou o laudo'
                : `Cliente NÃO aprovou — ${os.laudo_motivo_recusa ?? 'sem motivo registrado'}`,
            }]
          : []),
        ...(os.execucao_iniciada_em
          ? [{
              id: 'execucao-iniciada',
              created_at: os.execucao_iniciada_em,
              usuario_id: os.execucao_iniciada_por,
              statusAnterior: null as string | null,
              statusNovo: null as string | null,
              descricao: 'Execução iniciada',
            }]
          : []),
        ...(historico ?? []).map((h) => ({
          id: h.id,
          created_at: h.created_at,
          usuario_id: h.usuario_id,
          statusAnterior: h.status_anterior,
          statusNovo: h.status_novo,
          descricao: '',
        })),
      ].sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  /**
   * O cliente recusou o orçamento?
   *
   * Nesse caso o valor da OS NÃO é mais o do reparo: é a taxa de análise, e o
   * valor recusado foi guardado à parte (ver `registrar_decisao_do_laudo`).
   * Duas coisas da tela precisam saber disso, e as duas foram escritas por
   * outra sessão no mesmo dia, sem saber que a recusa existia:
   *
   *   • o aviso de divergência, que passaria a acusar TODA OS recusada — e
   *     aviso que aparece sempre é aviso que a equipe aprende a ignorar;
   *   • o botão "Usar soma dos itens", que trocaria a taxa de R$ 80 pelo
   *     reparo de R$ 450 que o cliente recusou. Como a entrega só libera com
   *     pagamento que cubra o valor, a loja cobraria do cliente um conserto
   *     que ele não quis e que ninguém fez.
   */
  const laudoRecusado = os?.laudo_aprovado === false;

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

      toast({ title: 'Orçamento salvo!', variant: 'success' });
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

      toast({ title: 'Diagnóstico salvo!', variant: 'success' });
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
      toast({ title: 'Técnico responsável atualizado!', variant: 'success' });
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
  // "Entregue" OU "cancelado" travam a ficha: nada de lançar peça/serviço
  // nem mexer no valor do orçamento. O banco já recusa item novo nos dois
  // casos (gatilho impedir_item_em_os_encerrada, migration 20260817150000);
  // esta tela só esconde o botão pra não deixar tentar à toa.
  //
  // Até 18/08 o "Valor do orçamento" olhava só `jaFoiEntregue`, então uma OS
  // CANCELADA tinha o campo de valor liberado enquanto a seção de peças logo
  // abaixo estava travada — mesma ficha, duas regras. Não dava prejuízo
  // direto (OS cancelada não gera título), mas confundia quem estava
  // preenchendo o laudo. Agora as duas partes seguem a mesma régua.
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
            {/* "Reparo começa aqui" — organograma do Felipe, 30/08. Fica antes
                das ações de etapa porque, no processo, é o primeiro botão que o
                técnico encosta depois de puxar a OS. */}
            <IniciarNaBancada
              osId={os.id}
              status={os.status}
              diagnosticoIniciadoEm={os.diagnostico_iniciado_em}
              execucaoIniciadaEm={os.execucao_iniciada_em}
              nomeDeQuemIniciouDiagnostico={nomeUsuario(os.diagnostico_iniciado_por)}
              nomeDeQuemIniciouExecucao={nomeUsuario(os.execucao_iniciada_por)}
              onMudou={() => queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] })}
            />

            {/* A resposta do cliente ao laudo. Só aparece na etapa em que a
                OS espera por ela, e substitui o avanço genérico ali. */}
            <DecisaoDoLaudo
              osId={os.id}
              status={os.status}
              tipo={os.tipo}
              totalOrcamento={os.total_orcamento}
              onMudou={() => {
                queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
                queryClient.invalidateQueries({ queryKey: ['os-historico', id] });
              }}
            />

            <TrocarEtapaOS
              osId={os.id}
              numeroOs={os.numero_os}
              statusAtual={os.status}
              tipo={os.tipo}
              totalOrcamento={os.total_orcamento}
              onMudou={() => {
                queryClient.invalidateQueries({ queryKey: ['os-detalhe', id] });
                queryClient.invalidateQueries({ queryKey: ['os-itens', id] });
                // Card "Histórico da OS" (17/08) lê 'os-historico' — faltava
                // invalidar aqui, então a timeline só atualizava depois de um
                // reload/refoco da janela, mesmo a mudança de etapa já tendo
                // sido gravada pelo gatilho track_os_status_change.
                queryClient.invalidateQueries({ queryKey: ['os-historico', id] });
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
            {/* O que foi combinado no balcão. O técnico precisa saber disto
                ANTES de abrir o aparelho: numa OS tabelada ele vai direto
                executar, e o laudo nem é esperado pelo cliente. */}
            <p className="text-sm text-muted-foreground">
              {os.laudo_eletronico === false ? (
                <>
                  <strong>Serviço tabelado</strong> — combinado no balcão com preço e prazo de
                  tabela. Não espera laudo eletrônico; o caminho é executar.
                </>
              ) : (
                <>
                  <strong>Com laudo eletrônico</strong> — o cliente foi avisado da taxa de análise
                  e do prazo. O laudo é a Constatação técnica abaixo.
                </>
              )}
            </p>
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
                Suspeita técnica — rascunho{' '}
                <span className="font-normal text-muted-foreground">
                  hipótese a partir do sintoma, sem confirmação física. Fica só aqui dentro:
                  não apresentar ao cliente como certeza.
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
                Constatação técnica — laudo eletrônico{' '}
                <span className="font-normal text-muted-foreground">
                  só o que foi confirmado em bancada. É esta parte que vira o laudo que o
                  cliente recebe.
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
                  disabled={!podeEditar || osEncerrada}
                />
              </div>
              {podeEditar && !osEncerrada && (
                <Button onClick={salvarOrcamento} disabled={salvando || !mudou}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              )}
              {podeEditar && !osEncerrada && !laudoRecusado && (itens?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setOrcamento(somaItens.toFixed(2))}
                  disabled={somaItens === Number(valorAtual || 0)}
                >
                  Usar soma dos itens ({moeda(somaItens)})
                </Button>
              )}
            </div>

            {/* O aviso que faltava (pedido do Felipe, 31/08).
                O valor do orçamento é digitado à mão, e os itens somam outra
                coisa. Os dois podem divergir com razão — desconto combinado,
                pacote fechado —, mas até agora NADA avisava. E é este número
                que vira a conta a receber: a diferença aparecia no caixa, não
                na tela.
                Um real de folga porque centavo de arredondamento não é
                divergência, é ruído. */}
            {!laudoRecusado && (itens?.length ?? 0) > 0 &&
              orcamentoDivergeDosItens(Number(valorAtual || 0), somaItens) && (
              <p className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-500">
                O orçamento está em <strong>{moeda(Number(valorAtual || 0))}</strong> e os itens
                lançados somam <strong>{moeda(somaItens)}</strong>
                {somaItens > Number(valorAtual || 0)
                  ? ` — ${moeda(somaItens - Number(valorAtual || 0))} a mais do que o combinado.`
                  : ` — ${moeda(Number(valorAtual || 0) - somaItens)} a menos do que o combinado.`}{' '}
                Se foi desconto ou pacote fechado, está certo assim. Se não, use o botão acima.
              </p>
            )}
            {laudoRecusado && (
              <p className="mt-3 rounded-md border border-border bg-muted/40 p-2.5 text-sm">
                <strong>Cliente não aprovou.</strong>{' '}
                {Number(os?.valor_orcado_recusado ?? 0) > 0 && (
                  <>
                    O orçamento recusado era de{' '}
                    <strong>{moeda(Number(os?.valor_orcado_recusado))}</strong>.{' '}
                  </>
                )}
                {Number(os?.total_orcamento ?? 0) > 0
                  ? `A OS ficou valendo ${moeda(Number(os?.total_orcamento))} — a taxa de análise, cobrada na retirada.`
                  : 'A loja não cobra taxa de análise, então a OS ficou sem valor.'}
                {os?.laudo_motivo_recusa && (
                  <>
                    {' '}
                    Motivo: <em>{os.laudo_motivo_recusa}</em>.
                  </>
                )}
              </p>
            )}
            {jaFoiEntregue && (
              <p className="mt-3 text-sm text-muted-foreground">
                Esta OS já foi entregue
                {os.data_finalizacao ? ` em ${dataHora(os.data_finalizacao)}` : ''} — valor
                travado
                {os.valor_final_pago != null ? `: ${moeda(Number(os.valor_final_pago))}` : ''}.
              </p>
            )}
            {!jaFoiEntregue && osEncerrada && (
              <p className="mt-3 text-sm text-muted-foreground">
                Esta OS foi cancelada — valor travado.
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
              /* O resumo que faltava, a pedido do Felipe (31/08). Antes eram
                 dois números soltos numa linha; agora são os três grupos e o
                 total, que é o número que vira o orçamento do cliente. */
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <ResumoDaConta rotulo="Peças" valor={totalPecasValor} />
                <ResumoDaConta rotulo="Mão de obra" valor={totalMaoObraValor} />
                <ResumoDaConta rotulo="Outros custos" valor={totalComplementaresValor} />
                <ResumoDaConta rotulo="Total" valor={totalDosItens} destaque />
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
            <CardTitle className="text-base">Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            {!linhaDoTempo.length ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nada registrado ainda.
              </p>
            ) : (
              <div className="space-y-2.5">
                {linhaDoTempo.map((ev) => {
                  const de = ev.statusAnterior ? getStatusConfig(ev.statusAnterior) : null;
                  const para = ev.statusNovo ? getStatusConfig(ev.statusNovo) : null;
                  return (
                    <div key={ev.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {dataHora(ev.created_at)}
                      </span>
                      {para ? (
                        <>
                          {de && (
                            <>
                              <Badge className={`${de.color} border-0`}>{de.label}</Badge>
                              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </>
                          )}
                          <Badge className={`${para.color} border-0`}>{para.label}</Badge>
                        </>
                      ) : (
                        <span className="font-medium">{ev.descricao}</span>
                      )}
                      <span className="text-muted-foreground">— {nomeUsuario(ev.usuario_id)}</span>
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
              {tipoItem === 'peca_estoque'
                ? 'Peça da prateleira: o estoque desconta sozinho.'
                : tipoItem === 'peca_avulsa'
                  ? 'Peça comprada no fornecedor no dia. Não passa pelo estoque, porque nunca esteve lá.'
                  : tipoItem === 'servico'
                    ? 'Mão de obra. Puxando do catálogo, as peças da ficha técnica vêm junto.'
                    : 'O que a loja pagou e repassa: frete da peça, terceirização, taxa de fornecedor.'}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tipoItem}
            onValueChange={(v) =>
              setTipoItem(v as 'peca_estoque' | 'peca_avulsa' | 'servico' | 'complementar')
            }
          >
            {/* Quatro caminhos, porque são quatro coisas diferentes na conta da
                loja. Peça avulsa e "outro custo" nasceram do pedido do Felipe
                em 31/08 — antes, os dois viravam "serviço avulso" e sujavam o
                relatório de mão de obra com frete e peça de fornecedor. */}
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="peca_estoque" className="text-xs sm:text-sm">
                Peça do estoque
              </TabsTrigger>
              <TabsTrigger value="peca_avulsa" className="text-xs sm:text-sm">
                Peça comprada
              </TabsTrigger>
              <TabsTrigger value="servico" className="text-xs sm:text-sm">
                Serviço
              </TabsTrigger>
              <TabsTrigger value="complementar" className="text-xs sm:text-sm">
                Outro custo
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 py-2">
            {tipoItem === 'peca_estoque' ? (
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
                {tipoItem === 'servico' && (
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

                {/* O que vem junto. Mostrar ANTES de confirmar é o ponto: o
                    técnico vê que a tela vai sair do estoque, e quem não quer
                    ainda dá tempo de escolher outro serviço ou lançar à mão.
                    Surpresa de estoque descoberta depois é conferência
                    refeita. */}
                {(pecasDoServico ?? []).length > 0 && (
                  <div className="rounded-md border bg-muted/40 p-2.5">
                    <p className="text-xs font-medium">
                      Este serviço já leva {(pecasDoServico ?? []).length} peça(s):
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {(pecasDoServico ?? []).map((p) => {
                        const emEstoque = Number(p.produtos?.estoque_atual ?? 0);
                        const precisa = Number(p.quantidade);
                        const falta = emEstoque < precisa;
                        return (
                          <li key={p.produto_id} className="text-xs text-muted-foreground">
                            {precisa}× {p.produtos?.nome ?? '—'}
                            {p.produtos?.preco != null && <> · {moeda(Number(p.produtos.preco))}</>}
                            {falta && (
                              <span className="text-destructive">
                                {' '}
                                — só {emEstoque} em estoque
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Elas entram como linhas próprias na OS e saem do estoque.
                    </p>
                  </div>
                )}

                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="descricao_servico">
                    {tipoItem === 'peca_avulsa'
                      ? 'Peça *'
                      : tipoItem === 'complementar'
                        ? 'Do que é este custo *'
                        : 'Descrição *'}
                  </Label>
                  <Input
                    id="descricao_servico"
                    value={itemForm.descricao}
                    onChange={(e) => setItemForm({ ...itemForm, descricao: e.target.value })}
                    placeholder={
                      tipoItem === 'peca_avulsa'
                        ? 'Ex.: Tela iPhone 11 comprada no fornecedor'
                        : tipoItem === 'complementar'
                          ? 'Ex.: frete da peça, serviço terceirizado'
                          : 'Ex.: Troca de tela, mão de obra...'
                    }
                  />
                </div>
                {tipoItem === 'peca_avulsa' && (
                  <div className="space-y-2">
                    <Label htmlFor="quantidade_avulsa">Quantidade</Label>
                    <Input
                      id="quantidade_avulsa"
                      type="number"
                      min={1}
                      value={itemForm.quantidade}
                      onChange={(e) => setItemForm({ ...itemForm, quantidade: e.target.value })}
                    />
                  </div>
                )}
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


/** Um número do resumo da conta da OS: rótulo em cima, valor embaixo. */
function ResumoDaConta({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className={`rounded-md border p-2.5 ${destaque ? 'bg-muted/60' : ''}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-medium ${destaque ? 'text-base' : 'text-sm'}`}>{moeda(valor)}</p>
    </div>
  );
}
