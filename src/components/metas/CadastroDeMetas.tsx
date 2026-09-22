import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Target, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { moeda, paraNumero } from '@/lib/format';
import type { Database } from '@/integrations/supabase/types';

/**
 * Onde a loja cadastra as metas do mês.
 *
 * Até 22/09 não existia esta tela: as faixas de premiação tinham sido
 * semeadas dentro de uma migration em agosto e não havia como mexer nelas
 * pelo sistema — o painel de metas ia dizer "meta não cadastrada" para sempre
 * assim que o ano virasse.
 *
 * Duas coisas são cadastradas aqui, lado a lado de propósito:
 *
 *   • **A meta da loja**, nas quatro faixas de premiação que a Rio Preto Games
 *     já usa (Bronze, Prata, Ouro e Diamante).
 *   • **A meta de cada pessoa**, que antes era só um chute do painel — ele
 *     dividia a meta da loja pelo número de gente que tinha vendido no mês, e
 *     esse número mudava sozinho quando alguém entrava de férias.
 *
 * Só administrador e gerente abrem esta janela (`dashboards.goals.manage`), e
 * o banco confere isso de novo por conta própria: mesmo que alguém burle a
 * tela, a policy de RLS recusa a gravação.
 */

type Faixa = Database['public']['Enums']['faixa_premiacao'];

const FAIXAS: { chave: Faixa; label: string; emoji: string }[] = [
  { chave: 'bronze', label: 'Bronze', emoji: '🥉' },
  { chave: 'prata', label: 'Prata', emoji: '🥈' },
  { chave: 'ouro', label: 'Ouro', emoji: '🥇' },
  { chave: 'diamante', label: 'Diamante', emoji: '💎' },
];

export interface MetaDaLoja {
  faixa: Faixa;
  valor_meta: number;
}

export interface MetaDePessoa {
  user_id: string;
  nome: string;
  valor_meta: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ano: number;
  mes: number;
  nomeDoMes: string;
  tenantId: string | null;
  metasDaLoja: MetaDaLoja[];
  pessoas: MetaDePessoa[];
}

/** Texto digitado → número, aceitando campo vazio como "não cadastrado". */
function lerValor(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  const n = paraNumero(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function CadastroDeMetas({
  open,
  onOpenChange,
  ano,
  mes,
  nomeDoMes,
  tenantId,
  metasDaLoja,
  pessoas,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [loja, setLoja] = useState<Record<string, string>>({});
  const [individuais, setIndividuais] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  // Recarrega os campos toda vez que a janela abre: se alguém mudou o mês por
  // trás, o formulário tem que refletir o mês que está na tela.
  useEffect(() => {
    if (!open) return;
    const daLoja: Record<string, string> = {};
    for (const f of FAIXAS) {
      const atual = metasDaLoja.find((m) => m.faixa === f.chave);
      daLoja[f.chave] = atual ? String(atual.valor_meta).replace('.', ',') : '';
    }
    setLoja(daLoja);

    const porPessoa: Record<string, string> = {};
    for (const p of pessoas) {
      porPessoa[p.user_id] = p.valor_meta !== null ? String(p.valor_meta).replace('.', ',') : '';
    }
    setIndividuais(porPessoa);
    setErro(null);
  }, [open, metasDaLoja, pessoas]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Loja não identificada');

      // As faixas preenchidas sobem juntas; a que ficou em branco é apagada,
      // que é como se diz "esta faixa não vale para este mês".
      const paraGravar: { faixa: Faixa; valor: number }[] = [];
      const paraApagar: Faixa[] = [];
      for (const f of FAIXAS) {
        const valor = lerValor(loja[f.chave] ?? '');
        if (valor === null) paraApagar.push(f.chave);
        else paraGravar.push({ faixa: f.chave, valor });
      }

      if (paraGravar.length > 0) {
        const { error } = await supabase.from('metas_faturamento').upsert(
          paraGravar.map((m) => ({
            tenant_id: tenantId,
            ano,
            mes,
            faixa: m.faixa,
            valor_meta: m.valor,
          })),
          { onConflict: 'tenant_id,ano,mes,faixa' },
        );
        if (error) throw error;
      }

      if (paraApagar.length > 0) {
        const { error } = await supabase
          .from('metas_faturamento')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('ano', ano)
          .eq('mes', mes)
          .in('faixa', paraApagar);
        if (error) throw error;
      }

      const individuaisPreenchidas: { user_id: string; valor: number }[] = [];
      const individuaisVazias: string[] = [];
      for (const p of pessoas) {
        const valor = lerValor(individuais[p.user_id] ?? '');
        if (valor === null) individuaisVazias.push(p.user_id);
        else individuaisPreenchidas.push({ user_id: p.user_id, valor });
      }

      if (individuaisPreenchidas.length > 0) {
        const { error } = await supabase.from('metas_vendedor').upsert(
          individuaisPreenchidas.map((m) => ({
            tenant_id: tenantId,
            user_id: m.user_id,
            ano,
            mes,
            valor_meta: m.valor,
          })),
          { onConflict: 'tenant_id,user_id,ano,mes' },
        );
        if (error) throw error;
      }

      if (individuaisVazias.length > 0) {
        const { error } = await supabase
          .from('metas_vendedor')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('ano', ano)
          .eq('mes', mes)
          .in('user_id', individuaisVazias);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-metas'] });
      toast({
        title: 'Metas salvas',
        description: `As metas de ${nomeDoMes} foram atualizadas.`,
      });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      // O erro do banco vem em inglês e não diz nada para quem está na loja.
      // O caso real aqui é a policy recusando quem não tem a permissão.
      const msg = e instanceof Error ? e.message : String(e);
      setErro(
        /row-level security|permission/i.test(msg)
          ? 'Seu usuário não tem permissão para cadastrar metas. Fale com um administrador.'
          : `Não foi possível salvar: ${msg}`,
      );
    },
  });

  const somaIndividual = pessoas.reduce(
    (soma, p) => soma + (lerValor(individuais[p.user_id] ?? '') ?? 0),
    0,
  );
  const menorFaixa = FAIXAS.map((f) => lerValor(loja[f.chave] ?? ''))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Metas de {nomeDoMes}</DialogTitle>
          <DialogDescription>
            Deixe em branco a meta que não vale para este mês — ela sai do painel. Os valores
            são do mês inteiro; o painel mostra sozinho como está cada quinzena.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-muted-foreground" />
              Meta da loja, por faixa de premiação
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FAIXAS.map((f) => (
                <div key={f.chave} className="space-y-1.5">
                  <Label htmlFor={`meta-${f.chave}`} className="text-xs">
                    {f.emoji} {f.label}
                  </Label>
                  <Input
                    id={`meta-${f.chave}`}
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={loja[f.chave] ?? ''}
                    onChange={(e) => setLoja({ ...loja, [f.chave]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-muted-foreground" />
              Meta de cada pessoa
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Cada um passa a ver a própria meta e o quanto falta. Quem ficar em branco
              aparece no painel sem meta, só com o que vendeu.
            </p>
            {pessoas.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhuma pessoa ativa cadastrada para receber meta.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {pessoas.map((p) => (
                  <div key={p.user_id} className="space-y-1.5">
                    <Label htmlFor={`meta-p-${p.user_id}`} className="text-xs">
                      {p.nome}
                    </Label>
                    <Input
                      id={`meta-p-${p.user_id}`}
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={individuais[p.user_id] ?? ''}
                      onChange={(e) =>
                        setIndividuais({ ...individuais, [p.user_id]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Confere a soma na hora: meta individual que não fecha com a meta
                da loja é o erro mais fácil de cometer aqui, e o mais chato de
                descobrir no fim do mês. */}
            {somaIndividual > 0 && menorFaixa !== undefined && (
              <p className="mt-3 text-xs text-muted-foreground">
                As metas individuais somam <strong>{moeda(somaIndividual)}</strong>.{' '}
                {somaIndividual < menorFaixa
                  ? `Isso é menos que a menor faixa da loja (${moeda(menorFaixa)}) — batendo todas as individuais, a loja ainda não chega lá.`
                  : `A menor faixa da loja é ${moeda(menorFaixa)}.`}
              </p>
            )}
          </div>

          {erro && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvar.isPending}>
            Cancelar
          </Button>
          {/* Verde porque salvar é confirmar — a regra de cor de botão do
              sistema (lib/acoes.ts), que tem teste varrendo o código atrás de
              "Salvar" azul. */}
          <Button variant="sucesso" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar metas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
