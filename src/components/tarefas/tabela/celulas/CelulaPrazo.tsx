import { useEffect, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { data } from '@/lib/format';
import { ehRecorrente, estaFeita, statusNoDia } from '@/lib/tarefas';
import { cn } from '@/lib/utils';
import type { AcoesDoQuadro, Tarefa } from '@/types/tarefas';

/**
 * Data completa e com ano de verdade. O campo de data do navegador avisa a
 * cada tecla: digitando "2026" no ano, ele passa por 0002, 0020 e 0202 antes.
 * Gravar cada um desses deixaria a tarefa "atrasada há 2 mil anos" por um
 * instante para quem estiver olhando o quadro.
 */
function dataPlausivel(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ano = Number(v.slice(0, 4));
  return ano >= 2000 && ano <= 2099;
}

/**
 * Prazo da tarefa avulsa. Vencido e sem concluir fica vermelho (é o
 * "Atrasada" do status); vence hoje fica âmbar.
 *
 * Tarefa que se repete não tem prazo — ela volta todo dia na frequência dela —,
 * então a célula mostra só um traço. Se uma recorrente tiver prazo gravado de
 * antes, ele continua aparecendo, para dar para apagar.
 */
export function CelulaPrazo({
  tarefa,
  hojeISO,
  podeEditar,
  acoes,
}: {
  tarefa: Tarefa;
  hojeISO: string;
  podeEditar: boolean;
  acoes: Pick<AcoesDoQuadro, 'atualizarTarefa'>;
}) {
  const salvo = tarefa.prazo ?? '';
  const [valor, setValor] = useState(salvo);
  const [editando, setEditando] = useState(false);
  const desistiu = useRef(false);
  const campo = useRef<HTMLInputElement>(null);

  // Outra pessoa mudou o prazo (a tela recarrega a cada 30 s): acompanha.
  useEffect(() => setValor(salvo), [salvo]);

  // Ao clicar em "definir prazo", o campo aparece já com o calendário aberto.
  useEffect(() => {
    if (!editando) return;
    const el = campo.current;
    el?.focus();
    try {
      el?.showPicker?.();
    } catch {
      // Navegador que não deixa abrir o calendário por código: o campo já
      // está com o cursor, a pessoa digita a data.
    }
  }, [editando]);

  const noDia = statusNoDia(tarefa, hojeISO);
  const atrasada = noDia === 'atrasada';
  const venceHoje = !atrasada && salvo === hojeISO && !estaFeita(tarefa);
  const recorrente = ehRecorrente(tarefa);

  const gravar = (v: string) => {
    const novo = v || null;
    if (novo !== (tarefa.prazo ?? null)) acoes.atualizarTarefa({ id: tarefa.id, prazo: novo });
  };

  const tom = cn(
    atrasada && 'bg-red-500/10 font-semibold text-red-600 dark:text-red-400',
    venceHoje && 'font-semibold text-amber-600 dark:text-amber-400',
  );

  if (!salvo && recorrente) {
    return (
      <div className="flex h-10 items-center justify-center text-xs text-muted-foreground/50" title="Tarefa que se repete não tem prazo">
        —
      </div>
    );
  }

  if (!podeEditar) {
    return (
      <div className={cn('flex h-10 items-center justify-center px-2 text-xs', tom)}>
        {salvo ? data(salvo) : <span className="text-muted-foreground/60">—</span>}
      </div>
    );
  }

  if (!salvo && !editando) {
    return (
      <button
        type="button"
        title="Definir prazo"
        aria-label="Definir prazo"
        onClick={() => setEditando(true)}
        className="group/prazo flex h-10 w-full items-center justify-center transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover/prazo:text-primary" />
      </button>
    );
  }

  return (
    <input
      ref={campo}
      type="date"
      aria-label="Prazo"
      title={atrasada ? 'Prazo vencido' : venceHoje ? 'Vence hoje' : 'Prazo'}
      value={valor}
      onChange={(e) => {
        const v = e.target.value;
        setValor(v);
        if (dataPlausivel(v)) gravar(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          desistiu.current = true;
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setEditando(false);
        if (desistiu.current) {
          desistiu.current = false;
          setValor(salvo);
          return;
        }
        // Apagar a data só grava ao sair do campo: no meio da digitação o
        // navegador também devolve vazio, e isso não é "tirar o prazo".
        if (valor === '' || dataPlausivel(valor)) gravar(valor);
        else setValor(salvo);
      }}
      className={cn(
        'h-10 w-full bg-transparent px-2 text-center text-xs outline-none transition-colors [color-scheme:light] dark:[color-scheme:dark]',
        'hover:bg-muted/70 focus:bg-background focus:ring-2 focus:ring-inset focus:ring-ring',
        tom,
      )}
    />
  );
}
