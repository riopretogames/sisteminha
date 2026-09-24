import { describe, it, expect, vi } from 'vitest';
import {
  conferirAlcada,
  type ClienteQueConfere,
} from '../../../supabase/functions/admin-usuarios/alcada.ts';

/**
 * A trava da função de servidor `admin-usuarios` que decide se quem pediu pode
 * trocar a senha, excluir ou "Entrar como" OUTRA pessoa.
 *
 * Achado 73 da revisão de 24/09: a trava antiga lia o papel do alvo com o
 * crachá de quem pediu. Quem não tinha "Ver usuários" recebia a lista VAZIA,
 * sem erro — e a trava entendia "não é administrador" e liberava a chave
 * mestra para trocar a senha do Felipe. O defeito era tratar "não sei" como
 * "pode". Estes testes cravam o contrário: só um SIM explícito do banco libera.
 */

function clienteQueResponde(resposta: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(resposta));
  return { cliente: { rpc } as ClienteQueConfere, rpc };
}

describe('Alçada sobre a conta de outra pessoa (admin-usuarios)', () => {
  it('pergunta ao banco pela pessoa certa, com a função de alçada', async () => {
    const { cliente, rpc } = clienteQueResponde({ data: true, error: null });
    await conferirAlcada(cliente, 'id-do-richard', 'entrar_como');
    expect(rpc).toHaveBeenCalledWith('pode_mexer_na_conta_de', { _alvo: 'id-do-richard' });
  });

  it('libera só quando o banco responde SIM', async () => {
    const { cliente } = clienteQueResponde({ data: true, error: null });
    expect(await conferirAlcada(cliente, 'alvo', 'trocar_senha')).toBeNull();
  });

  it('recusa quando o banco responde NÃO (o alvo tem mais acesso)', async () => {
    const { cliente } = clienteQueResponde({ data: false, error: null });
    const recusa = await conferirAlcada(cliente, 'id-do-felipe', 'trocar_senha');
    expect(recusa?.status).toBe(403);
    expect(recusa?.mensagem).toMatch(/Alterar perfis e permissões/);
    expect(recusa?.mensagem).toMatch(/trocar a senha dela/);
  });

  it('resposta vazia NÃO é "pode" — foi exatamente assim que a trava antiga abria', async () => {
    const { cliente } = clienteQueResponde({ data: null, error: null });
    const recusa = await conferirAlcada(cliente, 'id-do-felipe', 'entrar_como');
    expect(recusa?.status).toBe(403);
  });

  it('erro do banco recusa, em vez de seguir com a chave mestra', async () => {
    // Ex.: a migration da função ainda não foi aplicada, ou o banco caiu.
    const { cliente } = clienteQueResponde({
      data: null,
      error: { message: 'function pode_mexer_na_conta_de does not exist' },
    });
    const recusa = await conferirAlcada(cliente, 'id-do-felipe', 'excluir');
    expect(recusa?.status).toBe(500);
    expect(recusa?.mensagem).toMatch(/nada foi feito/);
  });

  it('falha de rede também recusa', async () => {
    const cliente: ClienteQueConfere = {
      rpc: () => Promise.reject(new Error('rede caiu')),
    };
    const recusa = await conferirAlcada(cliente, 'id-do-felipe', 'entrar_como');
    expect(recusa?.status).toBe(500);
  });

  it('"true" em texto não conta como SIM', async () => {
    // Só o booleano verdadeiro libera. Qualquer coisa "parecida" é recusa.
    const { cliente } = clienteQueResponde({ data: 'true', error: null });
    expect(await conferirAlcada(cliente, 'alvo', 'excluir')).not.toBeNull();
  });
});
