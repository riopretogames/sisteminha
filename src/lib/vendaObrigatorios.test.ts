import { describe, it, expect } from 'vitest';
import {
  faltandoParaFecharVenda,
  podeFecharVenda,
  type DadosDaVenda,
} from './vendaObrigatorios';
import { CAMPOS_POR_FORMULARIO, padraoDoFormulario } from '@/config/camposObrigatorios';

/**
 * O que a loja exige para fechar uma venda.
 *
 * O padrão de fábrica não exige nada, de propósito: é assim que o balcão da
 * Rio Preto Games trabalha hoje, e ligar a configuração não pode mudar o
 * comportamento de quem nunca mexeu nela.
 */

const PADRAO = padraoDoFormulario('venda');
const NADA_EXIGIDO = { cliente_id: false, origem_venda_id: false };
const TUDO_EXIGIDO = { cliente_id: true, origem_venda_id: true };

const COMPLETA: DadosDaVenda = {
  cliente_id: 'cliente-1',
  origem_venda_id: 'origem-1',
};

const semCampo = (mudanca: Partial<DadosDaVenda>): DadosDaVenda => ({
  ...COMPLETA,
  ...mudanca,
});

describe('O que a loja exige para fechar uma venda', () => {
  it('o padrão de fábrica não exige nada — venda sem cliente continua passando', () => {
    // É a venda de balcão com fila: produto, dinheiro, tchau. Se ligar a
    // configuração mudasse isso sozinho, o PDV travaria da noite para o dia.
    expect(PADRAO).toEqual(NADA_EXIGIDO);
    expect(podeFecharVenda({ cliente_id: '', origem_venda_id: '' })).toBe(true);
  });

  it.each([
    ['cliente', 'cliente_id', { cliente_id: '' }],
    ['origem da venda', 'origem_venda_id', { origem_venda_id: '' }],
  ])('%s: passa no padrão; com a chavinha ligada, barra', (_nome, chave, vazio) => {
    const dados = semCampo(vazio as Partial<DadosDaVenda>);

    expect(podeFecharVenda(dados)).toBe(true);
    expect(podeFecharVenda(dados, { ...NADA_EXIGIDO, [chave]: true })).toBe(false);
  });

  describe('a etapa recorta o aviso para o momento certo', () => {
    /**
     * O cliente é escolhido no carrinho; a origem, dentro da janela de
     * pagamento. Cobrar os dois só no fim mandaria o vendedor fechar a janela
     * com o dinheiro do cliente na mão para voltar ao carrinho.
     */
    const vazia: DadosDaVenda = { cliente_id: '', origem_venda_id: '' };

    it('no carrinho, cobra só o cliente', () => {
      const falta = faltandoParaFecharVenda(vazia, TUDO_EXIGIDO, 'carrinho');
      expect(falta.map((f) => f.campo)).toEqual(['cliente_id']);
    });

    it('no pagamento, cobra só a origem', () => {
      const falta = faltandoParaFecharVenda(vazia, TUDO_EXIGIDO, 'pagamento');
      expect(falta.map((f) => f.campo)).toEqual(['origem_venda_id']);
    });

    it('sem etapa, devolve os dois, na ordem em que a venda acontece', () => {
      const falta = faltandoParaFecharVenda(vazia, TUDO_EXIGIDO);
      expect(falta.map((f) => f.campo)).toEqual(['cliente_id', 'origem_venda_id']);
    });
  });

  it('o aviso diz o que fazer, não só o que falta', () => {
    const [aviso] = faltandoParaFecharVenda(
      semCampo({ cliente_id: '' }),
      TUDO_EXIGIDO,
      'carrinho',
    );
    expect(aviso.titulo).toMatch(/cliente/i);
    // Quem está no balcão precisa saber ONDE clicar, não só que faltou algo.
    expect(aviso.comoResolver).toMatch(/botão Cliente/i);
  });

  /**
   * A rede que impede a chavinha-que-mente de voltar.
   *
   * Em 01/09 cinco campos da OS apareciam na tela de configuração e não eram
   * obedecidos por ninguém. Este teste liga a lista da tela na regra: campo
   * novo no catálogo da venda sem `if` correspondente derruba o teste no mesmo
   * commit em que for criado, com o nome do campo no erro.
   */
  describe('toda chavinha do catálogo da venda é obedecida de verdade', () => {
    const SEM_O_CAMPO: Record<string, Partial<DadosDaVenda>> = {
      cliente_id: { cliente_id: '' },
      origem_venda_id: { origem_venda_id: '' },
    };

    it.each(CAMPOS_POR_FORMULARIO.venda.map((c) => [c.rotulo, c.chave] as const))(
      '"%s" barra a venda quando a loja liga a exigência',
      (_rotulo, chave) => {
        const vazio = SEM_O_CAMPO[chave];
        expect(
          vazio,
          `O campo "${chave}" está em Cadastros > Campos Obrigatórios mas ninguém disse a este teste como é uma venda sem ele. Some a regra dele em src/lib/vendaObrigatorios.ts e a linha no mapa acima.`,
        ).toBeDefined();

        const todosLigados = Object.fromEntries(
          CAMPOS_POR_FORMULARIO.venda.map((c) => [c.chave, true]),
        );
        expect(podeFecharVenda(semCampo(vazio), todosLigados)).toBe(false);
      },
    );
  });
});
