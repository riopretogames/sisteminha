-- =============================================================================
-- RPG System.IO — Arquivar usuário: some da tela, histórico fica inteiro
-- =============================================================================
--
-- Decisão do Felipe em 23/08, com estas palavras: *"quero que possa apagar
-- qualquer um, porém não apague no banco de dados as vendas ou OS já feitas
-- pelo perfil — apague somente do front end, não dos dados do backend"*.
--
-- É exatamente o certo, e o motivo é técnico: `profiles.id` aponta para a
-- conta de acesso em CASCATA. Apagar a conta apaga o cadastro junto, e aí
-- `vendas.vendedor_id` vira NULL (é SET NULL) — a venda continua existindo,
-- mas SEM NINGUÉM. O nome some do comprovante e do ranking, para sempre, e o
-- banco faz isso em silêncio, sem erro nenhum.
--
-- Arquivar resolve: o cadastro fica onde está, então toda venda e toda OS
-- seguem mostrando quem atendeu. O que muda é só a visibilidade.
--
-- O botão da tela é UM SÓ e o sistema escolhe o caminho:
--
--   • pessoa SEM nenhum rastro  → apaga de verdade (não há o que preservar,
--     e deixar cadastro morto no banco é sujeira)
--   • pessoa COM rastro         → arquiva (some da lista, histórico intacto)
--
-- Arquivado NÃO é o mesmo que inativo. Inativo é quem está afastado e pode
-- voltar — continua na lista, à vista. Arquivado é quem saiu de vez e não
-- precisa mais ocupar espaço na tela do dia a dia.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.arquivado_em IS
  'Quando a pessoa foi tirada da lista de Usuários. O cadastro CONTINUA no banco de propósito: é ele que faz a venda e a OS antigas ainda mostrarem quem atendeu. NULL = aparece na tela normalmente.';

-- Índice parcial: a tela pede "só os não arquivados" em toda carga, e esse é
-- o caso comum. Indexar só as linhas ativas mantém o índice pequeno.
CREATE INDEX IF NOT EXISTS idx_profiles_nao_arquivados
  ON public.profiles (tenant_id)
  WHERE arquivado_em IS NULL;


-- =============================================================================
-- Arquivar tira o acesso junto
-- =============================================================================
--
-- Sem isto, alguém arquivado sumiria da tela mas continuaria entrando no
-- sistema — o pior resultado possível, porque ninguém mais o vê para
-- desativar. Um gatilho garante que as duas coisas andem juntas, mesmo que
-- alguma tela futura esqueça de fazer as duas.

CREATE OR REPLACE FUNCTION public.trg_arquivar_tira_acesso()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.arquivado_em IS NOT NULL AND OLD.arquivado_em IS NULL THEN
    NEW.ativo := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arquivar_tira_acesso ON public.profiles;
CREATE TRIGGER trg_arquivar_tira_acesso
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_arquivar_tira_acesso();

COMMENT ON FUNCTION public.trg_arquivar_tira_acesso IS
  'Arquivar sempre desativa junto. Sem isso, alguém sumiria da lista continuando a entrar no sistema — e ninguém mais o veria para desativar.';


-- =============================================================================
-- Proteção: o último administrador ativo não pode ser arquivado
-- =============================================================================
--
-- Mesma regra que já vale para desativar e para trocar papel. Sem um
-- administrador ativo ninguém consegue mais conceder permissão a ninguém, e a
-- loja fica trancada do lado de fora — com a diferença de que o arquivado
-- nem aparece na lista para alguém desfazer.

CREATE OR REPLACE FUNCTION public.trg_protege_ultimo_admin_ao_arquivar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_e_admin BOOLEAN;
  v_outros  INTEGER;
BEGIN
  IF NEW.arquivado_em IS NULL OR OLD.arquivado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.id AND role = 'administrador'
  ) INTO v_e_admin;

  IF NOT v_e_admin THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_outros
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'administrador'
    AND p.ativo = true
    AND p.arquivado_em IS NULL
    AND ur.user_id <> NEW.id;

  IF v_outros = 0 THEN
    RAISE EXCEPTION
      'Não dá para arquivar o último administrador ativo da loja: ninguém mais conseguiria dar permissão a ninguém.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protege_ultimo_admin_ao_arquivar ON public.profiles;
CREATE TRIGGER trg_protege_ultimo_admin_ao_arquivar
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_protege_ultimo_admin_ao_arquivar();
