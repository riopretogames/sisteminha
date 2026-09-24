import { describe, it, expect } from 'vitest';
import { acaoParaAvancar, entregaSemCobranca, textoDeSubirValorAprovado } from './acaoDaEtapa';
import { OS_ETAPAS } from '@/config/osStatus';

/**
 * Os nomes dos botões vieram do organograma do processo (Figma, 30/08).
 *
 * O que estes testes protegem é a tradução ficar certa: quem está com o
 * aparelho na mão lê a AÇÃO que vai fazer, não o nome da coluna de destino.
 */

describe('O nome do botão que avança a OS', () => {
  it('da entrada para a aprovação: envia o laudo, e confirma antes', () => {
    const acao = acaoParaAvancar(OS_ETAPAS.AGUARDANDO_ANALISE, OS_ETAPAS.AGUARDANDO_APROVACAO);
    expect(acao?.rotulo).toBe('Enviar laudo para aprovação');
    // Sai da loja para o cliente: passo que pede confirmação.
    expect(acao?.confirmar).toBeTruthy();
  });

  it('da aprovação para o aprovado: quem responde é o cliente', () => {
    const acao = acaoParaAvancar(OS_ETAPAS.AGUARDANDO_APROVACAO, OS_ETAPAS.APROVADO);
    expect(acao?.rotulo).toBe('Cliente aprovou o laudo');
  });

  it('do aprovado para o finalizado: reparo concluído', () => {
    const acao = acaoParaAvancar(OS_ETAPAS.APROVADO, OS_ETAPAS.FINALIZADO);
    expect(acao?.rotulo).toBe('Reparo concluído');
  });

  it('a entrega tem nome próprio venha de onde vier', () => {
    // O aparelho pode ir para a entrega vindo de finalizado ou de uma etapa
    // extra da loja — o nome do botão é o mesmo.
    expect(acaoParaAvancar(OS_ETAPAS.FINALIZADO, OS_ETAPAS.ENTREGUE)?.rotulo)
      .toBe('Entregar ao cliente');
    expect(acaoParaAvancar('terceirizada', OS_ETAPAS.ENTREGUE)?.rotulo)
      .toBe('Entregar ao cliente');
  });

  describe('passagem sem nome no processo', () => {
    it('etapa extra da loja não inventa nome', () => {
      // Aí o botão volta a dizer "Avançar para <etapa>", que é honesto: o
      // sistema não sabe o que a loja faz naquela etapa.
      expect(acaoParaAvancar(OS_ETAPAS.APROVADO, 'terceirizada')).toBeUndefined();
      expect(acaoParaAvancar('aguardando_peca', OS_ETAPAS.APROVADO)).toBeUndefined();
    });
  });

  it('só o começo do trabalho e o envio do laudo pedem confirmação', () => {
    // Confirmar em tudo é o mesmo que não confirmar em nada: a pessoa aprende
    // a clicar "ok" sem ler.
    expect(acaoParaAvancar(OS_ETAPAS.APROVADO, OS_ETAPAS.FINALIZADO)?.confirmar).toBeUndefined();
    expect(acaoParaAvancar(OS_ETAPAS.FINALIZADO, OS_ETAPAS.ENTREGUE)?.confirmar).toBeUndefined();
  });
});

describe('o serviço tabelado na Entrada (24/09)', () => {
  it('o passo seguinte é executar, e confirma dizendo por que não há laudo', () => {
    // PROCESSO-ORDEM-DE-SERVICO.md, passo 9: tabelado pula o laudo e vai
    // direto para a Etapa 3.
    const acao = acaoParaAvancar(OS_ETAPAS.AGUARDANDO_ANALISE, OS_ETAPAS.APROVADO);
    expect(acao?.rotulo).toBe('Ir para a execução');
    expect(acao?.confirmar).toMatch(/tabelado/i);
  });
});

describe('a OS paga que sairia sem cobrança (24/09)', () => {
  it('paga em R$ 0 é "sem cobrança"; garantia e cortesia em R$ 0 são o combinado', () => {
    expect(entregaSemCobranca('paga', 0)).toBe(true);
    expect(entregaSemCobranca('paga', null)).toBe(true);
    expect(entregaSemCobranca('paga', 150)).toBe(false);
    expect(entregaSemCobranca('garantia', 0)).toBe(false);
    expect(entregaSemCobranca('cortesia', 0)).toBe(false);
  });

  it('subir o valor aprovado mostra os dois números antes de salvar', () => {
    const texto = textoDeSubirValorAprovado(200, 350);
    expect(texto).toContain('200');
    expect(texto).toContain('350');
  });
});
