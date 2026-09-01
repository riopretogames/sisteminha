/**
 * O que a loja exige para abrir uma Ordem de Serviço.
 *
 * Lista ditada pelo Felipe em 27/08, abrindo uma OS de teste: *"só tem
 * aparentemente dois ou três campos obrigatórios"*. Antes disto, a abertura
 * pedia só cliente e defeito — dava para registrar um aparelho sem marca, sem
 * modelo, sem número de série e sem prazo, e é justamente esse o registro que
 * não serve para nada quando o cliente volta.
 *
 * Por que a regra mora aqui, e não espalhada pelos `if` da tela:
 *
 *   • ela é testável sem abrir o navegador;
 *   • ela VIROU configuração em 30/08, e a previsão se pagou: a lista deixou
 *     de ser fixa e passou a vir de Configurações > Campos Obrigatórios,
 *     mexendo só neste arquivo. Sem `exigidos`, vale o padrão de fábrica
 *     (`src/config/camposObrigatorios.ts`), que é a lista de 27/08.
 *
 * O TÉCNICO fica de fora do padrão de propósito: quem recebe no balcão quase
 * nunca sabe quem vai consertar. A loja que quiser exigir agora pode.
 *
 * ⚠️ CAMPO NO CATÁLOGO SEM `if` AQUI É CHAVINHA QUE NÃO FAZ NADA. Achado na
 * revisão de 01/09: cinco campos (cor, memória, acessórios, condições de
 * entrada e técnico) apareciam em Configurações > Campos Obrigatórios, a loja
 * ligava, salvava — e o balcão continuava abrindo OS sem eles. Chavinha que
 * mente é pior do que chavinha que não existe: a dona liga, confia, e só
 * descobre meses depois olhando as fichas vazias. Ao criar campo novo no
 * catálogo (`src/config/camposObrigatorios.ts`), a regra dele entra AQUI no
 * mesmo commit.
 */

import { padraoDoFormulario } from '@/config/camposObrigatorios';

/**
 * O que esta loja exige. Sem isto, vale o padrão de fábrica — que é como o
 * sistema se comportava antes de a configuração existir.
 */
export type Exigidos = Record<string, boolean>;

const PADRAO_DA_CASA: Exigidos = padraoDoFormulario('os');

/** Os campos da abertura que esta regra enxerga. */
export interface DadosDaOS {
  cliente_id: string;
  equipamento_id: string;
  numero_serie: string;
  marca_id: string;
  modelo_id: string;
  cor_id: string;
  memoria_id: string;
  /** Texto livre do defeito relatado. */
  defeito_cliente: string;
  /** Sintomas marcados no checklist — valem como defeito informado. */
  defeitos_marcados: string[];
  /** O que veio junto com o aparelho (capa, carregador, cabo…). */
  acessorios_marcados: string[];
  /** Estado físico na entrada (tela trincada, molhado, sem tampa…). */
  condicoes_marcadas: string[];
  /**
   * Respondeu à pergunta "o aparelho tem senha?".
   *
   * String vazia = ninguém perguntou, e é isso que a regra barra. Aparelho sem
   * senha existe e é normal; o que não pode é a pergunta ficar em branco,
   * porque aí o técnico descobre na bancada que não consegue testar o reparo.
   */
  tem_senha: '' | 'sim' | 'nao';
  senha_aparelho: string;
  senha_padrao: string;
  /** Quem atendeu no balcão. Nasce preenchido com quem está logado. */
  vendedor_id: string;
  /** Quem vai consertar. Fora do padrão de fábrica — ver o cabeçalho. */
  tecnico_id: string;
  prazo_previsto: string;
}

export interface CampoFaltando {
  /** Nome do campo no formulário — serve para focar/destacar. */
  campo: keyof DadosDaOS;
  /** Título do aviso, como o atendente lê. */
  titulo: string;
  /** O que fazer para resolver. */
  comoResolver: string;
}

/**
 * Devolve o que falta preencher, na ordem em que os campos aparecem na tela.
 *
 * Ordem importa: o atendente conserta de cima para baixo, e um aviso que
 * aponta para o fim da página quando o começo está vazio faz ele rolar duas
 * vezes.
 */
export function faltandoParaAbrirOS(
  dados: DadosDaOS,
  exigidos: Exigidos = PADRAO_DA_CASA,
): CampoFaltando[] {
  const falta: CampoFaltando[] = [];
  const exige = (campo: string) => exigidos[campo] === true;

  // Cliente e defeito não consultam a configuração: o banco recusa OS sem
  // eles, então nenhuma loja pode desligá-los (ver `fixo` no catálogo).
  if (!dados.cliente_id) {
    falta.push({
      campo: 'cliente_id',
      titulo: 'Falta o cliente',
      comoResolver: 'Escolha o cliente dono do aparelho, ou cadastre na hora.',
    });
  }

  if (exige('equipamento_id') && !dados.equipamento_id) {
    falta.push({
      campo: 'equipamento_id',
      titulo: 'Falta o equipamento',
      comoResolver: 'Diga o que entrou na bancada: celular, console, notebook…',
    });
  }

  if (exige('numero_serie') && !dados.numero_serie.trim()) {
    falta.push({
      campo: 'numero_serie',
      titulo: 'Falta o IMEI / nº de série',
      comoResolver:
        'É o que prova qual aparelho é o do cliente na hora da retirada. ' +
        'Em celular, *#06# mostra o IMEI.',
    });
  }

  if (exige('marca_id') && !dados.marca_id) {
    falta.push({
      campo: 'marca_id',
      titulo: 'Falta a marca',
      comoResolver: 'Escolha a marca do aparelho, ou cadastre na hora.',
    });
  }

  if (exige('modelo_id') && !dados.modelo_id) {
    falta.push({
      campo: 'modelo_id',
      titulo: 'Falta o modelo',
      comoResolver: 'Escolha o modelo, ou cadastre na hora.',
    });
  }

  if (exige('cor_id') && !dados.cor_id) {
    falta.push({
      campo: 'cor_id',
      titulo: 'Falta a cor',
      comoResolver:
        'Escolha a cor do aparelho. É o que separa dois iguais na prateleira ' +
        'quando o cliente vem buscar.',
    });
  }

  if (exige('memoria_id') && !dados.memoria_id) {
    falta.push({
      campo: 'memoria_id',
      titulo: 'Falta a memória / capacidade',
      comoResolver: 'Escolha a capacidade do aparelho, ou cadastre na hora.',
    });
  }

  // Checklist e texto livre se substituem: o que não pode é a OS chegar na
  // bancada sem ninguém saber o que o cliente reclamou.
  if (!dados.defeito_cliente.trim() && dados.defeitos_marcados.length === 0) {
    falta.push({
      campo: 'defeito_cliente',
      titulo: 'Falta o problema informado',
      comoResolver: 'Marque um sintoma no checklist ou escreva o que o cliente relatou.',
    });
  }

  if (exige('acessorios') && dados.acessorios_marcados.length === 0) {
    falta.push({
      campo: 'acessorios_marcados',
      titulo: 'Falta dizer o que veio junto',
      comoResolver:
        'Marque os itens que vieram com o aparelho. Se não veio nada, marque o ' +
        'item que diz isso — em branco não dá para saber se ninguém olhou.',
    });
  }

  if (exige('condicoes') && dados.condicoes_marcadas.length === 0) {
    falta.push({
      campo: 'condicoes_marcadas',
      titulo: 'Falta a condição de entrada',
      comoResolver:
        'Marque como o aparelho chegou (riscado, trincado, sem tampa…). É o que ' +
        'protege a loja quando o cliente reclama de um arranhão na retirada.',
    });
  }

  if (exige('tem_senha') && dados.tem_senha !== 'sim' && dados.tem_senha !== 'nao') {
    falta.push({
      campo: 'tem_senha',
      titulo: 'Falta responder sobre a senha',
      comoResolver:
        'O aparelho tem senha? Responda sim ou não — sempre. Sem a senha o ' +
        'técnico não testa o reparo, e o aparelho volta ao balcão à toa.',
    });
  }

  // Disse que tem senha, mas não deixou nenhuma: é a pior das três respostas,
  // porque parece preenchido e não serve.
  if (
    dados.tem_senha === 'sim' &&
    !dados.senha_aparelho.trim() &&
    !dados.senha_padrao.trim()
  ) {
    falta.push({
      campo: 'senha_aparelho',
      titulo: 'Falta a senha',
      comoResolver: 'Digite a senha do aparelho ou desenhe o padrão da tela.',
    });
  }

  if (exige('vendedor_id') && !dados.vendedor_id) {
    falta.push({
      campo: 'vendedor_id',
      titulo: 'Falta quem recebeu',
      comoResolver: 'Já vem preenchido com quem está logado — troque se quem atendeu foi outro.',
    });
  }

  if (exige('tecnico_id') && !dados.tecnico_id) {
    falta.push({
      campo: 'tecnico_id',
      titulo: 'Falta o técnico responsável',
      comoResolver: 'Escolha quem vai ficar com este aparelho.',
    });
  }

  if (exige('prazo_previsto') && !dados.prazo_previsto) {
    falta.push({
      campo: 'prazo_previsto',
      titulo: 'Falta o prazo prometido',
      comoResolver: 'Escolha um dos prazos ou informe a data combinada com o cliente.',
    });
  }

  return falta;
}

/** Atalho de leitura para a tela: dá para abrir a OS? */
export function podeAbrirOS(dados: DadosDaOS, exigidos: Exigidos = PADRAO_DA_CASA): boolean {
  return faltandoParaAbrirOS(dados, exigidos).length === 0;
}
