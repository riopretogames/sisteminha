import { useCallback, useEffect, useRef, useState } from 'react';
import { enterDeveConfirmar } from '@/lib/atalhos';

/**
 * Enter confirma o diálogo. Esc já fecha sozinho.
 *
 * Decisão do Felipe em 23/08: Enter avança, Esc volta. O Esc não precisou de
 * código — os diálogos do sistema já fecham com ele. O Enter, sim: dos 18
 * arquivos com diálogo, só 2 usavam formulário de verdade, então nos outros
 * 16 a tecla não fazia nada.
 *
 * COMO USAR: ponha o `ref` devolvido no `<DialogContent>`.
 *
 *     const ref = useAtalhosDeDialogo({
 *       podeConfirmar: podeSalvar,
 *       onConfirmar: () => salvar.mutate(),
 *     });
 *     <DialogContent ref={ref}> … </DialogContent>
 *
 * O ouvinte fica NO ELEMENTO do diálogo, não na página inteira. Isso resolve
 * de graça o caso de um diálogo abrir outro por cima: o de dentro recebe a
 * tecla primeiro e marca como tratada, então o de fora não confirma junto.
 *
 * ⚠️ POR QUE O REF É UM CALLBACK, E NÃO UM `useRef`
 *
 * A primeira versão usava `useRef` e lia `alvo.current` dentro de um efeito
 * com dependência `[ativo]`. Isso funcionava só nos diálogos que já nascem
 * abertos. Nos que ficam montados com o diálogo FECHADO — que são a maioria,
 * `<Dialog open={estado}>` — o conteúdo ainda não existe no DOM quando o
 * efeito roda: `current` é null, o efeito desiste, e como nada muda a
 * dependência, ele nunca roda de novo. O atalho ficava morto e ninguém
 * percebia, porque não dá erro nenhum: a tecla simplesmente não faz nada.
 *
 * Com callback ref, o React chama a função no instante em que o elemento
 * entra no DOM. Guardar isso em estado faz o efeito rodar aí, e só aí.
 *
 * Quando a ação apaga algo, passe `perigoso: true` — o Enter não dispara e a
 * pessoa precisa clicar. Ver `lib/atalhos.ts` para o porquê de cada recusa.
 */
export function useAtalhosDeDialogo({
  onConfirmar,
  podeConfirmar,
  perigoso = false,
  ativo = true,
}: {
  onConfirmar: () => void;
  podeConfirmar: boolean;
  perigoso?: boolean;
  ativo?: boolean;
}) {
  const [elemento, setElemento] = useState<HTMLDivElement | null>(null);

  // As opções vão para um ref porque mudam a cada tecla digitada
  // (`podeConfirmar` depende do que está preenchido). Sem isso o ouvinte seria
  // desligado e religado a cada letra, e um Enter no meio se perderia.
  const opcoes = useRef({ onConfirmar, podeConfirmar, perigoso });
  opcoes.current = { onConfirmar, podeConfirmar, perigoso };

  useEffect(() => {
    if (!elemento || !ativo) return;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== 'Enter') return;

      // Shift+Enter é quebra de linha em qualquer campo, e as outras
      // combinações são atalhos do navegador. Nenhuma delas é "confirmar".
      if (evento.shiftKey || evento.ctrlKey || evento.altKey || evento.metaKey) return;

      // Repetição por tecla segurada dispararia a ação várias vezes.
      if (evento.repeat) return;

      const foco = evento.target as HTMLElement | null;

      if (
        !enterDeveConfirmar(
          {
            tag: (foco?.tagName ?? '').toLowerCase(),
            tipo: (foco as HTMLInputElement | null)?.type,
            editavel: foco?.isContentEditable === true,
          },
          {
            listaAberta: haListaAberta(),
            podeConfirmar: opcoes.current.podeConfirmar,
            perigoso: opcoes.current.perigoso,
            jaTratado: evento.defaultPrevented,
          },
        )
      ) {
        return;
      }

      // Marca como tratado ANTES de agir: um diálogo por fora que esteja
      // ouvindo o mesmo evento vê `defaultPrevented` e não confirma junto.
      evento.preventDefault();
      opcoes.current.onConfirmar();
    }

    elemento.addEventListener('keydown', aoTeclar);
    return () => elemento.removeEventListener('keydown', aoTeclar);
  }, [elemento, ativo]);

  return useCallback((node: HTMLDivElement | null) => setElemento(node), []);
}

/**
 * Tem alguma lista suspensa aberta na tela?
 *
 * Precisa olhar a página inteira, e não só o diálogo: as listas do sistema são
 * desenhadas fora dele, presas ao corpo da página, para não ficarem cortadas
 * pela borda. Procurar só dentro do diálogo não acharia nenhuma.
 */
function haListaAberta(): boolean {
  return Boolean(
    document.querySelector(
      '[role="listbox"], [role="option"], [data-radix-popper-content-wrapper], [cmdk-list]',
    ),
  );
}
