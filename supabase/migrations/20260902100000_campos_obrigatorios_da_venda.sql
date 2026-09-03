-- =============================================================================
-- A VENDA ENTRA NA LISTA DE CAMPOS OBRIGATÓRIOS
-- =============================================================================
--
-- Pedido do Felipe em 02/09: *"tem que se opinar os campos que são
-- obrigatórios, tanto na aba de nova venda quanto na aba de nova ordem de
-- serviço, e quem deve selecionar esse é o administrador"*.
--
-- A tabela não muda: `formulario` é texto livre de propósito (a lista oficial
-- mora em `src/config/camposObrigatorios.ts`, mesma ideia de `catalogos.tipo`),
-- então 'venda' passa a valer sem alterar coluna nenhuma. O que muda é o
-- comentário, que ainda dizia "cliente, os" — e comentário de banco errado é
-- pior que comentário nenhum, porque o próximo a olhar acredita nele.
--
-- Quem pode gravar também não muda, e já era o que o Felipe pediu: as policies
-- desta tabela exigem `settings.edit`, permissão que só o Administrador tem
-- (o gerente é excluído dela na migration de RBAC, 20260801000002). Ou seja, a
-- exigência "quem seleciona é o administrador" vale na tela E no banco desde
-- 30/08 — não é uma trava nova, é uma que já estava de pé.

COMMENT ON TABLE public.campos_obrigatorios IS
  'O que cada loja exige em cada formulário. Ausência de linha = vale o padrão do código (src/config/camposObrigatorios.ts). Gravar exige settings.edit, permissão só do Administrador. Pedido do Felipe em 27 e 28/08, pensando na venda do sistema para outras lojas; a venda do PDV entrou em 02/09.';

COMMENT ON COLUMN public.campos_obrigatorios.formulario IS
  'Qual formulário: venda, os, cliente. Texto livre de propósito — a lista oficial mora em src/config/camposObrigatorios.ts, e formulário novo não precisa de migration.';

-- -----------------------------------------------------------------------------
-- CONFERE QUE O COMENTÁRIO CHEGOU
-- -----------------------------------------------------------------------------
-- Migration aplicada às cegas já custou caro aqui (o caso da "tercerizada"
-- escrita errada, em 31/08). Este bloco derruba a transação se o banco não
-- tiver ficado com o texto novo.
DO $verifica$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_description d
      JOIN pg_class c ON c.oid = d.objoid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid
     WHERE n.nspname = 'public'
       AND c.relname = 'campos_obrigatorios'
       AND a.attname = 'formulario'
       AND d.description LIKE '%venda, os, cliente%'
  ) THEN
    RAISE EXCEPTION
      'O comentário da coluna campos_obrigatorios.formulario continua sem citar a venda.';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
