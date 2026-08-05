/**
 * Formatação para pt-BR. Um lugar só — sem `toFixed(2)` espalhado pelas telas.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function moeda(valor: number | null | undefined): string {
  return MOEDA.format(valor ?? 0);
}

/**
 * Formata uma data.
 *
 * Cuidado sutil: uma coluna DATE do Postgres chega como '2026-08-01'. Passar
 * isso direto para `new Date()` faz o JavaScript interpretar como UTC e, no
 * fuso do Brasil, exibir o dia ANTERIOR. Por isso datas puras são montadas
 * componente a componente, em horário local.
 */
export function data(valor: string | Date | null | undefined): string {
  if (!valor) return '—';

  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [ano, mes, dia] = valor.split('-').map(Number);
    return DATA.format(new Date(ano, mes - 1, dia));
  }

  return DATA.format(new Date(valor));
}

export function dataHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  return DATA_HORA.format(new Date(valor));
}

/** Data de hoje em 'YYYY-MM-DD', em horário local. */
export function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Primeiro e último dia do mês corrente, em 'YYYY-MM-DD'. */
export function mesCorrente(): { inicio: string; fim: string } {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { inicio: fmt(new Date(ano, mes, 1)), fim: fmt(new Date(ano, mes + 1, 0)) };
}

/** Dias entre hoje e uma data. Negativo = já passou. */
export function diasAte(dataISO: string): number {
  const [a, m, d] = dataISO.split('-').map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}
