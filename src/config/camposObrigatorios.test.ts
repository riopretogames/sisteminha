import { describe, it, expect } from 'vitest';
import {
  CAMPOS_POR_FORMULARIO,
  exigenciasDaLoja,
  padraoDoFormulario,
} from './camposObrigatorios';

/**
 * A regra que junta "o que vem de fábrica" com "o que a loja escolheu".
 *
 * O caso que estes testes protegem é o da venda do sistema: a Rio Preto Games
 * não pode ter o comportamento alterado por uma tabela vazia, e a loja que
 * comprar depois precisa conseguir mudar de ideia sem mexer em código.
 */

describe('O que a loja exige em cada formulário', () => {
  describe('sem nenhuma configuração, vale o padrão de fábrica', () => {
    it('cliente: só o nome, como sempre foi', () => {
      const exige = exigenciasDaLoja('cliente', undefined);
      expect(exige.nome).toBe(true);
      expect(exige.instagram).toBe(false);
      expect(exige.telefone).toBe(false);
      expect(exige.cpf_cnpj).toBe(false);
    });

    it('OS: a lista que o Felipe ditou em 27/08', () => {
      const exige = exigenciasDaLoja('os', []);
      expect(exige.cliente_id).toBe(true);
      expect(exige.equipamento_id).toBe(true);
      expect(exige.numero_serie).toBe(true);
      expect(exige.marca_id).toBe(true);
      expect(exige.modelo_id).toBe(true);
      expect(exige.defeito_cliente).toBe(true);
      expect(exige.tem_senha).toBe(true);
      expect(exige.vendedor_id).toBe(true);
      expect(exige.prazo_previsto).toBe(true);
      // O técnico ficou de fora de propósito: quem atende no balcão raramente
      // sabe quem vai consertar.
      expect(exige.tecnico_id).toBe(false);
    });
  });

  describe('a loja muda de ideia', () => {
    it('liga um campo que vinha desligado (o caso do Instagram)', () => {
      const exige = exigenciasDaLoja('cliente', [{ campo: 'instagram', obrigatorio: true }]);
      expect(exige.instagram).toBe(true);
      // e não mexe em mais nada
      expect(exige.email).toBe(false);
    });

    it('desliga um campo que vinha ligado (o IMEI que trava o balcão)', () => {
      const exige = exigenciasDaLoja('os', [{ campo: 'numero_serie', obrigatorio: false }]);
      expect(exige.numero_serie).toBe(false);
      expect(exige.marca_id).toBe(true);
    });
  });

  describe('o que nenhuma loja pode desligar', () => {
    // São os campos que o BANCO recusa vazios. Deixar desligar produziria erro
    // técnico em inglês no lugar de um aviso em português.
    it('o nome do cliente resiste, mesmo com linha no banco mandando desligar', () => {
      const exige = exigenciasDaLoja('cliente', [{ campo: 'nome', obrigatorio: false }]);
      expect(exige.nome).toBe(true);
    });

    it('cliente e defeito da OS também resistem', () => {
      const exige = exigenciasDaLoja('os', [
        { campo: 'cliente_id', obrigatorio: false },
        { campo: 'defeito_cliente', obrigatorio: false },
      ]);
      expect(exige.cliente_id).toBe(true);
      expect(exige.defeito_cliente).toBe(true);
    });
  });

  it('linha antiga apontando para campo que não existe mais é ignorada', () => {
    // Acontece se alguém renomear um campo no código. A configuração some,
    // mas o formulário não pode quebrar por causa disso.
    const exige = exigenciasDaLoja('cliente', [{ campo: 'campo_que_sumiu', obrigatorio: true }]);
    expect(exige.campo_que_sumiu).toBeUndefined();
    expect(exige.nome).toBe(true);
  });

  describe('o catálogo em si', () => {
    it('todo campo configurável tem rótulo em português e grupo', () => {
      for (const formulario of ['cliente', 'os'] as const) {
        for (const campo of CAMPOS_POR_FORMULARIO[formulario]) {
          // 2 letras basta: "RG" é um rótulo legítimo.
          expect(campo.rotulo.length).toBeGreaterThanOrEqual(2);
          expect(campo.grupo.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('não há chave repetida dentro do mesmo formulário', () => {
      for (const formulario of ['cliente', 'os'] as const) {
        const chaves = CAMPOS_POR_FORMULARIO[formulario].map((c) => c.chave);
        expect(new Set(chaves).size).toBe(chaves.length);
      }
    });

    it('o padrão do catálogo e o padrão calculado dizem a mesma coisa', () => {
      const doCatalogo = Object.fromEntries(
        CAMPOS_POR_FORMULARIO.os.map((c) => [c.chave, c.padrao]),
      );
      expect(padraoDoFormulario('os')).toEqual(doCatalogo);
    });

    it('campo que só vale para empresa está marcado como tal', () => {
      const cnpj = CAMPOS_POR_FORMULARIO.cliente.find((c) => c.chave === 'cpf_cnpj_empresa');
      const nascimento = CAMPOS_POR_FORMULARIO.cliente.find((c) => c.chave === 'data_nascimento');
      expect(cnpj?.condicao).toBe('pessoa_juridica');
      expect(nascimento?.condicao).toBe('pessoa_fisica');
    });
  });
});
