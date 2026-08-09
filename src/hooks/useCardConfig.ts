import { useCallback, useEffect, useState } from 'react';

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

function ler(): CardConfig {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    return salvo ? { ...DEFAULT_CONFIG, ...JSON.parse(salvo) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Quem está usando a configuração agora.
 *
 * -----------------------------------------------------------------------------
 * O bug que isto conserta (achado pelo Felipe em 09/08)
 * -----------------------------------------------------------------------------
 * "Ativei todas as configurações de cartão e não apareceu no card do Kanban."
 *
 * Cada componente que chamava o hook criava a SUA cópia da configuração no
 * próprio estado. O diálogo de configuração salvava no navegador e atualizava a
 * cópia dele; o Kanban tinha outra cópia, que ninguém avisava. Só depois de
 * recarregar a página a mudança aparecia — e ninguém recarrega a página para
 * conferir se um ajuste funcionou: conclui que não funcionou.
 *
 * Agora existe uma lista de interessados. Quem salva avisa todo mundo na mesma
 * hora, e o cartão muda enquanto o diálogo ainda está aberto.
 */
const inscritos = new Set<(c: CardConfig) => void>();

export function useCardConfig() {
  const [config, setConfig] = useState<CardConfig>(ler);

  useEffect(() => {
    inscritos.add(setConfig);
    // Relê ao montar: outra aba pode ter mudado a configuração enquanto esta
    // tela estava fechada.
    setConfig(ler());
    return () => {
      inscritos.delete(setConfig);
    };
  }, []);

  const updateConfig = useCallback((nova: CardConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nova));
    inscritos.forEach((avisar) => avisar(nova));
  }, []);

  const resetConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    inscritos.forEach((avisar) => avisar(DEFAULT_CONFIG));
  }, []);

  return { config, updateConfig, resetConfig };
}
