import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { db } from '@/integrations/supabase/untyped';
import { moeda, mesCorrente, data as fmtData } from '@/lib/format';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * Fluxo de Caixa.
 *
 * Lê `titulos_financeiros` de uma vez só — contas a pagar e a receber estão na
 * mesma tabela, o que evita o UNION de duas tabelas paralelas que sempre acabam
 * divergindo.
 *
 * A distinção que a tela deixa explícita: PREVISTO (tudo que está lançado no
 * período) e REALIZADO (só o que foi efetivamente pago/recebido). Misturar os
 * dois é o erro mais comum em relatório de fluxo de caixa — dá a impressão de
 * saldo que ainda não existe.
 */

interface LinhaFluxo {
  id: string;
  natureza: 'pagar' | 'receber';
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'aberto' | 'pago' | 'cancelado';
  pago_em: string | null;
  categorias_financeiras?: { nome: string } | null;
}

export default function FluxoCaixa() {
  const inicial = mesCorrente();
  const [de, setDe] = useState(inicial.inicio);
  const [ate, setAte] = useState(inicial.fim);

  const { data: dados, isLoading } = useQuery({
    queryKey: ['fluxo-caixa', de, ate],
    queryFn: async (): Promise<{ previsto: LinhaFluxo[]; realizado: LinhaFluxo[] }> => {
      const colunas =
        'id, natureza, descricao, valor, vencimento, status, pago_em, categorias_financeiras(nome)';

      // DUAS consultas, com recortes de data DIFERENTES de propósito — é o
      // conserto do erro mais comum em relatório de fluxo de caixa, que este
      // arquivo avisava e cometia ao mesmo tempo:
      //
      //   Previsto  = o que VENCE no período  → filtra por `vencimento`
      //   Realizado = o que foi PAGO no período → filtra por `pago_em`
      //
      // Antes, "realizado" era só o subconjunto pago de quem vencia no
      // período. Um título que venceu em janeiro e foi pago em março contava
      // como realizado de JANEIRO — mês em que nenhum dinheiro se moveu — e
      // sumia de março, onde o dinheiro de fato saiu.
      const [previstoRes, realizadoRes] = await Promise.all([
        db.from('titulos_financeiros').select(colunas)
          .neq('status', 'cancelado')
          .gte('vencimento', de).lte('vencimento', ate)
          .order('vencimento'),
        db.from('titulos_financeiros').select(colunas)
          .eq('status', 'pago')
          .gte('pago_em', de).lte('pago_em', ate)
          .order('pago_em'),
      ]);
      if (previstoRes.error) throw previstoRes.error;
      if (realizadoRes.error) throw realizadoRes.error;

      // O client sem tipos infere a relação embutida como array; em `maybeSingle`
      // de relação 1:1 ela vem como objeto. Daí o passo por `unknown`.
      return {
        previsto: (previstoRes.data ?? []) as unknown as LinhaFluxo[],
        realizado: (realizadoRes.data ?? []) as unknown as LinhaFluxo[],
      };
    },
  });

  const linhas = dados?.previsto;
  const realizadas = dados?.realizado ?? [];

  const resumo = useMemo(() => {
    const xs = linhas ?? [];
    const soma = (f: (l: LinhaFluxo) => boolean) =>
      xs.filter(f).reduce((acc, l) => acc + Number(l.valor), 0);

    const somaRealizado = (f: (l: LinhaFluxo) => boolean) =>
      realizadas.filter(f).reduce((acc, l) => acc + Number(l.valor), 0);

    const entradasPrevistas = soma((l) => l.natureza === 'receber');
    const saidasPrevistas = soma((l) => l.natureza === 'pagar');
    // Realizado sai da OUTRA lista — a que foi filtrada por data de pagamento.
    const entradasRealizadas = somaRealizado((l) => l.natureza === 'receber');
    const saidasRealizadas = somaRealizado((l) => l.natureza === 'pagar');

    return {
      entradasPrevistas,
      saidasPrevistas,
      saldoPrevisto: entradasPrevistas - saidasPrevistas,
      entradasRealizadas,
      saidasRealizadas,
      saldoRealizado: entradasRealizadas - saidasRealizadas,
    };
  }, [linhas, realizadas]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, { nome: string; entrada: number; saida: number }>();

    for (const l of linhas ?? []) {
      const nome = l.categorias_financeiras?.nome ?? 'Sem categoria';
      const atual = mapa.get(nome) ?? { nome, entrada: 0, saida: 0 };
      if (l.natureza === 'receber') atual.entrada += Number(l.valor);
      else atual.saida += Number(l.valor);
      mapa.set(nome, atual);
    }

    return [...mapa.values()].sort((a, b) => b.entrada + b.saida - (a.entrada + a.saida));
  }, [linhas]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        titulo="Fluxo de Caixa"
        hint="Quanto entra e quanto sai no período. Os dois blocos olham datas diferentes de propósito: Previsto conta o que VENCE no período, Realizado conta o que foi PAGO no período. Uma conta que venceu em janeiro e você pagou em março entra no previsto de janeiro e no realizado de março — que é onde o dinheiro saiu de verdade."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="de">De</Label>
          <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-auto" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-auto" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Realizado — o dinheiro que se moveu neste período
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Indicador rotulo="Entrou" valor={moeda(resumo.entradasRealizadas)} tom="positivo" />
              <Indicador rotulo="Saiu" valor={moeda(resumo.saidasRealizadas)} tom="negativo" />
              <Indicador
                rotulo="Saldo"
                valor={moeda(resumo.saldoRealizado)}
                tom={resumo.saldoRealizado >= 0 ? 'positivo' : 'negativo'}
              />
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Previsto — o que vence neste período
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Indicador rotulo="A receber" valor={moeda(resumo.entradasPrevistas)} />
              <Indicador rotulo="A pagar" valor={moeda(resumo.saidasPrevistas)} />
              <Indicador
                rotulo="Saldo projetado"
                valor={moeda(resumo.saldoPrevisto)}
                detalhe="Se tudo for pago e recebido no prazo"
                tom={resumo.saldoPrevisto >= 0 ? 'positivo' : 'alerta'}
              />
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Por categoria
            </h2>
            {porCategoria.length === 0 ? (
              <Vazio
                titulo="Nada lançado neste período"
                descricao="Lance contas a pagar e a receber para o fluxo aparecer aqui."
              />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Entradas</TableHead>
                      <TableHead className="text-right">Saídas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porCategoria.map((c) => {
                      const saldo = c.entrada - c.saida;
                      return (
                        <TableRow key={c.nome}>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">
                            {c.entrada ? moeda(c.entrada) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">
                            {c.saida ? moeda(c.saida) : '—'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium tabular-nums ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                          >
                            {moeda(saldo)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Lançamentos que vencem no período
            </h2>
            {(linhas?.length ?? 0) === 0 ? (
              <Vazio titulo="Nenhum lançamento" />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]" />
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(linhas ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          {l.natureza === 'receber' ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{l.descricao}</TableCell>
                        <TableCell className="tabular-nums">{fmtData(l.vencimento)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {l.status === 'pago' ? `Baixado em ${fmtData(l.pago_em)}` : 'Em aberto'}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${l.natureza === 'receber' ? 'text-emerald-600' : 'text-red-600'}`}
                        >
                          {l.natureza === 'receber' ? '+' : '−'} {moeda(Number(l.valor))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
