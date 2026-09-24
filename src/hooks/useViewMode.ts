import { useState, useCallback } from 'react';

export type ViewMode = 'grid' | 'kanban';

/**
 * Lembra no navegador a visão escolhida (grade/tabela ou quadro).
 *
 * `storageKey` existe porque a tela de OS e os quadros de tarefas usam o
 * mesmo alternador: com uma chave só, quem trocasse o quadro de tarefas para
 * Tabela abriria a OS em grade sem ter pedido. O padrão continua sendo o da
 * OS, então a tela de OS não precisou mudar.
 */
export function useViewMode(defaultMode: ViewMode = 'grid', storageKey = 'os_view_mode') {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return (saved === 'grid' || saved === 'kanban') ? saved : defaultMode;
    } catch {
      return defaultMode;
    }
  });

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      try {
        localStorage.setItem(storageKey, mode);
      } catch {
        // Navegador sem armazenamento (aba anônima bloqueada): a troca vale
        // até fechar a tela, só não é lembrada.
      }
    },
    [storageKey],
  );

  return { viewMode, setViewMode };
}
