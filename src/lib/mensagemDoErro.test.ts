import { describe, it, expect } from 'vitest';
import { mensagemDoErro, mensagemCrua, ehRecusaDeAcesso } from './mensagemDoErro';

/**
 * O que estes testes protegem: o motivo do banco chegar na tela.
 *
 * O defeito de 24/09 era invisível para os testes antigos porque nenhum deles
 * simulava o erro do jeito que a biblioteca do Supabase entrega — um objeto
 * comum, não um `Error`. É exatamente esse formato que vai aqui.
 */
describe('a mensagem de erro que a tela da OS mostra', () => {
  it('o texto do gatilho, em português, chega inteiro — mesmo vindo como objeto comum', () => {
    const doSupabase = {
      message: 'O cliente Fulano está bloqueado para venda — a cobrança desta OS foi recusada.',
      code: '23514',
      details: null,
      hint: null,
    };
    expect(doSupabase instanceof Error).toBe(false);
    expect(mensagemDoErro(doSupabase)).toBe(doSupabase.message);
  });

  it('o gatilho que usa o código de "sem permissão" com texto próprio NÃO vira genérico', () => {
    // validar_aprovacao_orcamento_os usa 42501 com um texto que explica o caso.
    const regra = {
      message:
        'O cliente ainda não respondeu ao orçamento. Registre a resposta dele (Aprovou / Não aprovou) antes de seguir com a OS.',
      code: '42501',
    };
    expect(mensagemDoErro(regra, { semAcesso: 'genérico' })).toBe(regra.message);
    expect(ehRecusaDeAcesso(regra)).toBe(false);
  });

  it('a recusa técnica da regra de acesso (inglês) vira frase de gente', () => {
    const rls = { message: 'new row violates row-level security policy for table "service_orders"', code: '42501' };
    expect(ehRecusaDeAcesso(rls)).toBe(true);
    expect(mensagemDoErro(rls, { semAcesso: 'Peça a um vendedor.' })).toBe('Peça a um vendedor.');
  });

  it('erro de conexão e sessão vencida viram instrução', () => {
    expect(mensagemDoErro(new TypeError('Failed to fetch'))).toMatch(/internet/);
    expect(mensagemDoErro({ message: 'JWT expired', code: 'PGRST301' })).toMatch(/sessão/);
  });

  it('outro erro técnico em inglês não aparece cru: vira aviso com o código', () => {
    const texto = mensagemDoErro({ message: 'duplicate key value violates unique constraint "x"', code: '23505' });
    expect(texto).not.toMatch(/duplicate key/);
    expect(texto).toContain('23505');
  });

  it('sem mensagem nenhuma, pede para tentar de novo', () => {
    expect(mensagemDoErro(undefined)).toBe('Tente novamente.');
    expect(mensagemDoErro({})).toBe('Tente novamente.');
  });

  it('mensagemCrua lê o texto do objeto do Supabase (as telas que decidem pelo texto)', () => {
    // Ex.: o Caixa procura "acabou de ser fechado" para recarregar a tela. Com
    // o velho `instanceof Error`, o texto vinha vazio e a tela nunca reagia.
    expect(mensagemCrua({ message: 'Este caixa acabou de ser fechado.', code: '42501' }))
      .toBe('Este caixa acabou de ser fechado.');
    expect(mensagemCrua(new Error('x'))).toBe('x');
    expect(mensagemCrua('texto')).toBe('texto');
    expect(mensagemCrua(null)).toBe('');
  });
});
