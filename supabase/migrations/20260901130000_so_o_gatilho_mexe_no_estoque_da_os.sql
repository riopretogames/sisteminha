-- =============================================================================
-- SÓ O GATILHO MEXE NO ESTOQUE DA OS
-- =============================================================================
--
-- Buraco na migration de meia hora atrás (20260901120000), achado ao conferir
-- os tipos gerados: `mover_pecas_da_os` apareceu na lista de funções que o
-- sistema oferece para quem está logado.
--
-- Ela é `SECURITY DEFINER` — roda com privilégio de dono, porque precisa mexer
-- no estoque e escrever na auditoria. Nasceu para ser chamada **pelo gatilho**,
-- e só. Do jeito que ficou, qualquer pessoa logada podia chamá-la direto,
-- passando o número da OS e "devolver = sim" quantas vezes quisesse: o estoque
-- subiria sozinho, com movimento de entrada bonitinho no histórico dizendo que
-- a OS foi recusada.
--
-- É a regra da chave mestra do CLAUDE.md pelo lado do banco: quem usa
-- privilégio de dono ou confere o crachá de quem pediu, ou não pode ser
-- chamado por ninguém de fora. Aqui a segunda opção é a certa — não existe
-- caso em que uma tela precise mover peça de OS por conta própria; quem sabe a
-- hora é o gatilho, que enxerga a OS parando ou voltando a andar.
--
-- Tirar a permissão não afeta o gatilho: ele roda como dono da função, não
-- como a pessoa que salvou a OS.

REVOKE ALL ON FUNCTION public.mover_pecas_da_os(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mover_pecas_da_os(UUID, TEXT, BOOLEAN, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.mover_pecas_da_os(UUID, TEXT, BOOLEAN, TEXT) FROM anon;

COMMENT ON FUNCTION public.mover_pecas_da_os(UUID, TEXT, BOOLEAN, TEXT) IS
  'Devolve ao estoque (ou desconta de novo) as peças lançadas numa OS, com auditoria em movimentos_estoque. USO INTERNO: só o gatilho acertar_estoque_da_os chama — a permissão de execução foi revogada de todo mundo de propósito, porque a função mexe no estoque com privilégio de dono e não pergunta nada a ninguém.';

NOTIFY pgrst, 'reload schema';
