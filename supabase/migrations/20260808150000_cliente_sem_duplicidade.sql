-- =============================================================================
-- Sisteminha (RP System.IO) — Cliente sem duplicidade
-- =============================================================================
--
-- DECISÃO DO FELIPE EM 08/08: não vai ser permitido dois cadastros do mesmo
-- cliente. Se o cliente já tem cadastro, a equipe seleciona o cadastro dele e
-- continua a venda.
--
-- Por que a trava vem pro banco e não fica só na tela:
--
-- Mesma regra que a Opção B estabeleceu para o custo — o que a tela promete
-- tem que valer no banco também. Uma checagem só no navegador falha em três
-- situações reais: duas pessoas cadastrando ao mesmo tempo em dois terminais,
-- importação de planilha (Cadastros > Importar Clientes já existe e passa
-- longe da tela de cadastro) e qualquer chamada feita direto na API.
--
-- O que conta como "o mesmo cliente":
--
--   1. Mesmo CPF/CNPJ  — trava dura, por índice único.
--   2. Mesmo telefone  — trava por gatilho, porque `telefones` é uma lista
--                        (TEXT[]) e índice único não sabe comparar item a
--                        item dentro de lista.
--
-- Nos dois casos a comparação é feita SÓ PELOS DÍGITOS. "123.456.789-00" e
-- "12345678900" são o mesmo CPF; "(17) 99999-1234" e "17999991234" são o
-- mesmo telefone. Sem isso, a trava seria contornada por acidente — bastaria
-- alguém digitar sem pontuação.
--
-- O que NÃO trava, de propósito:
--
--   - Cliente sem CPF e sem telefone. É o caso do balcão com fila; exigir
--     documento pra cadastrar empurraria a equipe pra vender sem cliente
--     nenhum, que é pior.
--   - Nome parecido. "João Silva" e "Joao Silva" podem ser duas pessoas de
--     verdade. Nome é pista pra tela sugerir, nunca motivo pra recusar.
--   - Cliente excluído (ativo = false). Se alguém excluiu e depois cadastra
--     de novo, o cadastro novo passa — senão o sistema recusaria por causa de
--     um registro que a equipe não enxerga em lugar nenhum.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. INSCRIÇÃO ESTADUAL — o campo que faltava pra pessoa jurídica
-- -----------------------------------------------------------------------------
-- `clientes` tem `rg`, que é documento de pessoa física. Empresa não tem RG:
-- tem Inscrição Estadual. Guardar IE dentro da coluna `rg` funcionaria hoje e
-- daria dor de cabeça no dia da nota fiscal, quando os dois viram campos
-- diferentes e ninguém sabe qual registro é qual. `fornecedores` já tem a
-- coluna separada desde a 20260801000003 — é só igualar.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT;

COMMENT ON COLUMN public.clientes.inscricao_estadual IS
  'Pessoa jurídica. Pessoa física usa `rg`.';


-- -----------------------------------------------------------------------------
-- 2. SÓ OS DÍGITOS — a regra de comparação, num lugar só
-- -----------------------------------------------------------------------------
-- IMMUTABLE porque índice exige: o Postgres precisa da garantia de que a
-- mesma entrada devolve sempre a mesma saída, senão o índice apodrece.

CREATE OR REPLACE FUNCTION public.somente_digitos(_texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(COALESCE(_texto, ''), '\D', '', 'g');
$$;

COMMENT ON FUNCTION public.somente_digitos(TEXT) IS
  'Tira pontuação de documento/telefone. Usada pela trava de cliente repetido '
  'e pela busca de cliente semelhante — uma regra só, para tela e banco nunca '
  'discordarem sobre o que é "o mesmo número".';


-- -----------------------------------------------------------------------------
-- 3. CONFERÊNCIA ANTES DE TRANCAR
-- -----------------------------------------------------------------------------
-- O banco de produção tem cadastro real. Se já existir cliente repetido lá
-- dentro, o índice único abaixo falha com a mensagem crua do Postgres, que
-- não diz QUEM está repetido. Melhor abortar aqui, avisando exatamente o que
-- precisa ser resolvido antes.

DO $$
DECLARE
  repetidos TEXT;
BEGIN
  SELECT string_agg(amostra, E'\n')
    INTO repetidos
  FROM (
    SELECT
      '  • documento ' || public.somente_digitos(cpf_cnpj)
        || ' — ' || string_agg(nome, ' / ' ORDER BY created_at) AS amostra
    FROM public.clientes
    WHERE ativo
      AND COALESCE(cpf_cnpj, '') <> ''
      AND public.somente_digitos(cpf_cnpj) <> ''
    GROUP BY tenant_id, public.somente_digitos(cpf_cnpj)
    HAVING count(*) > 1
    LIMIT 20
  ) AS d;

  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION
      E'Existem clientes com o mesmo CPF/CNPJ já cadastrados. Junte ou exclua os repetidos em Cadastros > Clientes e rode esta migration de novo:\n%',
      repetidos;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 4. TRAVA DE CPF/CNPJ
-- -----------------------------------------------------------------------------
-- Por loja (tenant), não global: duas lojas diferentes podem ter o mesmo
-- cliente, e uma não pode nem saber da existência da outra.

DROP INDEX IF EXISTS public.clientes_documento_unico;

CREATE UNIQUE INDEX clientes_documento_unico
  ON public.clientes (tenant_id, public.somente_digitos(cpf_cnpj))
  WHERE ativo
    AND cpf_cnpj IS NOT NULL
    AND public.somente_digitos(cpf_cnpj) <> '';

COMMENT ON INDEX public.clientes_documento_unico IS
  'Decisão de 08/08: um cliente, um cadastro. Só vale para cliente ativo — '
  'cadastro excluído não pode bloquear um cadastro novo que a equipe não '
  'consegue ver.';


-- -----------------------------------------------------------------------------
-- 5. TRAVA DE TELEFONE
-- -----------------------------------------------------------------------------
-- Índice único não resolve aqui: `telefones` é lista, e o mesmo número pode
-- estar na primeira posição de um cadastro e na segunda de outro.
--
-- Mínimo de 8 dígitos de propósito: telefone pela metade ("9999", um ramal,
-- um "0") não identifica ninguém, e travar por causa dele faria a equipe
-- perder cadastro legítimo. Abaixo disso o número é guardado, mas não conta
-- como identidade.

CREATE OR REPLACE FUNCTION public.impedir_cliente_telefone_repetido()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER para a trava falhar FECHADA. Sem isso, ela enxergaria só os
-- clientes que o usuário da vez tem permissão de ler — e no dia em que essa
-- leitura for restringida por papel, duplicado passaria em silêncio, que é o
-- pior jeito de uma trava falhar. O filtro de tenant continua explícito no
-- WHERE, então nada vaza entre lojas.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ja_existe RECORD;
BEGIN
  -- Cadastro excluído não disputa telefone com ninguém.
  IF NOT COALESCE(NEW.ativo, true) THEN
    RETURN NEW;
  END IF;

  IF NEW.telefones IS NULL OR array_length(NEW.telefones, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id, c.nome, public.somente_digitos(t_existente) AS numero
    INTO ja_existe
  FROM public.clientes c
  CROSS JOIN LATERAL unnest(c.telefones) AS t_existente
  CROSS JOIN LATERAL unnest(NEW.telefones) AS t_novo
  WHERE c.tenant_id = NEW.tenant_id
    AND c.id IS DISTINCT FROM NEW.id
    AND c.ativo
    AND length(public.somente_digitos(t_existente)) >= 8
    AND public.somente_digitos(t_existente) = public.somente_digitos(t_novo)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'O telefone % já está no cadastro de %. Use o cadastro que já existe em vez de criar outro.',
      ja_existe.numero, ja_existe.nome
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cliente_telefone_repetido ON public.clientes;

CREATE TRIGGER trg_cliente_telefone_repetido
  BEFORE INSERT OR UPDATE OF telefones, tenant_id, ativo ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_cliente_telefone_repetido();


-- -----------------------------------------------------------------------------
-- 6. BUSCA DE CLIENTE SEMELHANTE — o que a tela usa ANTES de tentar gravar
-- -----------------------------------------------------------------------------
-- A trava acima recusa. Recusar sem oferecer saída é tela quebrada: o vendedor
-- fica com o cliente na frente e uma mensagem de erro. Então a tela consulta
-- isto primeiro e mostra o cadastro que já existe, pra ser selecionado.
--
-- Roda com o privilégio de quem chama (sem SECURITY DEFINER), então a RLS de
-- `clientes` continua valendo: ninguém enxerga cliente de outra loja por aqui.
--
-- Usa a MESMA função de normalização da trava. Se um dia a regra mudar, muda
-- nos dois lugares junto — que é o ponto de ela existir.

CREATE OR REPLACE FUNCTION public.buscar_clientes_semelhantes(
  _documento TEXT DEFAULT NULL,
  _telefone  TEXT DEFAULT NULL,
  _nome      TEXT DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  nome           TEXT,
  cpf_cnpj       TEXT,
  telefones      TEXT[],
  liberado_venda BOOLEAN,
  motivo         TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.nome,
    c.cpf_cnpj,
    c.telefones,
    -- Quem for usar o cadastro encontrado precisa saber, na mesma tela, se
    -- ele está bloqueado para venda — senão descobre só no fechamento.
    COALESCE(c.liberado_venda, true) AS liberado_venda,
    CASE
      WHEN COALESCE(public.somente_digitos(_documento), '') <> ''
       AND public.somente_digitos(c.cpf_cnpj) = public.somente_digitos(_documento)
        THEN 'documento'
      WHEN EXISTS (
        SELECT 1
        FROM unnest(c.telefones) AS t
        WHERE length(public.somente_digitos(t)) >= 8
          AND public.somente_digitos(t) = public.somente_digitos(_telefone)
      ) THEN 'telefone'
      ELSE 'nome'
    END AS motivo
  FROM public.clientes c
  WHERE c.ativo
    AND (
      -- Documento igual (só quando veio documento de verdade)
      (
        COALESCE(public.somente_digitos(_documento), '') <> ''
        AND public.somente_digitos(c.cpf_cnpj) = public.somente_digitos(_documento)
      )
      -- Telefone igual (só a partir de 8 dígitos, igual à trava)
      OR (
        length(COALESCE(public.somente_digitos(_telefone), '')) >= 8
        AND EXISTS (
          SELECT 1
          FROM unnest(c.telefones) AS t
          WHERE public.somente_digitos(t) = public.somente_digitos(_telefone)
        )
      )
      -- Nome igual, ignorando maiúscula/minúscula e espaço sobrando.
      -- Não trava nada: serve só pra tela avisar "já tem um João Silva aqui,
      -- é esse mesmo?" antes de criar o segundo.
      OR (
        length(COALESCE(btrim(_nome), '')) >= 3
        AND lower(btrim(c.nome)) = lower(btrim(_nome))
      )
    )
  ORDER BY c.nome
  LIMIT 10;
$$;

COMMENT ON FUNCTION public.buscar_clientes_semelhantes(TEXT, TEXT, TEXT) IS
  'Procura cadastro já existente por documento, telefone ou nome idêntico. '
  'Documento e telefone são os que a trava recusa; nome é só aviso. A tela '
  'chama antes de gravar, para oferecer o cadastro existente em vez de dar '
  'erro na cara do vendedor.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) A trava de documento existe?
--    SELECT indexname FROM pg_indexes
--     WHERE tablename = 'clientes' AND indexname = 'clientes_documento_unico';
--
-- 2) A trava de telefone existe?
--    SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.clientes'::regclass
--       AND tgname = 'trg_cliente_telefone_repetido';
--
-- 3) A busca responde? (troque pelo telefone de um cliente que já existe)
--    SELECT * FROM public.buscar_clientes_semelhantes(NULL, '17999991234', NULL);
--
-- 4) A coluna nova está lá?
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'clientes' AND column_name = 'inscricao_estadual';
-- =============================================================================
