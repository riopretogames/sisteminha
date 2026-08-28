import { describe, it, expect } from 'vitest';
import { faltandoParaAbrirOS, podeAbrirOS, type DadosDaOS } from './osObrigatorios';

/**
 * A regra de abertura de OS ditada pelo Felipe em 27/08.
 *
 * O caso que estes testes existem para proteger é o do balcão cheio: uma OS
 * aberta pela metade parece registro e não é — o aparelho está na loja, mas
 * ninguém sabe a marca, o número de série nem o que o cliente reclamou.
 */

/** Uma OS completa, do jeito que o balcão deveria preencher. */
const COMPLETA: DadosDaOS = {
  cliente_id: 'cliente-1',
  equipamento_id: 'equip-1',
  numero_serie: '359876543210987',
  marca_id: 'marca-1',
  modelo_id: 'modelo-1',
  defeito_cliente: 'Não liga',
  defeitos_marcados: [],
  tem_senha: 'nao',
  senha_aparelho: '',
  senha_padrao: '',
  vendedor_id: 'pessoa-1',
  prazo_previsto: '2026-08-30',
};

const semCampo = (mudanca: Partial<DadosDaOS>): DadosDaOS => ({ ...COMPLETA, ...mudanca });

describe('O que a loja exige para abrir uma OS', () => {
  it('OS completa passa', () => {
    expect(faltandoParaAbrirOS(COMPLETA)).toEqual([]);
    expect(podeAbrirOS(COMPLETA)).toBe(true);
  });

  it.each([
    ['cliente', { cliente_id: '' }],
    ['equipamento', { equipamento_id: '' }],
    ['IMEI / nº de série', { numero_serie: '' }],
    ['marca', { marca_id: '' }],
    ['modelo', { modelo_id: '' }],
    ['quem recebeu', { vendedor_id: '' }],
    ['prazo prometido', { prazo_previsto: '' }],
  ])('sem %s, não abre', (_nome, mudanca) => {
    expect(podeAbrirOS(semCampo(mudanca as Partial<DadosDaOS>))).toBe(false);
  });

  it('número de série só com espaço não vale', () => {
    expect(podeAbrirOS(semCampo({ numero_serie: '   ' }))).toBe(false);
  });

  describe('o defeito relatado', () => {
    it('sintoma marcado no checklist basta, sem escrever nada', () => {
      const so_checklist = semCampo({ defeito_cliente: '', defeitos_marcados: ['nao-liga'] });
      expect(podeAbrirOS(so_checklist)).toBe(true);
    });

    it('sem checklist e sem texto, não abre', () => {
      const nada = semCampo({ defeito_cliente: '  ', defeitos_marcados: [] });
      expect(podeAbrirOS(nada)).toBe(false);
    });
  });

  describe('a pergunta da senha', () => {
    it('não respondida trava — mesmo com todo o resto preenchido', () => {
      const semResposta = semCampo({ tem_senha: '' });
      expect(podeAbrirOS(semResposta)).toBe(false);
      expect(faltandoParaAbrirOS(semResposta)[0].titulo).toContain('senha');
    });

    it('"não tem senha" é resposta válida e abre a OS', () => {
      expect(podeAbrirOS(semCampo({ tem_senha: 'nao' }))).toBe(true);
    });

    it('"tem senha" sem informar qual não abre — parece preenchido e não serve', () => {
      const prometeuENaoDeu = semCampo({
        tem_senha: 'sim',
        senha_aparelho: '',
        senha_padrao: '',
      });
      expect(podeAbrirOS(prometeuENaoDeu)).toBe(false);
    });

    it('senha digitada resolve', () => {
      expect(podeAbrirOS(semCampo({ tem_senha: 'sim', senha_aparelho: '1234' }))).toBe(true);
    });

    it('senha de desenho também resolve', () => {
      expect(podeAbrirOS(semCampo({ tem_senha: 'sim', senha_padrao: '1-2-3-6-9' }))).toBe(true);
    });

    it('marcar "não tem senha" ignora o que estiver digitado — não trava por isso', () => {
      const mudouDeIdeia = semCampo({ tem_senha: 'nao', senha_aparelho: '1234' });
      expect(podeAbrirOS(mudouDeIdeia)).toBe(true);
    });
  });

  it('o técnico NÃO é obrigatório: o balcão raramente sabe quem vai consertar', () => {
    // Não existe campo de técnico nesta regra, de propósito. Se um dia alguém
    // acrescentar, este teste cai e obriga a conversa antes.
    expect(podeAbrirOS(COMPLETA)).toBe(true);
  });

  it('formulário vazio lista tudo que falta, de cima para baixo', () => {
    const vazio: DadosDaOS = {
      cliente_id: '', equipamento_id: '', numero_serie: '', marca_id: '', modelo_id: '',
      defeito_cliente: '', defeitos_marcados: [], tem_senha: '',
      senha_aparelho: '', senha_padrao: '', vendedor_id: '', prazo_previsto: '',
    };
    const campos = faltandoParaAbrirOS(vazio).map((f) => f.campo);
    expect(campos).toEqual([
      'cliente_id',
      'equipamento_id',
      'numero_serie',
      'marca_id',
      'modelo_id',
      'defeito_cliente',
      'tem_senha',
      'vendedor_id',
      'prazo_previsto',
    ]);
  });
});
