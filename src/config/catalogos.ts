import type { IconName } from './icons';

/**
 * CATÁLOGOS — as "tabelas de apoio" do sistema.
 *
 * -----------------------------------------------------------------------------
 * O problema que isto resolve
 * -----------------------------------------------------------------------------
 * No OK Cells existem hoje ~12 telas de cadastro que são a MESMA tela: uma lista
 * de descrições que podem ser ativadas ou desativadas. Cores, Marcas, Condições,
 * Grades, Memória Interna, Grupo de Produtos, Tipo de Peças, Origem da Venda,
 * Origem do Cliente, Motivos de Compra, Checklist de defeitos e Propriedades do
 * cliente — todas iguais, todas mantidas separadamente.
 *
 * Aqui elas são DADO, não código. Existe uma tabela no banco (`catalogos`) e uma
 * tela genérica no front. Criar um catálogo novo é acrescentar um item nesta
 * lista — sem migration, sem componente novo, sem rota nova.
 *
 * -----------------------------------------------------------------------------
 * Como ler cada campo
 * -----------------------------------------------------------------------------
 * tipo      → identificador técnico. É o que vai gravado na coluna `tipo`.
 *             NUNCA mude depois que houver dado gravado.
 * label     → nome no plural, como aparece pro usuário.
 * singular  → usado nos botões ("Nova Cor", "Novo Motivo").
 * genero    → 'f' ou 'm'. Só serve pra escrever "Nova Cor" e "Novo Motivo"
 *             corretamente, sem gambiarra de concordância na interface.
 * hint      → explicação em português leigo. Aparece embaixo do título da tela.
 *             Escreva pensando em quem nunca usou ERP.
 * exemplo   → um exemplo concreto, mostrado no campo vazio. Ajuda mais que
 *             qualquer manual.
 * grupo     → em qual aba da tela "Listas do Sistema" o catálogo aparece.
 * permiteP  → se o catálogo aceita marcar um item como "padrão" (o pré-
 *             selecionado). Ex.: Origem da Venda tem "Balcão" como padrão.
 */

export type CatalogoGrupo = 'produto' | 'cliente' | 'venda' | 'assistencia';

export interface CatalogoDef {
  tipo: string;
  label: string;
  singular: string;
  genero: 'f' | 'm';
  hint: string;
  exemplo: string;
  grupo: CatalogoGrupo;
  icon: IconName;
  permitePadrao?: boolean;
}

export const CATALOGO_GRUPOS: Record<CatalogoGrupo, { label: string; hint: string }> = {
  produto: {
    label: 'Produto e Estoque',
    hint: 'Listas usadas na hora de cadastrar um produto ou uma peça.',
  },
  cliente: {
    label: 'Cliente',
    hint: 'Listas usadas na ficha do cliente — de onde ele veio e por que comprou.',
  },
  venda: {
    label: 'Venda',
    hint: 'Listas usadas no PDV e no fechamento da venda.',
  },
  assistencia: {
    label: 'Assistência Técnica',
    hint: 'Listas usadas na abertura de OS e no laudo.',
  },
};

export const CATALOGOS: CatalogoDef[] = [
  /* ── Produto e estoque ─────────────────────────────────────────────────── */
  {
    tipo: 'marca',
    label: 'Marcas',
    singular: 'Marca',
    genero: 'f',
    grupo: 'produto',
    icon: 'brand',
    hint: 'Fabricante do produto. É o que aparece antes do modelo na hora de vender.',
    exemplo: 'Sony, Microsoft, Nintendo, Samsung, Xiaomi',
  },
  {
    tipo: 'modelo',
    label: 'Modelos',
    singular: 'Modelo',
    genero: 'm',
    grupo: 'produto',
    icon: 'package',
    hint: 'Modelo específico dentro de uma marca. Use o nome comercial, do jeito que o cliente fala.',
    exemplo: 'PlayStation 5 Slim, Xbox Series X, Switch OLED',
  },
  {
    tipo: 'grupo_produto',
    label: 'Grupos de Produto',
    singular: 'Grupo',
    genero: 'm',
    grupo: 'produto',
    icon: 'boxes',
    hint: 'Categoria ampla pra organizar o estoque e os relatórios. Pense em "prateleira da loja".',
    exemplo: 'Console, Jogo, Controle, Celular, Informática, Peça',
  },
  {
    tipo: 'cor',
    label: 'Cores',
    singular: 'Cor',
    genero: 'f',
    grupo: 'produto',
    icon: 'package',
    hint: 'Cor do produto. Importante em console e celular, onde a mesma peça tem várias cores.',
    exemplo: 'Preto, Branco, Azul, Vermelho, Grafite',
  },
  {
    tipo: 'condicao',
    label: 'Condições',
    singular: 'Condição',
    genero: 'f',
    grupo: 'produto',
    icon: 'shield',
    hint: 'Estado de conservação. É o que separa um produto novo de um seminovo na vitrine e no preço.',
    exemplo: 'Novo, Seminovo, Usado, Vitrine, Com avaria',
  },
  {
    tipo: 'memoria',
    label: 'Memória / Capacidade',
    singular: 'Capacidade',
    genero: 'f',
    grupo: 'produto',
    icon: 'boxes',
    hint: 'Armazenamento do aparelho. Console e celular do mesmo modelo mudam de preço por causa disso.',
    exemplo: '64GB, 128GB, 512GB, 1TB',
  },
  {
    tipo: 'grade',
    label: 'Grades',
    singular: 'Grade',
    genero: 'f',
    grupo: 'produto',
    icon: 'boxes',
    hint: 'Variação livre do produto, quando cor e capacidade não dão conta. Use só se precisar.',
    exemplo: 'Edição Limitada, Bundle com jogo, Somente o aparelho',
  },
  {
    tipo: 'tipo_peca',
    label: 'Tipos de Peça',
    singular: 'Tipo de Peça',
    genero: 'm',
    grupo: 'produto',
    icon: 'wrench',
    hint: 'Classificação da peça de reposição usada na bancada.',
    exemplo: 'Tela, Bateria, Conector de carga, Placa, Analógico, Cooler',
  },
  {
    tipo: 'localizacao',
    label: 'Localizações',
    singular: 'Localização',
    genero: 'f',
    grupo: 'produto',
    icon: 'package',
    hint: 'Onde o item está fisicamente. Serve pra achar o produto sem perguntar pra ninguém.',
    exemplo: 'Vitrine, Depósito, Bancada, Sucata',
  },

  /* ── Cliente ───────────────────────────────────────────────────────────── */
  {
    tipo: 'origem_cliente',
    label: 'Origens do Cliente',
    singular: 'Origem',
    genero: 'f',
    grupo: 'cliente',
    icon: 'users',
    hint: 'Por onde essa pessoa chegou até a loja pela primeira vez. É o que mostra qual mídia traz cliente.',
    exemplo: 'Instagram, WhatsApp, Google, Indicação, Lojista',
    permitePadrao: true,
  },
  {
    tipo: 'motivo_compra',
    label: 'Motivos de Compra',
    singular: 'Motivo',
    genero: 'm',
    grupo: 'cliente',
    icon: 'target',
    hint: 'Por que o cliente fechou com a gente. Alimenta a inteligência comercial.',
    exemplo: 'Indicação pessoal, Preço, Garantia, Atendimento, Disponibilidade imediata',
  },
  {
    tipo: 'tag_cliente',
    label: 'Tags de Cliente',
    singular: 'Tag',
    genero: 'f',
    grupo: 'cliente',
    icon: 'users',
    hint: 'Marcação rápida na ficha. Aparece como etiqueta colorida na listagem.',
    exemplo: 'VIP, Fiel, Atacado, Atenção',
  },

  /* ── Venda ─────────────────────────────────────────────────────────────── */
  {
    tipo: 'origem_venda',
    label: 'Origens da Venda',
    singular: 'Origem',
    genero: 'f',
    grupo: 'venda',
    icon: 'cart',
    hint: 'Canal em que ESTA venda aconteceu. Diferente da origem do cliente: o cliente pode ter vindo do Instagram e comprar no balcão.',
    exemplo: 'Balcão, Site, WhatsApp, Instagram, Shopee',
    permitePadrao: true,
  },

  /* ── Assistência técnica ───────────────────────────────────────────────────
   *
   * A assistência tem cadastro PRÓPRIO de equipamento, marca, modelo, cor e
   * memória — separado do de produto/estoque. Regra do Felipe (09/08):
   * "os cadastros da ordem de serviço são diferentes dos cadastros de venda".
   *
   * O motivo é operacional, não organizacional: na bancada entra aparelho de
   * marca que a loja nunca vendeu (e nunca vai vender). Se fosse a mesma lista,
   * a marca de estoque encheria de fabricante que não está à venda, e quem
   * cadastra produto teria que garimpar no meio disso.
   */
  {
    tipo: 'os_equipamento',
    label: 'Equipamentos (Assistência)',
    singular: 'Equipamento',
    genero: 'm',
    grupo: 'assistencia',
    icon: 'wrench',
    hint: 'Que tipo de aparelho entra na bancada. Não confundir com Grupo de Produto, que é prateleira de loja.',
    exemplo: 'Celular, Video game, Controle, Notebook, Tablet, Caixa de som',
  },
  {
    tipo: 'os_marca',
    label: 'Marcas (Assistência)',
    singular: 'Marca',
    genero: 'f',
    grupo: 'assistencia',
    icon: 'brand',
    hint: 'Fabricante do aparelho que chega para conserto — inclusive marca que a loja não vende.',
    exemplo: 'Samsung, Apple, Xiaomi, Motorola, Sony, Microsoft, Nintendo',
  },
  {
    tipo: 'os_modelo',
    label: 'Modelos (Assistência)',
    singular: 'Modelo',
    genero: 'm',
    grupo: 'assistencia',
    icon: 'package',
    hint: 'Modelo do aparelho que chega para conserto. Use o nome do jeito que o cliente fala.',
    exemplo: 'iPhone 13, Galaxy A54, PS5 Slim, Xbox Series S, Redmi Note 12',
  },
  {
    tipo: 'os_cor',
    label: 'Cores (Assistência)',
    singular: 'Cor',
    genero: 'f',
    grupo: 'assistencia',
    icon: 'package',
    hint: 'Cor do aparelho recebido. Ajuda a não trocar dois aparelhos iguais na bancada.',
    exemplo: 'Preto, Branco, Azul, Grafite, Dourado, Rosa',
  },
  {
    tipo: 'os_memoria',
    label: 'Memórias (Assistência)',
    singular: 'Memória',
    genero: 'f',
    grupo: 'assistencia',
    icon: 'boxes',
    hint: 'Capacidade do aparelho recebido. Entra no laudo e evita discussão na devolução.',
    exemplo: '64GB, 128GB, 256GB, 512GB, 1TB',
  },
  {
    tipo: 'checklist_defeito',
    label: 'Checklist de Defeitos',
    singular: 'Defeito',
    genero: 'm',
    grupo: 'assistencia',
    icon: 'clipboard',
    hint: 'Lista de sintomas marcados na entrada do aparelho. É o que o cliente relata, não o diagnóstico.',
    exemplo: 'Não liga, Tela trincada, Não carrega, Analógico com defeito, Luz vermelha',
  },
  {
    tipo: 'acessorio_entrada',
    label: 'Acessórios / Pertences',
    singular: 'Acessório',
    genero: 'm',
    grupo: 'assistencia',
    icon: 'boxes',
    hint: 'O que o cliente deixou junto com o aparelho. Protege a loja na hora da devolução.',
    exemplo: 'Fonte, Cabo, Controle, Caixa, Capinha, Cartão de memória',
  },
  {
    tipo: 'condicao_entrada',
    label: 'Condições de Entrada',
    singular: 'Condição',
    genero: 'f',
    grupo: 'assistencia',
    icon: 'shield',
    hint: 'Estado físico do aparelho quando chegou. Registra marca de uso ANTES do reparo.',
    exemplo: 'Sem avarias, Marcas de uso, Tampa quebrada, Molhado, Já aberto por terceiros',
  },
];

/** Busca a definição de um catálogo pelo `tipo`. */
export function getCatalogoDef(tipo: string): CatalogoDef | undefined {
  return CATALOGOS.find((c) => c.tipo === tipo);
}

/** Catálogos de um grupo, na ordem em que aparecem na tela. */
export function getCatalogosPorGrupo(grupo: CatalogoGrupo): CatalogoDef[] {
  return CATALOGOS.filter((c) => c.grupo === grupo);
}

/** "Nova Cor" / "Novo Motivo" — concordância resolvida em um lugar só. */
export function rotuloNovo(def: CatalogoDef): string {
  return `${def.genero === 'f' ? 'Nova' : 'Novo'} ${def.singular}`;
}
