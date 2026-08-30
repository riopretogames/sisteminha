import { describe, it, expect } from 'vitest';
import { faltandoNoCliente, type DadosDoCliente } from './clienteObrigatorios';

/**
 * O cadastro de cliente obedecendo ao que a loja configurou.
 *
 * O caso que estes testes protegem é o do Felipe vendendo o sistema: a loja
 * que exige Instagram e a que não exige precisam conviver no mesmo código, e a
 * Rio Preto Games não pode ver comportamento novo enquanto não mexer em nada.
 */

const VAZIO: DadosDoCliente = {
  tipo_pessoa: 'fisica',
  nome: '',
  cpf_cnpj: '',
  rg: '',
  inscricao_estadual: '',
  data_nascimento: '',
  genero: '',
  telefone: '',
  telefone_extra: '',
  email: '',
  instagram: '',
  site: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  municipio: '',
  estado: '',
  origem_id: '',
  motivo_compra_id: '',
};

const comNome = (extra: Partial<DadosDoCliente> = {}): DadosDoCliente => ({
  ...VAZIO,
  nome: 'Adriana Prado',
  ...extra,
});

describe('O que o cadastro de cliente exige', () => {
  describe('sem configuração nenhuma (a Rio Preto Games de hoje)', () => {
    it('só o nome é cobrado', () => {
      expect(faltandoNoCliente(comNome())).toEqual([]);
    });

    it('sem nome, não salva', () => {
      const falta = faltandoNoCliente(VAZIO);
      expect(falta).toHaveLength(1);
      expect(falta[0].campo).toBe('nome');
    });

    it('empresa sem razão social também não salva', () => {
      const falta = faltandoNoCliente({ ...VAZIO, tipo_pessoa: 'juridica' });
      expect(falta[0].titulo).toContain('razão social');
    });
  });

  describe('a loja que exige Instagram — o exemplo do Felipe', () => {
    const exigeInstagram = { nome: true, instagram: true };

    it('cobra o Instagram quando está vazio', () => {
      const falta = faltandoNoCliente(comNome(), exigeInstagram);
      expect(falta).toHaveLength(1);
      expect(falta[0].campo).toBe('instagram');
    });

    it('preenchido, salva', () => {
      expect(faltandoNoCliente(comNome({ instagram: '@adriana' }), exigeInstagram)).toEqual([]);
    });

    it('e nada mais passa a ser cobrado junto', () => {
      const falta = faltandoNoCliente(comNome({ instagram: '@a' }), exigeInstagram);
      expect(falta).toEqual([]);
    });
  });

  describe('o documento, que é um campo com dois nomes', () => {
    it('exigir CPF vale para pessoa física', () => {
      const falta = faltandoNoCliente(comNome(), { cpf_cnpj: true });
      expect(falta[0].titulo).toContain('CPF');
    });

    it('exigir CPF NÃO cobra nada de uma empresa', () => {
      // Senão a tela pediria "CPF" de quem está cadastrando um CNPJ.
      const empresa = comNome({ tipo_pessoa: 'juridica' });
      expect(faltandoNoCliente(empresa, { cpf_cnpj: true })).toEqual([]);
    });

    it('exigir CNPJ vale para empresa', () => {
      const empresa = comNome({ tipo_pessoa: 'juridica' });
      const falta = faltandoNoCliente(empresa, { cpf_cnpj_empresa: true });
      expect(falta[0].titulo).toContain('CNPJ');
    });

    it('exigir CNPJ não atrapalha o cadastro de pessoa física', () => {
      expect(faltandoNoCliente(comNome(), { cpf_cnpj_empresa: true })).toEqual([]);
    });

    it('pontuação não importa: o que vale são os dígitos', () => {
      const comCpf = comNome({ cpf_cnpj: '910.000.000-01' });
      expect(faltandoNoCliente(comCpf, { cpf_cnpj: true })).toEqual([]);
    });
  });

  describe('campo que some da tela nunca é cobrado', () => {
    it('data de nascimento não é pedida de uma empresa', () => {
      const empresa = comNome({ tipo_pessoa: 'juridica' });
      expect(faltandoNoCliente(empresa, { data_nascimento: true })).toEqual([]);
    });

    it('gênero não é pedido de uma empresa', () => {
      const empresa = comNome({ tipo_pessoa: 'juridica' });
      expect(faltandoNoCliente(empresa, { genero: true })).toEqual([]);
    });

    it('Inscrição Estadual não é pedida de pessoa física', () => {
      expect(faltandoNoCliente(comNome(), { inscricao_estadual: true })).toEqual([]);
    });

    it('RG não é pedido de empresa', () => {
      const empresa = comNome({ tipo_pessoa: 'juridica' });
      expect(faltandoNoCliente(empresa, { rg: true })).toEqual([]);
    });
  });

  describe('telefone', () => {
    it('cobrado quando exigido e vazio', () => {
      expect(faltandoNoCliente(comNome(), { telefone: true })[0].campo).toBe('telefone');
    });

    it('preenchido resolve', () => {
      expect(faltandoNoCliente(comNome({ telefone: '17999990000' }), { telefone: true })).toEqual([]);
    });
  });

  describe('endereço', () => {
    it('cada campo é cobrado separadamente', () => {
      const falta = faltandoNoCliente(comNome(), { cep: true, numero: true });
      expect(falta.map((f) => f.campo)).toEqual(['cep', 'numero']);
    });

    it('o aviso do número lembra do S/N — casa sem número existe', () => {
      const falta = faltandoNoCliente(comNome(), { numero: true });
      expect(falta[0].comoResolver).toContain('S/N');
    });
  });

  it('a ordem dos avisos segue a ordem da tela', () => {
    const tudo = {
      nome: true, cpf_cnpj: true, telefone: true, email: true, cep: true, origem_id: true,
    };
    const falta = faltandoNoCliente(VAZIO, tudo);
    expect(falta.map((f) => f.campo)).toEqual([
      'nome', 'cpf_cnpj', 'telefone', 'email', 'cep', 'origem_id',
    ]);
  });
});
