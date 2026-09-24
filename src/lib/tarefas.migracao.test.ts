import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A migration 20260924162000 (achados 17 e 19 da revisão de 24/09), conferida
 * no texto.
 *
 * O banco de produção tem dados reais e a migration é aplicada pela
 * orquestração, não pelo teste. Então aqui se prende o que ela PRECISA ter
 * para cumprir as regras da casa (CLAUDE.md, "portas fechadas") e o que ela
 * promete: o feito nasce sem conferência e só no dia certo, e ninguém mexe na
 * conferência sem ser quem confere. Quem apagar uma dessas linhas por engano
 * leva a reprovação aqui, antes de chegar ao banco.
 */

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260924162000_tarefas_feito_e_conferencia_valem_no_banco.sql'),
  'utf-8',
);

/** O corpo de uma função (de `CREATE OR REPLACE FUNCTION nome` até o `$$;`). */
function corpoDe(nome: string): string {
  const inicio = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}()`);
  expect(inicio, `a migration não cria ${nome}`).toBeGreaterThanOrEqual(0);
  const fim = SQL.indexOf('$$;', SQL.indexOf('AS $$', inicio));
  return SQL.slice(inicio, fim);
}

describe('Migration 20260924162000 — o feito e a conferência valem no banco', () => {
  it('o feito do dia ganha gatilho ANTES de gravar', () => {
    expect(SQL).toMatch(
      /CREATE TRIGGER travas_da_conclusao_nova\s+BEFORE INSERT ON public\.tarefas_conclusoes\s+FOR EACH ROW EXECUTE FUNCTION public\.travas_da_conclusao_nova\(\)/,
    );
  });

  it('quem não confere: o feito nasce sem conferência e só no dia de hoje da loja (achado 17)', () => {
    const corpo = corpoDe('travas_da_conclusao_nova');
    expect(corpo).toContain("public.has_permission(auth.uid(), 'tasks.review')");
    expect(corpo).toContain('NEW.conferida_em := NULL;');
    expect(corpo).toContain('NEW.conferida_por := NULL;');
    expect(corpo).toContain("(now() AT TIME ZONE 'America/Sao_Paulo')::date");
    expect(corpo).toContain('NEW.dia IS DISTINCT FROM v_hoje');
    // Quem marcou e quando: do banco, nunca da tela.
    expect(corpo).toContain('NEW.concluida_por := auth.uid();');
    expect(corpo).toContain('NEW.concluida_em := now();');
  });

  it('ninguém marca feito em dia que não é da tarefa (achado 19)', () => {
    const corpo = corpoDe('travas_da_conclusao_nova');
    expect(corpo).toContain('EXTRACT(DOW FROM NEW.dia)::smallint = ANY (v_dias)');
  });

  it('tarefa nova não nasce conferida pela mão de quem não confere', () => {
    const corpo = corpoDe('travas_da_tarefa_nova');
    expect(corpo).toContain("NOT public.has_permission(auth.uid(), 'tasks.review')");
    expect(corpo).toContain('NEW.conferida_em := NULL;');
  });

  it('mexer na conferência (inclusive desfazer) é só de quem confere', () => {
    const corpo = corpoDe('travas_das_tarefas');
    // A condição antiga tinha "AND NEW.conferida_em IS NOT NULL": desfazer passava.
    expect(corpo).not.toMatch(/AND NEW\.conferida_em IS NOT NULL AND NOT v_confere/);
    expect(corpo).toMatch(/OR NEW\.conferida_por IS DISTINCT FROM OLD\.conferida_por\)\s+AND NOT v_confere THEN/);
  });

  it('quem não confere só desmarca o feito de hoje; apagar a tarefa de vez leva os feitos junto', () => {
    const corpo = corpoDe('trava_conclusao_conferida');
    expect(corpo).toContain("OLD.dia IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date");
    expect(corpo).toContain('pg_trigger_depth() > 1');
  });

  it('portas fechadas: toda função de gatilho perde o EXECUTE de PUBLIC, anon e authenticated', () => {
    for (const nome of [
      'travas_da_conclusao_nova',
      'trava_conclusao_conferida',
      'travas_da_tarefa_nova',
      'travas_das_tarefas',
    ]) {
      expect(SQL).toContain(`REVOKE EXECUTE ON FUNCTION public.${nome}() FROM PUBLIC, anon, authenticated;`);
    }
  });

  it('termina com o bloco de conferência que derruba a transação', () => {
    expect(SQL).toContain('DO $verifica$');
    expect(SQL).toContain("NOTIFY pgrst, 'reload schema';");
    // Nenhuma policy nova: se aparecer uma, tem que ser TO authenticated.
    expect(SQL).not.toMatch(/CREATE POLICY/);
  });
});
