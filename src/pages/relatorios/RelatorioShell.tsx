import { useState, type ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { mesCorrente } from '@/lib/format';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/**
 * Esqueleto comum dos relatórios.
 *
 * Os quatro relatórios diferem só na consulta e nas colunas. Filtro de período,
 * totalização e exportação CSV vivem aqui — escritos uma vez.
 */

export interface Coluna<T> {
  chave: string;
  titulo: string;
  /** Valor exibido na célula. */
  render: (linha: T) => ReactNode;
  /** Valor plano usado no CSV (sem JSX). */
  texto: (linha: T) => string | number;
  alinhar?: 'esquerda' | 'direita';
  /** Se informado, o rodapé mostra a soma desta coluna. */
  somar?: (linha: T) => number;
  formatarTotal?: (total: number) => string;
}

export interface Periodo {
  de: string;
  ate: string;
}

/**
 * Gera e baixa um CSV.
 *
 * Separador é ponto e vírgula e o arquivo leva BOM UTF-8 — sem isso o Excel
 * em português abre tudo numa coluna só e quebra os acentos.
 */
function baixarCSV<T>(nome: string, colunas: Coluna<T>[], linhas: T[]) {
  // Um número negativo formatado pelo próprio relatório (ex.: "-1.234,56", um
  // saldo negativo) começa com "-" mas não é fórmula nenhuma — não precisa do
  // prefixo de proteção abaixo.
  const numeroNegativoPuro = /^-[\d.,]+$/;

  const escapar = (v: string | number) => {
    let s = String(v ?? '');
    // Neutraliza CSV/Formula Injection: se a célula começa com =, +, -, @, o
    // Excel pode interpretar o conteúdo como fórmula e executá-la ao abrir o
    // arquivo (ex.: nome de cliente ou descrição de título cadastrado como
    // `=cmd|'/c calc'!A1`). Prefixa com aspas simples pra forçar texto —
    // mesma mitigação usada pelo Google Sheets/Excel.
    if (/^[=+\-@]/.test(s) && !numeroNegativoPuro.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const conteudo = [
    colunas.map((c) => escapar(c.titulo)).join(';'),
    ...linhas.map((l) => colunas.map((c) => escapar(c.texto(l))).join(';')),
  ].join('\r\n');

  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const inicial = mesCorrente();
  const [periodo, setPeriodo] = useState<Periodo>({ de: inicial.inicio, ate: inicial.fim });
  return [periodo, setPeriodo];
}

export function FiltroPeriodo({
  periodo,
  onChange,
}: {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="rel-de">De</Label>
        <Input
          id="rel-de"
          type="date"
          className="w-auto"
          value={periodo.de}
          onChange={(e) => onChange({ ...periodo, de: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rel-ate">Até</Label>
        <Input
          id="rel-ate"
          type="date"
          className="w-auto"
          value={periodo.ate}
          onChange={(e) => onChange({ ...periodo, ate: e.target.value })}
        />
      </div>
    </div>
  );
}

export function RelatorioShell<T>({
  titulo,
  hint,
  arquivo,
  colunas,
  dados,
  isLoading,
  periodo,
  onPeriodoChange,
  indicadores,
  vazio,
  ocultarPeriodo,
  rotuloTotal,
}: {
  titulo: string;
  hint: string;
  arquivo: string;
  colunas: Coluna<T>[];
  dados: T[];
  isLoading: boolean;
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
  indicadores?: ReactNode;
  vazio?: string;
  /** Relatórios de posição atual (estoque) não têm recorte de período. */
  ocultarPeriodo?: boolean;
  /**
   * Texto da primeira célula do rodapé de totais. O padrão é "Total".
   *
   * Existe por causa de um achado de 18/08: em Vendas e Financeiro o rodapé
   * somava a coluna inteira (incluindo linhas CANCELADAS) enquanto o
   * indicador "Faturamento" logo acima excluía os cancelados — dois números
   * diferentes na mesma tela, sem nada explicando a diferença. Esses
   * relatórios passaram a zerar o cancelado na função `somar`, e este rótulo
   * deixa o critério visível em vez de o leitor ter que adivinhar.
   */
  rotuloTotal?: string;
}) {
  const { can } = useAuth();
  const temTotais = colunas.some((c) => c.somar);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        titulo={titulo}
        hint={hint}
        acoes={
          can(PERMISSIONS.REPORTS_EXPORT) && (
            <Button
              variant="outline"
              disabled={dados.length === 0}
              onClick={() => baixarCSV(`${arquivo}_${periodo.de}_a_${periodo.ate}`, colunas, dados)}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          )
        }
      />

      {!ocultarPeriodo && (
        <div className="mb-6">
          <FiltroPeriodo periodo={periodo} onChange={onPeriodoChange} />
        </div>
      )}

      {/* 4 colunas em tela grande: a conferência de caixa passou a ter oito ou
          mais indicadores, e em 3 colunas eles empurravam a tabela para baixo
          da dobra — quem confere caixa precisa dos dois na mesma tela. */}
      {indicadores && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{indicadores}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : dados.length === 0 ? (
        <Vazio
          titulo="Nada encontrado no período"
          descricao={vazio ?? 'Experimente ampliar as datas do filtro.'}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {colunas.map((c) => (
                  <TableHead key={c.chave} className={c.alinhar === 'direita' ? 'text-right' : ''}>
                    {c.titulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.map((linha, i) => (
                <TableRow key={i}>
                  {colunas.map((c) => (
                    <TableCell
                      key={c.chave}
                      className={c.alinhar === 'direita' ? 'text-right tabular-nums' : ''}
                    >
                      {c.render(linha)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>

            {temTotais && (
              <TableFooter>
                <TableRow>
                  {colunas.map((c, i) => {
                    if (!c.somar) {
                      return (
                        <TableCell key={c.chave}>
                          {i === 0 ? rotuloTotal ?? 'Total' : ''}
                        </TableCell>
                      );
                    }
                    const total = dados.reduce((acc, l) => acc + c.somar!(l), 0);
                    return (
                      <TableCell key={c.chave} className="text-right font-bold tabular-nums">
                        {c.formatarTotal ? c.formatarTotal(total) : total}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </div>
  );
}
