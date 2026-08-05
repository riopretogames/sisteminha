import { useState, useCallback } from 'react';

export interface CardConfig {
  numero_os: boolean;
  cliente_nome: boolean;
  modelo: boolean;
  numero_serie: boolean;
  defeito: boolean;
  status: boolean;
  valor_orcamento: boolean;
  data_entrada: boolean;
  tecnico: boolean;
  prioridade: boolean;
}

const STORAGE_KEY = 'os_card_config';

const DEFAULT_CONFIG: CardConfig = {
  numero_os: true,
  cliente_nome: true,
  modelo: true,
  numero_serie: false,
  defeito: true,
  status: true,
  valor_orcamento: true,
  data_entrada: false,
  tecnico: false,
  prioridade: true,
};

export function useCardConfig() {
  const [config, setConfig] = useState<CardConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const updateConfig = useCallback((newConfig: CardConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { config, updateConfig, resetConfig };
}
