/**
 * As colunas da Tabela, na ordem do Monday do Felipe.
 *
 * Um lugar só para as larguras porque cada grupo é uma tabela separada, e as
 * colunas precisam cair exatamente umas debaixo das outras de um grupo para o
 * outro — se cada grupo medisse sozinho, "Status" do grupo do Pedro ficaria
 * torto em relação ao do Gabriel.
 *
 * "Tarefa" não tem largura: ela fica com o espaço que sobrar (o título é o
 * que mais precisa de lugar). As demais têm largura fixa, escrita por extenso
 * para o Tailwind gerar o CSS.
 */
export const COLUNAS_DA_TABELA = [
  { chave: 'tarefa', titulo: 'Tarefa', largura: '' },
  { chave: 'pessoas', titulo: 'Pessoas', largura: 'w-[104px]' },
  { chave: 'prioridade', titulo: 'Prioridade', largura: 'w-[124px]' },
  // Mais larga que prioridade: "Não fazer por enquanto" precisa caber.
  { chave: 'status', titulo: 'Status', largura: 'w-[164px]' },
  { chave: 'frequencia', titulo: 'Frequência', largura: 'w-[156px]' },
  { chave: 'periodo', titulo: 'Período', largura: 'w-[156px]' },
  { chave: 'etiquetas', titulo: 'Etiquetas', largura: 'w-[164px]' },
  { chave: 'prazo', titulo: 'Prazo', largura: 'w-[140px]' },
  { chave: 'checklist', titulo: 'Checklist', largura: 'w-[112px]' },
] as const;

/** Largura mínima do quadro: soma das fixas + um título legível. */
export const LARGURA_MINIMA_DA_TABELA = 'min-w-[1420px]';

/**
 * Classes das células. Toda célula tem fundo de cartão: a tabela é uma folha
 * branca sobre a página, e a coluna "Tarefa" fica presa na esquerda ao rolar
 * para o lado — sem fundo, o texto das outras colunas passaria por baixo dela
 * aparecendo.
 */
export const CELULA =
  'h-10 border-b border-r border-border bg-card p-0 align-middle transition-colors group-hover/linha:bg-muted/50';

/**
 * A coluna "Tarefa", presa na esquerda. A faixa colorida (border-l-4) vem de
 * `estiloDaLista().borda`. O fundo de passar o mouse vai num `div` por dentro,
 * porque aqui o fundo tem que ser sólido (ver CELULA).
 */
export const CELULA_FIXA = 'sticky left-0 z-10 h-10 border-b border-l-4 border-r border-border bg-card p-0 align-middle';
