import { describe, it, expect } from 'vitest';
import { faltandoParaAbrirOS, podeAbrirOS, type DadosDaOS } from './osObrigatorios';
import { CAMPOS_POR_FORMULARIO, padraoDoFormulario } from '@/config/camposObrigatorios';

/** O padrão de fábrica, o mesmo que a regra usa quando ninguém configurou. */
const PADRAO = padraoDoFormulario('os');

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
  cor_id: 'cor-1',
  memoria_id: 'memoria-1',
  defeito_cliente: 'Não liga',
  defeitos_marcados: [],
  acessorios_marcados: [],
  condicoes_marcadas: [],
  tem_senha: 'nao',
  senha_aparelho: '',
  senha_padrao: '',
  vendedor_id: 'pessoa-1',
  tecnico_id: 'pessoa-2',
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

  it('o técnico NÃO é obrigatório no padrão de fábrica', () => {
    // O balcão raramente sabe quem vai consertar. A loja que quiser exigir
    // liga em Cadastros > Campos Obrigatórios (ver o bloco abaixo).
    expect(podeAbrirOS(semCampo({ tecnico_id: '' }))).toBe(true);
  });

  /**
   * As cinco chavinhas que não faziam nada, achadas na revisão de 01/09.
   *
   * Elas estavam no catálogo desde 30/08 — a loja ligava em Configurações >
   * Campos Obrigatórios, salvava, e o balcão continuava abrindo OS sem o
   * campo. Chavinha que mente é pior do que chavinha que não existe: a dona
   * confia e só descobre meses depois, olhando as fichas vazias.
   */
  describe('os campos que a loja pode ligar e o padrão deixa desligados', () => {
    const desligados = { ...PADRAO } as Record<string, boolean>;

    it.each([
      ['cor', 'cor_id', { cor_id: '' }],
      ['memória / capacidade', 'memoria_id', { memoria_id: '' }],
      ['o que veio junto', 'acessorios', { acessorios_marcados: [] }],
      ['condição de entrada', 'condicoes', { condicoes_marcadas: [] }],
      ['técnico responsável', 'tecnico_id', { tecnico_id: '' }],
    ])('%s: no padrão passa; com a chavinha ligada, barra', (_nome, chave, vazio) => {
      const dados = semCampo(vazio as Partial<DadosDaOS>);

      // Padrão de fábrica: a Rio Preto Games não exige nenhum dos cinco.
      expect(podeAbrirOS(dados)).toBe(true);

      // A loja que ligar a chavinha passa a ser obedecida.
      expect(podeAbrirOS(dados, { ...desligados, [chave]: true })).toBe(false);
    });

    it('marcar UM item já responde ao checklist — não é preciso marcar tudo', () => {
      const exigindo = { ...desligados, acessorios: true, condicoes: true };
      expect(
        podeAbrirOS(
          semCampo({ acessorios_marcados: ['capa'], condicoes_marcadas: ['tela riscada'] }),
          exigindo,
        ),
      ).toBe(true);
    });
  });

  /**
   * A rede que impede a chavinha-que-mente de voltar.
   *
   * Os cinco campos inertes de 01/09 não foram esquecimento de um: foram
   * cinco de uma vez, porque nada ligava a lista da tela de configuração à
   * regra que barra a abertura. Este teste é essa ligação: campo novo no
   * catálogo sem `if` correspondente aqui derruba o teste no mesmo commit em
   * que for criado, com o nome do campo no erro.
   *
   * O mapa abaixo é a única coisa a atualizar: ele diz, para cada chavinha,
   * como é o formulário SEM aquele campo.
   */
  describe('toda chavinha do catálogo é obedecida de verdade', () => {
    const SEM_O_CAMPO: Record<string, Partial<DadosDaOS>> = {
      cliente_id: { cliente_id: '' },
      equipamento_id: { equipamento_id: '' },
      numero_serie: { numero_serie: '' },
      marca_id: { marca_id: '' },
      cor_id: { cor_id: '' },
      memoria_id: { memoria_id: '' },
      defeito_cliente: { defeito_cliente: '', defeitos_marcados: [] },
      tem_senha: { tem_senha: '' },
      acessorios: { acessorios_marcados: [] },
      condicoes: { condicoes_marcadas: [] },
      vendedor_id: { vendedor_id: '' },
      tecnico_id: { tecnico_id: '' },
      prazo_previsto: { prazo_previsto: '' },
    };

    it.each(CAMPOS_POR_FORMULARIO.os.map((c) => [c.rotulo, c.chave] as const))(
      '"%s" barra a abertura quando a loja liga a exigência',
      (_rotulo, chave) => {
        const vazio = SEM_O_CAMPO[chave];
        expect(
          vazio,
          `O campo "${chave}" está em Cadastros > Campos Obrigatórios mas ninguém disse a este teste como é um formulário sem ele. Some a regra dele em src/lib/osObrigatorios.ts e a linha no mapa acima.`,
        ).toBeDefined();

        const todosLigados = Object.fromEntries(
          CAMPOS_POR_FORMULARIO.os.map((c) => [c.chave, true]),
        );
        expect(podeAbrirOS(semCampo(vazio), todosLigados)).toBe(false);
      },
    );
  });

  it('formulário vazio lista tudo que falta, de cima para baixo', () => {
    const vazio: DadosDaOS = {
      cliente_id: '', equipamento_id: '', numero_serie: '', marca_id: '',
      cor_id: '', memoria_id: '',
      defeito_cliente: '', defeitos_marcados: [],
      acessorios_marcados: [], condicoes_marcadas: [], tem_senha: '',
      senha_aparelho: '', senha_padrao: '', vendedor_id: '', tecnico_id: '',
      prazo_previsto: '',
    };
    const campos = faltandoParaAbrirOS(vazio).map((f) => f.campo);
    expect(campos).toEqual([
      'cliente_id',
      'equipamento_id',
      'numero_serie',
      'marca_id',
      'defeito_cliente',
      'tem_senha',
      'vendedor_id',
      'prazo_previsto',
    ]);
  });
});
