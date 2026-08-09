import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Senha de desenho do Android — a grade de 9 pontos.
 *
 * Por que não é só um campo de texto: é assim que a maior parte dos clientes
 * de Android informa a senha. Pedir para descrever ("um L invertido", "começa
 * em cima à esquerda") gera erro de interpretação, e senha errada na bancada
 * significa aparelho parado até alguém ligar para o cliente.
 *
 * Guarda como a sequência dos pontos numerados de 1 a 9, ex.: "1-2-3-6-9".
 * Texto simples, que aparece igual no laudo, no banco e em qualquer relatório
 * — e que o técnico consegue ler mesmo sem esta tela na frente.
 *
 * Funciona no mouse e no toque: no balcão o atendimento costuma ser no
 * celular ou tablet.
 */

interface Props {
  valor: string;
  onChange: (sequencia: string) => void;
  disabled?: boolean;
}

/** Posição dos pontos, 1 a 9, lidos da esquerda para a direita e de cima para baixo. */
const PONTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function SenhaPadrao({ valor, onChange, disabled }: Props) {
  const sequencia = valor ? valor.split('-').filter(Boolean).map(Number) : [];
  const [desenhando, setDesenhando] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);

  const marcar = (ponto: number) => {
    if (disabled) return;
    // Um ponto não entra duas vezes: é como o próprio Android trata.
    if (sequencia.includes(ponto)) return;
    onChange([...sequencia, ponto].join('-'));
  };

  const comecar = (ponto: number) => {
    if (disabled) return;
    setDesenhando(true);
    onChange(String(ponto));
  };

  /** Arrastar com o dedo: descobre por cima de qual ponto o toque está. */
  const aoMoverDedo = (e: React.TouchEvent) => {
    if (!desenhando || disabled) return;
    const toque = e.touches[0];
    const alvo = document.elementFromPoint(toque.clientX, toque.clientY);
    const ponto = alvo?.getAttribute('data-ponto');
    if (ponto) marcar(Number(ponto));
  };

  const limpar = () => onChange('');

  return (
    <div className="space-y-3">
      <div
        ref={areaRef}
        className="mx-auto grid w-fit grid-cols-3 gap-6 rounded-lg border bg-muted/30 p-6"
        onMouseUp={() => setDesenhando(false)}
        onMouseLeave={() => setDesenhando(false)}
        onTouchEnd={() => setDesenhando(false)}
        onTouchMove={aoMoverDedo}
      >
        {PONTOS.map((ponto) => {
          const ordem = sequencia.indexOf(ponto);
          const marcado = ordem >= 0;
          return (
            <button
              key={ponto}
              type="button"
              data-ponto={ponto}
              disabled={disabled}
              onMouseDown={() => comecar(ponto)}
              onMouseEnter={() => desenhando && marcar(ponto)}
              onTouchStart={() => comecar(ponto)}
              onClick={() => !desenhando && marcar(ponto)}
              aria-label={`Ponto ${ponto}${marcado ? `, ${ordem + 1}º da sequência` : ''}`}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                marcado
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/30 bg-background hover:border-primary/50',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              {/* Mostra a ordem, não o número do ponto: é o que o técnico
                  precisa saber para repetir o desenho. */}
              {marcado ? ordem + 1 : ''}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3">
        <span className="text-sm text-muted-foreground">
          {sequencia.length === 0
            ? 'Clique ou arraste nos pontos'
            : `Sequência: ${sequencia.join(' → ')}`}
        </span>
        {sequencia.length > 0 && !disabled && (
          <Button type="button" variant="outline" size="sm" onClick={limpar}>
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Só leitura, para a ficha da OS: mostra o desenho sem deixar alterar. */
export function SenhaPadraoLeitura({ valor }: { valor: string }) {
  const sequencia = valor ? valor.split('-').filter(Boolean).map(Number) : [];
  if (sequencia.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="inline-grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2">
      {PONTOS.map((ponto) => {
        const ordem = sequencia.indexOf(ponto);
        return (
          <div
            key={ponto}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold',
              ordem >= 0
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/30'
            )}
          >
            {ordem >= 0 ? ordem + 1 : ''}
          </div>
        );
      })}
    </div>
  );
}
