-- =============================================================================
-- Sisteminha (RPG System.IO) — Tarefas da equipe (o Trello e o Monday em casa)
-- =============================================================================
--
-- Pedido do Felipe em 23/09/2026: "Eu uso o Trello e o Monday para a gestão de
-- demandas. Estou gastando muito tempo nisso, sendo que eu posso fazer um
-- sistema parecido." E, na mesma conversa: "é só para gestão de tarefas" —
-- vídeo, curso e coisa pessoal continuam no Trello.
--
-- O QUE ESTA MIGRATION CRIA
--
--   tarefas_quadros       o quadro ("Loja", "Assistência")
--   tarefas_listas        as colunas do quadro (uma por pessoa, ou de apoio)
--   tarefas               o cartão
--   tarefas_responsaveis  quem faz (várias pessoas por tarefa)
--   tarefas_etiquetas     etiquetas coloridas (itens do catálogo tarefa_etiqueta)
--   tarefas_checklist     os subitens com caixinha
--   tarefas_comentarios   a conversa dentro do cartão
--   tarefas_conclusoes    o "feito de hoje" das tarefas que se repetem
--
-- A ÚLTIMA É A PEÇA MAIS IMPORTANTE. No Monday o Felipe zera o status de
-- cada tarefa À MÃO todo dia, porque a automação do plano dele tem limite de
-- 250 ações por mês. Aqui, marcar "feito" numa tarefa recorrente grava uma
-- linha (tarefa, dia). Amanhã é outro dia: a tarefa aparece pendente de novo
-- sem ninguém mexer, e o histórico de quem fez o quê fica guardado.
--
-- REGRAS DA CASA QUE ESTE ARQUIVO SEGUE (CLAUDE.md)
--
--   - Toda policy é TO authenticated; o anon não tem nada.
--   - Função nova que a tela ou a policy chama ganha GRANT EXECUTE explícito;
--     função de gatilho nasce fechada (REVOKE ... FROM PUBLIC, anon,
--     authenticated), porque o ALTER DEFAULT PRIVILEGES não fecha nada.
--   - Permissão nova entra no catálogo E é concedida aos perfis na hora —
--     senão a tela some do menu até para o dono da loja.
--   - Bloco de conferência no fim derruba a transação se algo ficou aberto.
--
-- Não é migration destrutiva: só cria tabela, função, policy e linhas de
-- catálogo. Nenhuma tabela existente muda.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. PERMISSÕES
-- -----------------------------------------------------------------------------
-- `tasks.view`   ver os quadros e as tarefas
-- `tasks.edit`   criar, editar, mover e arquivar tarefas e listas
-- `tasks.manage` criar e arquivar quadros; apagar de vez
--
-- Todo mundo vê e edita de fábrica — é assim que a equipe usa o Trello hoje
-- (qualquer um cria e arrasta cartão). O Felipe restringe em Perfis e
-- Permissões se quiser. Quadro é estrutura: só quem gerencia mexe.

INSERT INTO public.permissions (key, modulo, descricao) VALUES
  ('tasks.view',   'Tarefas', 'Ver os quadros de tarefas da equipe'),
  ('tasks.edit',   'Tarefas', 'Criar, editar, mover e arquivar tarefas e listas'),
  ('tasks.manage', 'Tarefas', 'Criar e arquivar quadros de tarefas; apagar de vez')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('administrador',   'tasks.view'),
  ('administrador',   'tasks.edit'),
  ('administrador',   'tasks.manage'),
  ('gerente',         'tasks.view'),
  ('gerente',         'tasks.edit'),
  ('gerente',         'tasks.manage'),
  ('gerente_tecnico', 'tasks.view'),
  ('gerente_tecnico', 'tasks.edit'),
  ('gerente_tecnico', 'tasks.manage'),
  ('vendedor',        'tasks.view'),
  ('vendedor',        'tasks.edit'),
  ('tecnico',         'tasks.view'),
  ('tecnico',         'tasks.edit')
ON CONFLICT (role, permission_key) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. CATÁLOGOS (Listas do Sistema): período do dia e etiqueta
-- -----------------------------------------------------------------------------
-- Regra das listas editáveis (08/08): o que a loja escolhe não é enum. Os
-- turnos ("7 às 11") e as etiquetas são da loja, então moram em `catalogos`
-- e aparecem sozinhos na tela. Os itens abaixo são só o ponto de partida —
-- copiados do Monday e do Trello do Felipe.

INSERT INTO public.catalogos (tenant_id, tipo, descricao, cor, ordem, ativo, padrao)
SELECT t.id, v.tipo, v.descricao, v.cor, v.ordem, true, v.padrao
FROM public.tenants t
CROSS JOIN (VALUES
  ('tarefa_periodo',  'Manhã (7 às 11)',        NULL,                         10, false),
  ('tarefa_periodo',  'Meio do dia (11 às 15)', NULL,                         20, false),
  ('tarefa_periodo',  'Tarde (15 às 19)',       NULL,                         30, false),
  ('tarefa_periodo',  'Livre',                  NULL,                         40, true),
  ('tarefa_etiqueta', 'Atenção',                'bg-red-500 text-white',      10, false),
  ('tarefa_etiqueta', 'Prioridade',             'bg-pink-500 text-white',     20, false),
  ('tarefa_etiqueta', 'Rotina',                 'bg-emerald-500 text-white',  30, false),
  ('tarefa_etiqueta', 'Conteúdo',               'bg-purple-500 text-white',   40, false)
) AS v(tipo, descricao, cor, ordem, padrao)
ON CONFLICT (tenant_id, tipo, descricao) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. TABELAS
-- -----------------------------------------------------------------------------

CREATE TABLE public.tarefas_quadros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  descricao     TEXT,
  -- Classe de cor da paleta de src/lib/cores.ts ("bg-blue-500 text-white").
  cor           TEXT,
  ordem         DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Arquivar, nunca apagar por engano: o quadro some da tela e fica no banco.
  arquivado_em  TIMESTAMPTZ,
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tarefas_quadros IS
  'Quadro de tarefas da equipe (ex.: Loja, Assistência). Pedido do Felipe em 23/09/2026 para substituir Trello e Monday.';

CREATE TABLE public.tarefas_listas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quadro_id      UUID NOT NULL REFERENCES public.tarefas_quadros(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  cor            TEXT,
  -- A "coluna do Pedro" sabe que é do Pedro: tarefa criada nela já nasce
  -- com ele como responsável, e ele pode marcar o andamento mesmo sem
  -- tasks.edit (ver eh_responsavel_da_tarefa).
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ordem          DOUBLE PRECISION NOT NULL DEFAULT 0,
  arquivada_em   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tarefas_listas IS
  'Colunas de um quadro de tarefas. Uma por pessoa (responsavel_id) ou de apoio (Anúncios, Compras).';

CREATE TABLE public.tarefas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quadro_id     UUID NOT NULL REFERENCES public.tarefas_quadros(id) ON DELETE CASCADE,
  lista_id      UUID NOT NULL REFERENCES public.tarefas_listas(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 200),
  descricao     TEXT,
  prioridade    TEXT NOT NULL DEFAULT 'normal'
                CHECK (prioridade IN ('livre', 'baixa', 'normal', 'alta', 'urgente')),
  -- 'pausada' é o "NÃO FAZER POR ENQUANTO" do Trello. 'feito' só vale para
  -- tarefa avulsa; a recorrente registra o feito de cada dia em
  -- tarefas_conclusoes (ver gatilho travas_das_tarefas).
  status        TEXT NOT NULL DEFAULT 'nao_iniciado'
                CHECK (status IN ('nao_iniciado', 'fazendo', 'feito', 'pausada')),
  -- 0 = domingo ... 6 = sábado. Os sete = "todos os dias". Vazia = avulsa.
  dias_semana   SMALLINT[] NOT NULL DEFAULT '{}'
                CHECK (dias_semana <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]),
  -- Turno do dia, item do catálogo tarefa_periodo (7 às 11, 11 às 15...).
  periodo_id    UUID REFERENCES public.catalogos(id) ON DELETE SET NULL
                CHECK (public.catalogo_e_do_tipo(periodo_id, 'tarefa_periodo')),
  -- Data prometida (tarefa avulsa). Passou e não concluiu = atrasada.
  prazo         DATE,
  concluida_em  TIMESTAMPTZ,
  -- Decimal de propósito: mover um cartão é UM update — ele recebe a média
  -- entre os vizinhos (src/lib/tarefas.ts, ordemEntre).
  ordem         DOUBLE PRECISION NOT NULL DEFAULT 0,
  arquivada_em  TIMESTAMPTZ,
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tarefas IS
  'O cartão do quadro. dias_semana não vazia = tarefa que se repete (o feito de cada dia vai em tarefas_conclusoes); vazia = avulsa (feita quando concluida_em preenche).';
COMMENT ON COLUMN public.tarefas.dias_semana IS
  '0=domingo ... 6=sábado. Os sete = todos os dias. Vazia = tarefa avulsa.';
COMMENT ON COLUMN public.tarefas.status IS
  'nao_iniciado, fazendo, feito (só avulsa), pausada (= não fazer por enquanto).';

CREATE TABLE public.tarefas_responsaveis (
  tarefa_id  UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, user_id)
);

CREATE TABLE public.tarefas_etiquetas (
  tarefa_id   UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  catalogo_id UUID NOT NULL REFERENCES public.catalogos(id) ON DELETE CASCADE
              CHECK (public.catalogo_e_do_tipo(catalogo_id, 'tarefa_etiqueta')),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (tarefa_id, catalogo_id)
);

CREATE TABLE public.tarefas_checklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tarefa_id  UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 200),
  feito      BOOLEAN NOT NULL DEFAULT false,
  ordem      DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tarefas_comentarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tarefa_id  UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  autor_id   UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tarefas_conclusoes (
  tarefa_id     UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  -- O dia a que o "feito" se refere (data local da loja, escrita pela tela).
  dia           DATE NOT NULL,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  concluida_por UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  concluida_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, dia)
);

COMMENT ON TABLE public.tarefas_conclusoes IS
  'Uma linha por (tarefa, dia): o feito de hoje das tarefas recorrentes. Amanhã a tarefa aparece pendente de novo sem ninguém zerar nada.';

-- Índices das consultas que a tela faz: "tudo deste quadro", "esta coluna em
-- ordem", "as tarefas desta pessoa", "o que foi feito hoje".
CREATE INDEX idx_tarefas_quadro   ON public.tarefas(tenant_id, quadro_id) WHERE arquivada_em IS NULL;
CREATE INDEX idx_tarefas_lista    ON public.tarefas(lista_id, ordem);
CREATE INDEX idx_tarefas_listas_quadro ON public.tarefas_listas(quadro_id, ordem);
CREATE INDEX idx_tarefas_responsaveis_user ON public.tarefas_responsaveis(user_id);
CREATE INDEX idx_tarefas_conclusoes_dia ON public.tarefas_conclusoes(tenant_id, dia);
CREATE INDEX idx_tarefas_checklist_tarefa ON public.tarefas_checklist(tarefa_id, ordem);
CREATE INDEX idx_tarefas_comentarios_tarefa ON public.tarefas_comentarios(tarefa_id, created_at);

CREATE TRIGGER update_tarefas_quadros_updated_at
  BEFORE UPDATE ON public.tarefas_quadros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tarefas_listas_updated_at
  BEFORE UPDATE ON public.tarefas_listas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tarefas_updated_at
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tarefas_checklist_updated_at
  BEFORE UPDATE ON public.tarefas_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Quadro é estrutura da loja: quem criou e quem arquivou fica na auditoria.
-- Tarefa não entra — cada arrastar de cartão viraria uma linha de log.
CREATE TRIGGER audit_tarefas_quadros
  AFTER INSERT OR UPDATE OR DELETE ON public.tarefas_quadros
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();


-- -----------------------------------------------------------------------------
-- 4. FUNÇÕES E GATILHOS
-- -----------------------------------------------------------------------------

-- 4a. A tarefa herda quadro e loja da lista em que está.
--
-- A tela manda só lista_id. Sem isto, um cartão poderia apontar para uma
-- lista de um quadro e um quadro de outro — e o Kanban desenharia o cartão
-- num lugar e a Tabela em outro. Roda ANTES da policy WITH CHECK, que
-- confere o tenant_id já corrigido.
CREATE OR REPLACE FUNCTION public.tarefa_herda_da_lista()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quadro UUID;
  v_tenant UUID;
BEGIN
  SELECT quadro_id, tenant_id INTO v_quadro, v_tenant
    FROM public.tarefas_listas WHERE id = NEW.lista_id;
  IF v_quadro IS NULL THEN
    RAISE EXCEPTION 'A lista da tarefa não existe.';
  END IF;
  NEW.quadro_id := v_quadro;
  NEW.tenant_id := v_tenant;
  IF TG_OP = 'INSERT' AND NEW.criado_por IS NULL THEN
    NEW.criado_por := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tarefa_herda_da_lista() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tarefa_herda_da_lista
  BEFORE INSERT OR UPDATE OF lista_id ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.tarefa_herda_da_lista();

-- A lista herda a loja do quadro, pelo mesmo motivo.
CREATE OR REPLACE FUNCTION public.lista_herda_do_quadro()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT tenant_id INTO NEW.tenant_id FROM public.tarefas_quadros WHERE id = NEW.quadro_id;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'O quadro da lista não existe.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lista_herda_do_quadro() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lista_herda_do_quadro
  BEFORE INSERT OR UPDATE OF quadro_id ON public.tarefas_listas
  FOR EACH ROW EXECUTE FUNCTION public.lista_herda_do_quadro();

-- 4b. As tabelas filhas herdam a loja da tarefa.
--
-- Responsável, etiqueta, checklist, comentário e conclusão só existem por
-- causa de uma tarefa. A tela não precisa mandar tenant_id; e mesmo que
-- mande errado, o gatilho corrige antes da policy conferir.
CREATE OR REPLACE FUNCTION public.herda_tenant_da_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT tenant_id INTO NEW.tenant_id FROM public.tarefas WHERE id = NEW.tarefa_id;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'A tarefa não existe.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.herda_tenant_da_tarefa() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER herda_tenant_da_tarefa BEFORE INSERT ON public.tarefas_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.herda_tenant_da_tarefa();
CREATE TRIGGER herda_tenant_da_tarefa BEFORE INSERT ON public.tarefas_etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.herda_tenant_da_tarefa();
CREATE TRIGGER herda_tenant_da_tarefa BEFORE INSERT ON public.tarefas_checklist
  FOR EACH ROW EXECUTE FUNCTION public.herda_tenant_da_tarefa();
CREATE TRIGGER herda_tenant_da_tarefa BEFORE INSERT ON public.tarefas_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.herda_tenant_da_tarefa();
CREATE TRIGGER herda_tenant_da_tarefa BEFORE INSERT ON public.tarefas_conclusoes
  FOR EACH ROW EXECUTE FUNCTION public.herda_tenant_da_tarefa();

-- 4c. "Esta pessoa é responsável por esta tarefa?"
--
-- Responsável = está em tarefas_responsaveis, OU a coluna em que a tarefa
-- está é a coluna dela (tarefas_listas.responsavel_id). É o que deixa o
-- funcionário marcar o andamento das próprias tarefas mesmo sem tasks.edit.
--
-- SECURITY DEFINER porque roda dentro de policy: a policy de tarefas
-- consultaria tarefas_responsaveis, cuja policy consultaria tarefas — e o
-- banco recusa a recursão. Usada em policy, precisa de EXECUTE para
-- authenticated (roda como o próprio usuário).
CREATE OR REPLACE FUNCTION public.eh_responsavel_da_tarefa(_tarefa_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.tarefas_responsaveis r
       WHERE r.tarefa_id = _tarefa_id AND r.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.tarefas t
        JOIN public.tarefas_listas l ON l.id = t.lista_id
       WHERE t.id = _tarefa_id AND l.responsavel_id = _user_id
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.eh_responsavel_da_tarefa(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_responsavel_da_tarefa(UUID, UUID) TO authenticated;

-- 4d. Quem não tem tasks.edit só mexe no andamento.
--
-- A policy de UPDATE deixa o responsável passar (senão ele não marcaria nem
-- "fazendo"). Este gatilho fecha o resto: sem tasks.edit, qualquer coluna
-- que não seja status/concluida_em/updated_at tem que continuar igual.
-- Regra de custo protegido aplicada aqui — a permissão vale no banco, não
-- só na tela.
--
-- Também impede o "feito" direto numa tarefa recorrente: nela o feito é de
-- um dia, e vai em tarefas_conclusoes. Gravar status='feito' congelaria a
-- tarefa como feita para sempre — exatamente o que o Felipe zera à mão hoje.
CREATE OR REPLACE FUNCTION public.travas_das_tarefas()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_antes JSONB;
  v_depois JSONB;
BEGIN
  IF NEW.status = 'feito' AND cardinality(NEW.dias_semana) > 0 THEN
    RAISE EXCEPTION 'Tarefa que se repete não fica "feita" para sempre: marque o feito de hoje (tarefas_conclusoes).';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'tasks.edit') THEN
    v_antes  := to_jsonb(OLD) - 'status' - 'concluida_em' - 'updated_at';
    v_depois := to_jsonb(NEW) - 'status' - 'concluida_em' - 'updated_at';
    IF v_antes <> v_depois THEN
      RAISE EXCEPTION 'Seu perfil só permite marcar o andamento das suas tarefas, não editá-las.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.travas_das_tarefas() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER travas_das_tarefas
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.travas_das_tarefas();

-- Na criação a mesma regra do "feito" vale (status nasce nao_iniciado, mas
-- ninguém impede a API de mandar 'feito' com dias).
CREATE OR REPLACE FUNCTION public.travas_da_tarefa_nova()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'feito' AND cardinality(NEW.dias_semana) > 0 THEN
    RAISE EXCEPTION 'Tarefa que se repete não nasce "feita": marque o feito de hoje (tarefas_conclusoes).';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.travas_da_tarefa_nova() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER travas_da_tarefa_nova
  BEFORE INSERT ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.travas_da_tarefa_nova();


-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- Leitura: da loja + tasks.view. Escrita: da loja + a permissão certa. O
-- responsável pela tarefa tem a porta estreita descrita em 4c/4d.

ALTER TABLE public.tarefas_quadros       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_listas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_responsaveis  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_etiquetas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_checklist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_comentarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_conclusoes    ENABLE ROW LEVEL SECURITY;

-- Quadros ---------------------------------------------------------------------
CREATE POLICY "Ver quadros de tarefas da loja"
  ON public.tarefas_quadros FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Gerenciar quadros de tarefas da loja"
  ON public.tarefas_quadros FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.manage'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.manage'));

-- Listas ----------------------------------------------------------------------
CREATE POLICY "Ver listas de tarefas da loja"
  ON public.tarefas_listas FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Criar listas de tarefas da loja"
  ON public.tarefas_listas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

CREATE POLICY "Editar listas de tarefas da loja"
  ON public.tarefas_listas FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

CREATE POLICY "Apagar listas de tarefas da loja"
  ON public.tarefas_listas FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.manage'));

-- Tarefas ---------------------------------------------------------------------
CREATE POLICY "Ver tarefas da loja"
  ON public.tarefas FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Criar tarefas da loja"
  ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

-- Quem edita, ou quem é responsável (e aí o gatilho travas_das_tarefas só
-- deixa passar status e concluida_em).
CREATE POLICY "Editar tarefas da loja"
  ON public.tarefas FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(id, auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(id, auth.uid())));

CREATE POLICY "Apagar tarefas da loja"
  ON public.tarefas FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.manage'));

-- Responsáveis e etiquetas ----------------------------------------------------
CREATE POLICY "Ver responsaveis de tarefas da loja"
  ON public.tarefas_responsaveis FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Definir responsaveis de tarefas da loja"
  ON public.tarefas_responsaveis FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

CREATE POLICY "Ver etiquetas de tarefas da loja"
  ON public.tarefas_etiquetas FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Definir etiquetas de tarefas da loja"
  ON public.tarefas_etiquetas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

-- Checklist -------------------------------------------------------------------
CREATE POLICY "Ver checklist de tarefas da loja"
  ON public.tarefas_checklist FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Criar itens de checklist da loja"
  ON public.tarefas_checklist FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

-- Marcar a caixinha é andamento: o responsável pode.
CREATE POLICY "Marcar itens de checklist da loja"
  ON public.tarefas_checklist FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(tarefa_id, auth.uid())))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(tarefa_id, auth.uid())));

CREATE POLICY "Apagar itens de checklist da loja"
  ON public.tarefas_checklist FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.edit'));

-- Comentários -----------------------------------------------------------------
CREATE POLICY "Ver comentarios de tarefas da loja"
  ON public.tarefas_comentarios FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

-- Quem vê pode comentar, sempre em nome próprio.
CREATE POLICY "Comentar tarefas da loja"
  ON public.tarefas_comentarios FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view')
         AND autor_id = auth.uid());

CREATE POLICY "Apagar o proprio comentario"
  ON public.tarefas_comentarios FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (autor_id = auth.uid() OR public.has_permission(auth.uid(), 'tasks.manage')));

-- Conclusões (o feito de hoje) ------------------------------------------------
CREATE POLICY "Ver conclusoes de tarefas da loja"
  ON public.tarefas_conclusoes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND public.has_permission(auth.uid(), 'tasks.view'));

CREATE POLICY "Marcar feito de hoje"
  ON public.tarefas_conclusoes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid())
         AND concluida_por = auth.uid()
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(tarefa_id, auth.uid())));

CREATE POLICY "Desmarcar feito de hoje"
  ON public.tarefas_conclusoes FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())
         AND (public.has_permission(auth.uid(), 'tasks.edit')
              OR public.eh_responsavel_da_tarefa(tarefa_id, auth.uid())));

-- Nada de UPDATE em conclusão: desmarca e marca de novo. Assim
-- `concluida_por` nunca é reescrito para outra pessoa.


-- -----------------------------------------------------------------------------
-- 5b. PRIVILÉGIOS DE TABELA — explícitos, não herdados
-- -----------------------------------------------------------------------------
-- O ALTER DEFAULT PRIVILEGES de 14/09 só vale para objeto criado na sessão
-- do papel exato que ele nomeia, e o CLI de migration nem sempre é essa
-- sessão (a travas_da_os nasceu aberta por isso). Então aqui está escrito:
-- quem está logado pode ler e escrever (o RLS acima decide o quê); o anon
-- não tem nada.
DO $grants$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tarefas_quadros', 'tarefas_listas', 'tarefas', 'tarefas_responsaveis',
                           'tarefas_etiquetas', 'tarefas_checklist', 'tarefas_comentarios',
                           'tarefas_conclusoes'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$grants$;


-- -----------------------------------------------------------------------------
-- 6. CONFERÊNCIA — derruba a transação se algo ficou aberto
-- -----------------------------------------------------------------------------
DO $verifica$
DECLARE
  v_n INT;
  v_txt TEXT;
BEGIN
  -- 1. nenhuma policy das tabelas novas vale para quem não fez login
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'tarefas%'
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION '% policy(ies) de tarefas ainda valem para quem não fez login', v_n;
  END IF;

  -- 2. toda tabela nova tem RLS ligado
  SELECT string_agg(c.relname, ', ') INTO v_txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'tarefas%'
     AND NOT c.relrowsecurity;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'tabela de tarefas sem RLS: %', v_txt;
  END IF;

  -- 3. o anon não tem privilégio em nenhuma tabela nova
  SELECT string_agg(table_name, ', ') INTO v_txt
    FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public' AND table_name LIKE 'tarefas%';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'anon ainda tem privilégio em: %', v_txt;
  END IF;

  -- 3b. quem está logado consegue ler e escrever (o RLS decide o quê)
  SELECT string_agg(c.relname, ', ') INTO v_txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'tarefas%'
     AND NOT (has_table_privilege('authenticated', c.oid, 'SELECT')
              AND has_table_privilege('authenticated', c.oid, 'INSERT')
              AND has_table_privilege('authenticated', c.oid, 'UPDATE')
              AND has_table_privilege('authenticated', c.oid, 'DELETE'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'quem está logado não consegue usar: %', v_txt;
  END IF;

  -- 4. gatilhos fechados, ajudante de policy aberto
  IF has_function_privilege('authenticated', 'public.travas_das_tarefas()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.travas_da_tarefa_nova()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tarefa_herda_da_lista()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.lista_herda_do_quadro()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.herda_tenant_da_tarefa()', 'EXECUTE') THEN
    RAISE EXCEPTION 'função de gatilho de tarefas continua chamável por quem está logado';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.eh_responsavel_da_tarefa(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'eh_responsavel_da_tarefa sem EXECUTE para authenticated — as policies quebrariam';
  END IF;

  -- 5. nenhuma função nova aberta para PUBLIC
  SELECT string_agg(p.proname, ', ') INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('travas_das_tarefas', 'travas_da_tarefa_nova', 'tarefa_herda_da_lista',
                       'lista_herda_do_quadro', 'herda_tenant_da_tarefa', 'eh_responsavel_da_tarefa')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=X/%'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'função de tarefas aberta para PUBLIC: %', v_txt;
  END IF;

  -- 6. as permissões existem e o administrador tem as três
  SELECT count(*) INTO v_n FROM public.role_permissions
   WHERE role = 'administrador' AND permission_key IN ('tasks.view', 'tasks.edit', 'tasks.manage');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'o administrador deveria ter as 3 permissões de tarefas, tem %', v_n;
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
