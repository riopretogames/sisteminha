import { describe, it, expect } from 'vitest';
import {
  bloqueioDaPassagem,
  passagemDesfazRecusa,
  passagemPedeDecisaoDoLaudo,
  textoDeDesfazerRecusa,
  type SituacaoDoLaudo,
} from './decisaoDoLaudo';
import { OS_ETAPAS, OS_CANCELADO } from '@/config/osStatus';

/**
 * O que estes testes protegem: quem leva a OS para qual etapa.
 *
 * A mesma regra vale no seletor da ficha, no seletor da lista, no arrastar do
 * quadro e no banco. Se uma das telas voltar a aceitar a mudança crua de
 * etapa, a loja perde o motivo da recusa e cobra um reparo que o cliente não
 * aprovou; se esconder demais, o técnico fica preso num beco sem saída.
 */

const PECA = 'aguardando_peca';
const TERCEIRIZADA = 'tercerizada';

/** OS com laudo eletrônico, parada esperando a resposta do cliente. */
const esperandoResposta: SituacaoDoLaudo = {
  status: OS_ETAPAS.AGUARDANDO_APROVACAO,
  laudoAprovado: null,
  laudoEletronico: true,
};

/** OS recém-aberta, com laudo eletrônico. */
const naEntradaComLaudo: SituacaoDoLaudo = {
  status: OS_ETAPAS.AGUARDANDO_ANALISE,
  laudoAprovado: null,
  laudoEletronico: true,
};

/** Serviço tabelado recém-aberto: preço e prazo combinados no balcão. */
const naEntradaTabelada: SituacaoDoLaudo = {
  status: OS_ETAPAS.AGUARDANDO_ANALISE,
  laudoAprovado: null,
  laudoEletronico: false,
};

const TECNICO = false; // não aprova orçamento
const VENDEDOR = true; // aprova

describe('pular a resposta do cliente não passa — para ninguém', () => {
  it.each([OS_ETAPAS.APROVADO, OS_ETAPAS.FINALIZADO, PECA, TERCEIRIZADA, OS_ETAPAS.ENTREGUE])(
    'de "Aguardando aprovação" para %s, sem resposta registrada',
    (destino) => {
      // Até 24/09 só Aprovado e Finalizado eram barrados. Peça, Terceirizada e
      // Entregue: o técnico levava "Tente novamente" do banco e o vendedor
      // passava sem registrar nada — a OS-202608-0007 ficou assim.
      expect(passagemPedeDecisaoDoLaudo(esperandoResposta, destino)).toBe(true);
      expect(bloqueioDaPassagem(esperandoResposta, destino, VENDEDOR)?.motivo).toBe(
        'resposta_do_cliente',
      );
      expect(bloqueioDaPassagem(esperandoResposta, destino, TECNICO)?.motivo).toBe(
        'resposta_do_cliente',
      );
    },
  );

  it.each([OS_ETAPAS.APROVADO, OS_ETAPAS.FINALIZADO, OS_ETAPAS.ENTREGUE, PECA])(
    'da Entrada para %s, numa OS com laudo eletrônico',
    (destino) => {
      // A OS0001 foi da Entrada a Finalizado e Entregue sem laudo nem
      // resposta. O caminho é: enviar o laudo, o cliente responde.
      expect(bloqueioDaPassagem(naEntradaComLaudo, destino, VENDEDOR)?.motivo).toBe(
        'resposta_do_cliente',
      );
      expect(bloqueioDaPassagem(naEntradaComLaudo, destino, TECNICO)?.motivo).toBe(
        'resposta_do_cliente',
      );
    },
  );

  it('a OS antiga, sem a chavinha preenchida, conta como "tem laudo" — igual ao banco', () => {
    expect(
      bloqueioDaPassagem({ ...naEntradaComLaudo, laudoEletronico: null }, OS_ETAPAS.FINALIZADO, VENDEDOR),
    ).not.toBeNull();
  });

  it('com a resposta registrada, a OS segue para onde precisar', () => {
    // Aprovou, e a peça ainda não chegou: "Laudo aprovado" e depois Peça.
    const aprovada = { ...esperandoResposta, laudoAprovado: true };
    expect(bloqueioDaPassagem(aprovada, PECA, TECNICO)).toBeNull();
    expect(bloqueioDaPassagem(aprovada, OS_ETAPAS.APROVADO, TECNICO)).toBeNull();
  });

  it('mandar o laudo, voltar para a análise e cancelar continuam livres', () => {
    expect(bloqueioDaPassagem(naEntradaComLaudo, OS_ETAPAS.AGUARDANDO_APROVACAO, TECNICO)).toBeNull();
    expect(bloqueioDaPassagem(esperandoResposta, OS_ETAPAS.AGUARDANDO_ANALISE, TECNICO)).toBeNull();
    expect(bloqueioDaPassagem(naEntradaComLaudo, OS_CANCELADO, TECNICO)).toBeNull();
  });

  it('fora das etapas de antes da resposta, a OS antiga anda normalmente', () => {
    // OS de agosto, de antes de a resposta ser registrada: laudo em branco,
    // já em Finalizado. Barrar aqui prenderia a entrega delas.
    const antiga: SituacaoDoLaudo = {
      status: OS_ETAPAS.FINALIZADO,
      laudoAprovado: null,
      laudoEletronico: true,
    };
    expect(bloqueioDaPassagem(antiga, OS_ETAPAS.ENTREGUE, TECNICO)).toBeNull();
  });
});

describe('o serviço tabelado vai direto para a execução', () => {
  it('o técnico leva a OS tabelada da Entrada para "Aprovado / Executar"', () => {
    // PROCESSO-ORDEM-DE-SERVICO.md, passo 9. Até 24/09 a tela tratava isso
    // como aprovar orçamento e o técnico não conseguia.
    expect(bloqueioDaPassagem(naEntradaTabelada, OS_ETAPAS.APROVADO, TECNICO)).toBeNull();
  });

  it('e volta com ela de "Aguardando Peça" para a bancada', () => {
    const tabeladaNaPeca = { ...naEntradaTabelada, status: PECA };
    expect(bloqueioDaPassagem(tabeladaNaPeca, OS_ETAPAS.APROVADO, TECNICO)).toBeNull();
  });

  it('se a loja mandou a tabelada perguntar ao cliente, aí ela espera a resposta', () => {
    const tabeladaEsperando = { ...naEntradaTabelada, status: OS_ETAPAS.AGUARDANDO_APROVACAO };
    expect(bloqueioDaPassagem(tabeladaEsperando, OS_ETAPAS.APROVADO, VENDEDOR)?.motivo).toBe(
      'resposta_do_cliente',
    );
  });
});

describe('aprovar e recusar orçamento é de quem fala com o cliente', () => {
  it('OS com laudo e sem resposta: o técnico não leva para "Aprovado"', () => {
    const naPecaSemResposta = { ...naEntradaComLaudo, status: PECA };
    expect(bloqueioDaPassagem(naPecaSemResposta, OS_ETAPAS.APROVADO, TECNICO)?.motivo).toBe(
      'aprovar_orcamento',
    );
    expect(bloqueioDaPassagem(naPecaSemResposta, OS_ETAPAS.APROVADO, VENDEDOR)).toBeNull();
  });

  it('OS RECUSADA: o técnico devolve para a bancada — recusou também é resposta', () => {
    // Achado baixo nº 11 (24/09): a tela escondia "Aprovado" da recusada, e o
    // banco deixava. Técnico que apertou "Reparo concluído" cedo demais não
    // conseguia devolver o aparelho para remontar.
    const recusadaPronta: SituacaoDoLaudo = {
      status: OS_ETAPAS.FINALIZADO,
      laudoAprovado: false,
      laudoEletronico: true,
    };
    expect(bloqueioDaPassagem(recusadaPronta, OS_ETAPAS.APROVADO, TECNICO)).toBeNull();
  });

  it('cancelar vindo de "Aguardando aprovação" é recusar: só quem aprova', () => {
    expect(bloqueioDaPassagem(esperandoResposta, OS_CANCELADO, TECNICO)?.motivo).toBe(
      'recusar_orcamento',
    );
    expect(bloqueioDaPassagem(esperandoResposta, OS_CANCELADO, VENDEDOR)).toBeNull();
  });
});

describe('desfazer a recusa', () => {
  const recusadaNaBancada: SituacaoDoLaudo = {
    status: OS_ETAPAS.APROVADO,
    laudoAprovado: false,
    laudoEletronico: true,
  };

  it('voltar a OS recusada para a análise é desfazer a recusa', () => {
    expect(passagemDesfazRecusa(recusadaNaBancada, OS_ETAPAS.AGUARDANDO_ANALISE)).toBe(true);
    expect(passagemDesfazRecusa(recusadaNaBancada, OS_ETAPAS.AGUARDANDO_APROVACAO)).toBe(true);
    // Ir para a frente não desfaz nada.
    expect(passagemDesfazRecusa(recusadaNaBancada, OS_ETAPAS.FINALIZADO)).toBe(false);
  });

  it('o técnico não desfaz: quem sabe que o cliente voltou atrás é quem fala com ele', () => {
    // Até 24/09 um arrasto do técnico apagava a recusa, voltava a cobrar o
    // orçamento cheio e tirava as peças do estoque de novo, sem pergunta.
    expect(
      bloqueioDaPassagem(recusadaNaBancada, OS_ETAPAS.AGUARDANDO_ANALISE, TECNICO)?.motivo,
    ).toBe('desfazer_recusa');
    expect(bloqueioDaPassagem(recusadaNaBancada, OS_ETAPAS.AGUARDANDO_ANALISE, VENDEDOR)).toBeNull();
  });

  it('a confirmação diz quanto volta a valer, o motivo e o estoque', () => {
    const texto = textoDeDesfazerRecusa({
      numeroOs: 'OS-202609-0001',
      destino: 'Entrada / Análise',
      valorRecusado: 450,
      valorAtual: 80,
      motivo: 'achou caro',
    });
    expect(texto).toContain('450');
    expect(texto).toContain('80');
    expect(texto).toContain('achou caro');
    expect(texto).toMatch(/estoque/);
  });
});
