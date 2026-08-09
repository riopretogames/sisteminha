-- =============================================================================
-- Sisteminha (RP System.IO) — Etapas fixas da OS e base para automação (n8n)
-- =============================================================================
--
-- O Felipe ditou em 09/08 as etapas OBRIGATÓRIAS da assistência, na ordem em
-- que o aparelho anda na loja:
--
--   1. Aguardando análise (laudo)  — entrou na loja, OS criada
--   2. Aguardando aprovação        — orçamento na mão do cliente
--   3. Aprovado / Executar         — cliente aprovou, bancada trabalha
--   4. Finalizado                  — serviço pronto, aparelho na prateleira
--   5. Entregue                    — cliente retirou e pagou
--
-- Três consequências que ele deixou claras, e que mudam o desenho:
--
--   a) São FIXAS. A loja vai criar outras etapas, mas estas cinco não podem ser
--      excluídas nem ter a chave trocada — porque o código e as automações
--      dependem delas. Hoje "Gerenciar Status" deixa excluir qualquer uma, e
--      excluir a errada quebra um fluxo inteiro em silêncio (o
--      PLANO-DE-REFINAMENTO já anotava esse risco).
--   b) Todas aparecem no Kanban.
--   c) Todas terão automação no n8n pendurada nelas.
--
-- POR QUE UMA FILA DE EVENTOS, E NÃO "O N8N CONSULTA A TABELA DE OS"
--
-- Automação que depende de alguém varrer `service_orders` procurando mudança
-- não sabe o que já avisou: perde evento quando dá erro, e repete quando o
-- fluxo roda duas vezes. Pior, não enxerga passagem rápida — OS que entra e sai
-- de um status entre duas varreduras simplesmente não aconteceu.
--
-- Aqui o próprio banco registra a mudança no instante em que ela ocorre, numa
-- fila com marca de "já processei". O n8n consome, marca como processado e
-- segue. Se o n8n estiver fora do ar, os eventos esperam — nada se perde.
--
-- Serve para os três jeitos de ligar o n8n: webhook do Supabase apontando para
-- ele, Realtime, ou consulta periódica na fila.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. STATUS DE SISTEMA: os que ninguém pode apagar
-- -----------------------------------------------------------------------------

ALTER TABLE public.os_status_config
  ADD COLUMN IF NOT EXISTS sistema BOOLEAN NOT NULL DEFAULT false,
  -- Posição na esteira oficial (1 a 5). NULL = etapa extra que a loja criou.
  ADD COLUMN IF NOT EXISTS etapa INTEGER;

COMMENT ON COLUMN public.os_status_config.sistema IS
  'Etapa obrigatória: o código e as automações do n8n dependem da `key`. Não '
  'pode ser excluída nem ter a chave trocada. O rótulo e a cor, sim.';

COMMENT ON COLUMN public.os_status_config.etapa IS
  'Ordem oficial da esteira da assistência (1 a 5). Etapa extra criada pela '
  'loja fica NULL e se posiciona por `ordem`.';


-- -----------------------------------------------------------------------------
-- 2. AS CINCO ETAPAS, EM TODOS OS TENANTS
-- -----------------------------------------------------------------------------
-- As cores seguem o padrão de `src/lib/acoes.ts`: violeta = acabou de entrar,
-- âmbar = parado esperando alguém, azul = andando, ciano = pronto esperando o
-- cliente, verde = terminou bem, vermelho = desfeito.

INSERT INTO public.os_status_config (tenant_id, key, label, color, icon, ordem, ativo, sistema, etapa)
SELECT t.id, v.key, v.label, v.color, v.icon, v.ordem, true, true, v.etapa
FROM public.tenants t
CROSS JOIN (VALUES
  ('aguardando_analise',   'Aguardando análise',   'bg-violet-500/10 text-violet-600',   'circle', 10, 1),
  ('aguardando_aprovacao', 'Aguardando aprovação', 'bg-amber-500/10 text-amber-600',     'circle',    20, 2),
  ('aprovado',             'Aprovado / Executar',  'bg-blue-500/10 text-blue-600',       'circle',    30, 3),
  ('finalizado',           'Finalizado',           'bg-cyan-500/10 text-cyan-600',       'circle',    40, 4),
  ('entregue',             'Entregue',             'bg-emerald-500/10 text-emerald-600', 'circle',    50, 5)
) AS v(key, label, color, icon, ordem, etapa)
ON CONFLICT (tenant_id, key) DO UPDATE
   SET sistema = true,
       etapa   = EXCLUDED.etapa,
       ativo   = true,
       -- Rótulo e cor NÃO são sobrescritos: se a loja já renomeou "Entregue"
       -- para "Retirado pelo cliente", a escolha dela vale mais que o padrão.
       ordem   = EXCLUDED.ordem;

-- Cancelado também é de sistema, embora não esteja na esteira: o código
-- depende dele (estorno de estoque, OS finalizadas, relatórios) e apagá-lo
-- deixaria a loja sem como encerrar uma OS que não vai acontecer. Fica com
-- `etapa` nula porque não é passo do fluxo — é saída de emergência.
INSERT INTO public.os_status_config (tenant_id, key, label, color, icon, ordem, ativo, sistema, etapa)
SELECT t.id, 'cancelado', 'Cancelado', 'bg-red-500/10 text-red-600', 'circle', 90, true, true, NULL
FROM public.tenants t
ON CONFLICT (tenant_id, key) DO UPDATE SET sistema = true;


-- -----------------------------------------------------------------------------
-- 3. AS OS QUE JÁ EXISTEM MUDAM PARA A ESTEIRA NOVA
-- -----------------------------------------------------------------------------
-- Conversão conservadora: ninguém volta para trás no fluxo, e nada é apagado.
--
--   recebido, diagnostico  → aguardando_analise  (as duas são a etapa do laudo)
--   em_reparo              → aprovado            (aprovado é "pode executar")
--   pronto                 → finalizado
--   aguardando_peca        → CONTINUA existindo como etapa extra, não fixa:
--                            é situação real da bancada, só não é obrigatória.

UPDATE public.service_orders SET status = 'aguardando_analise'
 WHERE status IN ('recebido', 'diagnostico');

UPDATE public.service_orders SET status = 'aprovado'   WHERE status = 'em_reparo';
UPDATE public.service_orders SET status = 'finalizado' WHERE status = 'pronto';

-- Os antigos que viraram outra coisa saem da lista de escolha, mas não são
-- apagados: OS histórica pode ter passado por eles no `service_order_history`,
-- e apagar reescreveria o passado.
UPDATE public.os_status_config
   SET ativo = false
 WHERE key IN ('recebido', 'diagnostico', 'em_reparo', 'pronto')
   AND NOT EXISTS (
     SELECT 1 FROM public.service_orders s
      WHERE s.status = os_status_config.key
        AND s.tenant_id = os_status_config.tenant_id
   );

-- `aguardando_peca` fica ativa e visível — só não é de sistema.
UPDATE public.os_status_config
   SET ativo = true, ordem = 35
 WHERE key = 'aguardando_peca';

ALTER TABLE public.service_orders ALTER COLUMN status SET DEFAULT 'aguardando_analise';


-- -----------------------------------------------------------------------------
-- 4. TRAVA: ETAPA DE SISTEMA NÃO SE APAGA NEM TROCA DE CHAVE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_status_de_sistema()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.sistema THEN
    RAISE EXCEPTION
      'A etapa "%" é obrigatória e não pode ser excluída. Se não usa, desative — o histórico continua fazendo sentido.',
      OLD.label
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.sistema THEN
    IF NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION
        'A etapa "%" é obrigatória: dá para mudar o nome e a cor, mas não a identificação interna — o sistema e as automações dependem dela.',
        OLD.label
        USING ERRCODE = 'restrict_violation';
    END IF;
    -- Desativar etapa obrigatória também não: sumiria do Kanban e as OS
    -- paradas nela ficariam invisíveis.
    IF NEW.ativo = false THEN
      RAISE EXCEPTION
        'A etapa "%" é obrigatória e precisa continuar ativa.', OLD.label
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_status_sistema ON public.os_status_config;

CREATE TRIGGER trg_proteger_status_sistema
  BEFORE UPDATE OR DELETE ON public.os_status_config
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_status_de_sistema();


-- -----------------------------------------------------------------------------
-- 5. A FILA DE EVENTOS QUE O N8N VAI CONSUMIR
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.automacao_eventos (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- 'os.criada', 'os.status_mudou'. Nome no passado: é fato consumado.
  evento        TEXT NOT NULL,
  entidade      TEXT NOT NULL,
  entidade_id   UUID NOT NULL,
  -- Tudo que a automação precisa para agir sem voltar ao banco: número da OS,
  -- status de/para, nome e telefone do cliente, aparelho.
  dados         JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em TIMESTAMPTZ,
  erro          TEXT
);

COMMENT ON TABLE public.automacao_eventos IS
  'Fila de acontecimentos para automação externa (n8n). O banco escreve aqui '
  'no instante da mudança; quem consome marca `processado_em`. Se a automação '
  'estiver fora do ar, os eventos esperam — nada se perde.';

-- Índice do consumidor: pegar o que ainda não foi processado, na ordem.
CREATE INDEX IF NOT EXISTS idx_automacao_eventos_pendentes
  ON public.automacao_eventos (criado_em)
  WHERE processado_em IS NULL;

ALTER TABLE public.automacao_eventos ENABLE ROW LEVEL SECURITY;

-- Leitura para quem já vê OS: serve para conferir se a automação rodou.
-- Escrita, ninguém: só o gatilho, que roda com privilégio elevado. O n8n usa a
-- chave de serviço, que passa por cima da RLS.
DROP POLICY IF EXISTS "Ver eventos de automacao do tenant" ON public.automacao_eventos;
CREATE POLICY "Ver eventos de automacao do tenant"
  ON public.automacao_eventos FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'orders.view')
  );


CREATE OR REPLACE FUNCTION public.registrar_evento_os()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER porque o vendedor que muda o status não tem (nem precisa
-- ter) permissão de escrever na fila de automação.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cliente RECORD;
  corpo   JSONB;
BEGIN
  -- Só interessa mudança de status de verdade e OS nova.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT c.nome, c.telefones INTO cliente
  FROM public.clientes c
  WHERE c.id = NEW.cliente_id;

  corpo := jsonb_build_object(
    'os_id',            NEW.id,
    'numero_os',        NEW.numero_os,
    'status',           NEW.status,
    'status_anterior',  CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    'cliente_id',       NEW.cliente_id,
    'cliente_nome',     cliente.nome,
    'cliente_telefone', COALESCE(cliente.telefones[1], ''),
    'marca',            NEW.marca,
    'modelo',           NEW.modelo,
    'defeito',          NEW.defeito_cliente,
    'prazo_previsto',   NEW.prazo_previsto,
    'garantia_dias',    NEW.garantia_dias,
    'total_orcamento',  NEW.total_orcamento
  );

  INSERT INTO public.automacao_eventos (tenant_id, evento, entidade, entidade_id, dados)
  VALUES (
    NEW.tenant_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'os.criada' ELSE 'os.status_mudou' END,
    'service_orders',
    NEW.id,
    corpo
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evento_os ON public.service_orders;

CREATE TRIGGER trg_evento_os
  AFTER INSERT OR UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_evento_os();


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) As cinco etapas estão lá, na ordem?
--    SELECT etapa, key, label, sistema FROM public.os_status_config
--     WHERE sistema ORDER BY etapa NULLS LAST, ordem;
--
-- 2) A trava funciona? (as duas TÊM que dar erro)
--    DELETE FROM public.os_status_config WHERE key = 'entregue';
--    UPDATE public.os_status_config SET key = 'x' WHERE key = 'entregue';
--
-- 3) A fila registra? (desfaça com ROLLBACK)
--    BEGIN;
--      UPDATE public.service_orders SET status = 'aprovado'
--       WHERE id = (SELECT id FROM public.service_orders LIMIT 1);
--      SELECT evento, dados->>'numero_os', dados->>'status_anterior',
--             dados->>'status' FROM public.automacao_eventos
--       ORDER BY id DESC LIMIT 1;
--    ROLLBACK;
--
-- 4) Sobrou OS em status antigo?
--    SELECT status, count(*) FROM public.service_orders GROUP BY status;
-- =============================================================================
