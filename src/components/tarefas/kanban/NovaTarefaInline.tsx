import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface PropsNovaTarefaInline {
  /**
   * Cria a tarefa. Não rejeita: erro já vira aviso no `useQuadro`.
   * `false` = o banco recusou: o texto fica na caixa para tentar de novo.
   */
  onCriar: (titulo: string) => Promise<boolean | void>;
  onCancelar: () => void;
}

/**
 * O "+ Adicionar tarefa" do pé da coluna, do jeito do Trello: escreve, Enter,
 * e a caixa continua aberta para a próxima.
 *
 * Por que continua aberta: montar a coluna do Pedro é digitar oito tarefas em
 * seguida. Fechar a cada uma obrigaria a clicar de novo oito vezes.
 *
 * Enter cria, Shift+Enter quebra linha (título comprido), Esc fecha. Sair da
 * caixa com ela vazia também fecha — clicar fora é o jeito natural de desistir.
 */
export function NovaTarefaInline({ onCriar, onCancelar }: PropsNovaTarefaInline) {
  const [titulo, setTitulo] = useState('');
  const [criando, setCriando] = useState(false);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    caixa.current?.focus();
  }, []);

  const criar = async () => {
    const limpo = titulo.trim();
    if (!limpo || criando) return;
    setCriando(true);
    const gravou = await onCriar(limpo);
    if (gravou !== false) setTitulo('');
    setCriando(false);
    caixa.current?.focus();
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Durante a composição de acento (teclado de celular, IME), o Enter
    // confirma a letra, não a tarefa.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void criar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelar();
    }
  };

  const aoSair = (e: FocusEvent<HTMLFormElement>) => {
    // O foco indo para o botão "Adicionar tarefa" ou o "X" não é desistir.
    if (formulario.current?.contains(e.relatedTarget as Node | null)) return;
    if (!titulo.trim() && !criando) onCancelar();
  };

  return (
    <form
      ref={formulario}
      onSubmit={(e) => {
        e.preventDefault();
        void criar();
      }}
      onBlur={aoSair}
      className="space-y-2 rounded-lg border border-primary/30 bg-card p-2 shadow-sm"
    >
      <Textarea
        ref={caixa}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={aoTeclar}
        // Senão o arrasto do quadro pegaria o clique para selecionar o texto.
        onPointerDown={(e) => e.stopPropagation()}
        rows={2}
        // O banco recusa título com mais de 200 letras: a caixa para de
        // aceitar antes, em vez de a pessoa descobrir pelo aviso de erro.
        maxLength={200}
        placeholder="O que precisa ser feito?"
        aria-label="Título da nova tarefa"
        className="min-h-[60px] resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm" className="h-8" disabled={!titulo.trim() || criando}>
          <Plus className="mr-1 h-4 w-4" />
          {criando ? 'Adicionando...' : 'Adicionar tarefa'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground"
          onClick={onCancelar}
          aria-label="Fechar sem adicionar"
          title="Fechar sem adicionar (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>
        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">Enter adiciona</span>
      </div>
    </form>
  );
}
