import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { moeda } from '@/lib/format';
import type { PontoSerie } from '@/lib/serie';

/**
 * A linha do tempo do período: uma barra por dia, semana ou mês.
 *
 * Os painéis só tinham números do momento ("hoje", "esta semana"). Um número
 * sozinho não mostra ritmo: R$ 8.000 no mês pode ser uma semana boa e três
 * paradas, ou quatro semanas iguais — e a decisão de quem gerencia é
 * diferente em cada caso.
 *
 * Barra em vez de linha de propósito: o que se lê aqui é "quanto entrou em
 * cada pedaço", que é uma soma fechada por período, não uma medição contínua.
 */

const EIXO_COMPACTO = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function GraficoEvolucao({
  titulo,
  descricao,
  serie,
  carregando,
  rotuloValor = 'Faturamento',
  formatarValor = moeda,
}: {
  titulo: string;
  descricao: string;
  serie: PontoSerie[];
  carregando?: boolean;
  rotuloValor?: string;
  /** Como mostrar o valor no balão. Dinheiro por padrão; o Estoque manda peças. */
  formatarValor?: (v: number) => string;
}) {
  const temMovimento = serie.some((p) => p.valor !== 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <div className="flex h-[260px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !temMovimento ? (
          <div className="flex h-[260px] flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum movimento no período escolhido.
            </p>
          </div>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  // Em período longo o eixo fica ilegível com todos os rótulos;
                  // o recharts esconde sozinho o que não cabe.
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  className="text-xs"
                  tickFormatter={(v: number) => EIXO_COMPACTO.format(v)}
                />
                <Tooltip
                  formatter={(v: number) => [formatarValor(v), rotuloValor]}
                  labelFormatter={(l: string) => l}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
