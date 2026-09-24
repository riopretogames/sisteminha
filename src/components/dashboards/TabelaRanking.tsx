import type { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { moeda } from '@/lib/format';
import { participacao, type LinhaRanking } from '@/lib/ranking';

/**
 * Tabela de "quem/o quê mais" para os painéis.
 *
 * Existe compartilhada porque Venda e Assistência mostram a mesma coisa com
 * palavras diferentes — vendedor/técnico, produto/equipamento. Duas cópias
 * divergiriam na primeira vez que alguém mexesse só numa.
 *
 * A barra de participação é o ponto da tela: "Ana vendeu R$ 4.000" sozinho não
 * diz nada. "Ana vendeu R$ 4.000, que é 62% de tudo" diz que a loja depende
 * de uma pessoa — e isso é uma informação de gestão, não de vaidade.
 */
export function TabelaRanking({
  titulo,
  descricao,
  linhas,
  rotuloNome,
  rotuloQuantidade,
  rotuloValor,
  vazio,
  icone,
  carregando,
  mostrarParticipacao = true,
  formatarValor = moeda,
  limite = 5,
}: {
  titulo: string;
  descricao: string;
  linhas: LinhaRanking[];
  rotuloNome: string;
  rotuloQuantidade: string;
  rotuloValor: string;
  vazio: string;
  icone: ReactNode;
  carregando?: boolean;
  mostrarParticipacao?: boolean;
  formatarValor?: (v: number) => string;
  limite?: number;
}) {
  const visiveis = linhas.slice(0, limite);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        {carregando ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-muted-foreground/50">{icone}</div>
            <p className="mt-2 text-sm text-muted-foreground">{vazio}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[1%]">#</TableHead>
                <TableHead>{rotuloNome}</TableHead>
                <TableHead className="text-right">{rotuloQuantidade}</TableHead>
                <TableHead className="text-right">{rotuloValor}</TableHead>
                {mostrarParticipacao && (
                  <TableHead className="hidden w-[22%] text-right sm:table-cell">
                    Fatia
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l, i) => {
                const fatia = participacao(l, linhas);
                return (
                  <TableRow key={l.chave}>
                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{l.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantidade}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatarValor(l.valor)}
                    </TableCell>
                    {mostrarParticipacao && (
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-full max-w-[70px] overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(0, Math.min(100, fatia))}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                            {fatia.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Card de número grande, no formato que os painéis já usam.
 *
 * A faixa colorida no topo (`faixa`) vem das classes kpi-* do tema, as mesmas
 * do Dashboard e do painel de Venda — cor montada em pedaço não sobrevive ao
 * Tailwind (ver a regra em lib/cores.ts).
 */
export function CardIndicador({
  titulo,
  valor,
  detalhe,
  icone,
  faixa,
  carregando,
  variacaoPct,
  rotuloComparacao,
  menorEMelhor = false,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icone: ReactNode;
  faixa: string;
  carregando?: boolean;
  /**
   * Quanto o número mudou em relação ao período anterior, em %.
   * `undefined` = a tela não pediu comparação (a chave está desligada).
   * `null` = pediu, mas o período anterior foi zero — não há com o que
   * comparar, e a tela diz isso em vez de inventar "+100%".
   */
  variacaoPct?: number | null;
  /** Com o que estamos comparando: "vs mês anterior", "vs ontem"… */
  rotuloComparacao?: string;
  /**
   * Para número em que SUBIR é ruim (tempo de reparo, por exemplo): a seta
   * continua mostrando a direção, mas a cor inverte — subir fica vermelho.
   * Achado da revisão de 23/09: o tempo médio de reparo que piorou aparecia
   * em verde, comemorando atraso.
   */
  menorEMelhor?: boolean;
}) {
  const melhorou = variacaoPct != null && (menorEMelhor ? variacaoPct <= 0 : variacaoPct >= 0);
  return (
    <Card className="overflow-hidden">
      <div className={`${faixa} p-1`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <span className="text-muted-foreground">{icone}</span>
      </CardHeader>
      <CardContent>
        <div className="truncate text-2xl font-bold">{carregando ? '—' : valor}</div>
        <p className="text-xs text-muted-foreground">
          {carregando ? 'Carregando…' : detalhe}
        </p>
        {!carregando && variacaoPct !== undefined && (
          <div className="mt-1 flex items-center text-xs">
            {variacaoPct === null ? (
              <span className="text-muted-foreground">
                Sem {rotuloComparacao?.replace(/^vs /, '') ?? 'período anterior'} para comparar
              </span>
            ) : (
              <>
                {variacaoPct >= 0 ? (
                  <ArrowUpRight className={`mr-1 h-4 w-4 ${melhorou ? 'text-green-500' : 'text-red-500'}`} />
                ) : (
                  <ArrowDownRight className={`mr-1 h-4 w-4 ${melhorou ? 'text-green-500' : 'text-red-500'}`} />
                )}
                <span className={melhorou ? 'text-green-500' : 'text-red-500'}>
                  {variacaoPct >= 0 ? '+' : ''}
                  {variacaoPct.toFixed(0)}%
                </span>
                <span className="ml-1 text-muted-foreground">{rotuloComparacao}</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
