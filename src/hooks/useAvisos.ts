import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { estoqueCritico } from '@/lib/estoque';

/**
 * Os avisos do sininho.
 *
 * Até 23/08 o sino era enfeite: nenhum clique, e o número "3" estava DIGITADO
 * no código. Prometia três avisos que não existiam.
 *
 * Não existe tabela de notificação, e não criei uma de propósito. Aviso
 * guardado em tabela precisa de alguém que o crie e alguém que o apague, e o
 * primeiro esquecimento deixa o sino mentindo — avisando de uma OS que já foi
 * entregue. Aqui cada aviso é uma PERGUNTA FEITA AO BANCO na hora: se o
 * problema acabou, o aviso some sozinho, sem ninguém ter que limpar nada.
 *
 * Cada aviso respeita a permissão de quem está olhando. Quem não vê financeiro
 * não é avisado de conta vencida — seria avisar de um problema que a pessoa
 * não tem como resolver nem conferir.
 */

export interface Aviso {
  id: string;
  titulo: string;
  detalhe: string;
  /** Para onde levar quem clicar. */
  caminho: string;
  /** 'urgente' pinta de vermelho; 'atencao', de âmbar. */
  peso: 'urgente' | 'atencao';
  quantidade: number;
}

/** Dias corridos entre uma data e agora. */
function diasDesde(iso: string, agora: number): number {
  return Math.floor((agora - new Date(iso).getTime()) / 86_400_000);
}

export function useAvisos() {
  const { can } = useAuth();
  const veEstoque = can(PERMISSIONS.INVENTORY_VIEW);
  const veOS = can(PERMISSIONS.ORDERS_VIEW);
  const vePagar = can(PERMISSIONS.FINANCE_PAYABLE_MANAGE);
  const veCaixa = can(PERMISSIONS.FINANCE_CASHIER_CLOSE);

  return useQuery({
    queryKey: ['avisos', veEstoque, veOS, vePagar, veCaixa],
    // De minuto em minuto: perto o bastante para ser útil, longe o bastante
    // para não pesar. Ninguém fica olhando o sino esperando ele mudar.
    refetchInterval: 60_000,
    queryFn: async (): Promise<Aviso[]> => {
      const agora = Date.now();
      const hojeISO = new Date().toISOString().slice(0, 10);
      const avisos: Aviso[] = [];

      const [produtos, ordens, titulos, caixas] = await Promise.all([
        veEstoque
          ? supabase.from('vw_produtos').select('id, estoque_atual, estoque_minimo').eq('ativo', true)
          : Promise.resolve({ data: [], error: null }),
        veOS
          ? supabase
              .from('service_orders')
              .select('id, status, created_at')
              .not('status', 'in', '("entregue","cancelado")')
          : Promise.resolve({ data: [], error: null }),
        vePagar
          ? supabase
              .from('titulos_financeiros')
              .select('id, valor, vencimento')
              .eq('natureza', 'pagar')
              .eq('status', 'aberto')
              .lt('vencimento', hojeISO)
          : Promise.resolve({ data: [], error: null }),
        veCaixa
          ? supabase.from('caixa_sessoes').select('id, aberto_em').eq('status', 'aberto')
          : Promise.resolve({ data: [], error: null }),
      ]);

      // ── Estoque no fim ────────────────────────────────────────────────
      const criticos = (produtos.data ?? []).filter((p) =>
        estoqueCritico(p as { estoque_atual: number | null; estoque_minimo: number | null }),
      );
      if (criticos.length > 0) {
        const zerados = criticos.filter((p) => (p.estoque_atual ?? 0) <= 0).length;
        avisos.push({
          id: 'estoque-critico',
          titulo: `${criticos.length} produto(s) no fim do estoque`,
          detalhe: zerados > 0 ? `${zerados} já zerado(s)` : 'Chegaram no mínimo',
          caminho: '/estoque/critico',
          peso: zerados > 0 ? 'urgente' : 'atencao',
          quantidade: criticos.length,
        });
      }

      // ── Aparelho esquecido na bancada ─────────────────────────────────
      const paradas = (ordens.data ?? []).filter((o) => diasDesde(o.created_at, agora) >= 7);
      if (paradas.length > 0) {
        const maisAntiga = Math.max(...paradas.map((o) => diasDesde(o.created_at, agora)));
        avisos.push({
          id: 'os-paradas',
          titulo: `${paradas.length} aparelho(s) parado(s) há mais de 7 dias`,
          detalhe: `O mais antigo está há ${maisAntiga} dias`,
          caminho: '/os',
          peso: maisAntiga >= 15 ? 'urgente' : 'atencao',
          quantidade: paradas.length,
        });
      }

      // ── Orçamento esperando o cliente ─────────────────────────────────
      const aguardando = (ordens.data ?? []).filter((o) => o.status === 'aguardando_aprovacao');
      if (aguardando.length > 0) {
        avisos.push({
          id: 'os-aguardando',
          titulo: `${aguardando.length} orçamento(s) esperando resposta`,
          detalhe: 'O cliente ainda não aprovou',
          caminho: '/os',
          peso: 'atencao',
          quantidade: aguardando.length,
        });
      }

      // ── Conta vencida ─────────────────────────────────────────────────
      if ((titulos.data ?? []).length > 0) {
        const total = (titulos.data ?? []).reduce((s, t) => s + Number(t.valor ?? 0), 0);
        avisos.push({
          id: 'contas-vencidas',
          titulo: `${titulos.data!.length} conta(s) vencida(s)`,
          detalhe: `R$ ${total.toFixed(2).replace('.', ',')} em atraso`,
          caminho: '/financeiro/pagar',
          peso: 'urgente',
          quantidade: titulos.data!.length,
        });
      }

      // ── Caixa que ficou aberto de um dia para o outro ─────────────────
      //
      // Caixa aberto de ontem quase sempre é esquecimento, não turno virado.
      // O estrago é no fechamento: a conferência do dia seguinte mistura o
      // dinheiro dos dois dias e nunca mais bate.
      const antigos = (caixas.data ?? []).filter((c) => diasDesde(c.aberto_em, agora) >= 1);
      if (antigos.length > 0) {
        avisos.push({
          id: 'caixa-aberto',
          titulo: 'Caixa aberto desde ontem',
          detalhe: 'Fechar antes de começar o dia evita a conferência não bater',
          caminho: '/financeiro/caixa',
          peso: 'atencao',
          quantidade: antigos.length,
        });
      }

      return avisos;
    },
  });
}
