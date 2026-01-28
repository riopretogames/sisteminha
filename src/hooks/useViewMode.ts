import { useState, useCallback } from 'react';

export type ViewMode = 'grid' | 'kanban';

const STORAGE_KEY = 'os_view_mode';

export function useViewMode(defaultMode: ViewMode = 'grid') {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return (saved === 'grid' || saved === 'kanban') ? saved : defaultMode;
    } catch {
      return defaultMode;
    }
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  return { viewMode, setViewMode };
}
