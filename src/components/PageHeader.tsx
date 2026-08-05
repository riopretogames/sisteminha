import type { ReactNode } from 'react';

/**
 * Cabeçalho padrão de página.
 *
 * O `hint` não é enfeite: em ERP, metade da confusão do usuário vem de não
 * saber para que serve a tela em que está. Toda página nova deve trazer um.
 */
export function PageHeader({
  titulo,
  hint,
  acoes,
}: {
  titulo: string;
  hint?: string;
  acoes?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {hint && <p className="mt-1 max-w-2xl text-muted-foreground">{hint}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}

/** Cartão de indicador. Usado nos dashboards, relatórios e no financeiro. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: 'neutro' | 'positivo' | 'negativo' | 'alerta';
}) {
  const cor = {
    neutro: 'text-foreground',
    positivo: 'text-emerald-600',
    negativo: 'text-red-600',
    alerta: 'text-amber-600',
  }[tom];

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** Estado vazio honesto: diz o que falta e o que fazer. */
export function Vazio({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="rounded-lg border border-dashed py-16 text-center">
      <p className="font-medium">{titulo}</p>
      {descricao && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{descricao}</p>
      )}
    </div>
  );
}
