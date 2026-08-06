-- =============================================================================
-- RPG System.IO — Metas de faturamento mensal (Dashboard > Metas)
-- =============================================================================
--
-- Não inventa um sistema de metas novo: reflete o sistema real que a loja já
-- usa hoje (planilha/arquivos da pasta `premiacoes/` do repositório da
-- empresa, fora do escopo do Sisteminha). Os valores abaixo foram
-- transcritos de `premiacoes/metas-faturamento-mensal.md`, mês a mês, ano de
-- 2026 inteiro — a mesma tabela que orienta o cálculo de premiação hoje.
--
-- O QUE ESTA TABELA NÃO FAZ: não calcula comissão, não sabe quantos
-- vendedores a loja tem em cada mês, não aplica penalidade do Trello. Isso
-- tudo é responsabilidade do processo de premiação (fora do Sisteminha) —
-- aqui é só "meta da loja inteira, por mês, por faixa", pra o dashboard
-- mostrar "quanto falta pra bater tal faixa este mês".
--
-- Edição: por ora só via migration/SQL direto (mesmo fluxo que já existe —
-- o arquivo de metas da empresa já diz que atualização é conversada e
-- registrada à mão). Se um dia a loja quiser editar a meta pelo próprio
-- Sisteminha, dá pra abrir uma tela de gerenciamento depois; não construída
-- agora de propósito, pra não duplicar um processo que já funciona.
-- =============================================================================

CREATE TYPE public.faixa_premiacao AS ENUM ('bronze', 'prata', 'ouro', 'diamante');

CREATE TABLE public.metas_faturamento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  faixa       public.faixa_premiacao NOT NULL,
  valor_meta  DECIMAL(12,2) NOT NULL CHECK (valor_meta >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ano, mes, faixa)
);

COMMENT ON TABLE public.metas_faturamento IS
  'Meta de faturamento da loja inteira, por mês/faixa (Bronze/Prata/Ouro/Diamante). Espelha premiacoes/metas-faturamento-mensal.md — não recalcula comissão nem sabe de vendedor individual.';

CREATE INDEX idx_metas_faturamento_periodo ON public.metas_faturamento(tenant_id, ano, mes);

CREATE TRIGGER update_metas_faturamento_updated_at
  BEFORE UPDATE ON public.metas_faturamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.metas_faturamento ENABLE ROW LEVEL SECURITY;

-- Só leitura pelo app por ora — ver nota acima sobre edição.
CREATE POLICY "Ver metas de faturamento do tenant"
  ON public.metas_faturamento FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- Seed — ano de 2026 inteiro, transcrito de premiacoes/metas-faturamento-mensal.md
-- =============================================================================

DO $$
DECLARE
  t UUID;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;
  IF t IS NULL THEN RETURN; END IF;

  INSERT INTO public.metas_faturamento (tenant_id, ano, mes, faixa, valor_meta) VALUES
    -- Janeiro
    (t, 2026, 1,  'bronze',   65000.00), (t, 2026, 1,  'prata',    78000.00), (t, 2026, 1,  'ouro',     93600.00), (t, 2026, 1,  'diamante', 112320.00),
    -- Fevereiro
    (t, 2026, 2,  'bronze',   75000.00), (t, 2026, 2,  'prata',    90000.00), (t, 2026, 2,  'ouro',    108000.00), (t, 2026, 2,  'diamante', 129600.00),
    -- Março
    (t, 2026, 3,  'bronze',   50000.00), (t, 2026, 3,  'prata',    60000.00), (t, 2026, 3,  'ouro',     72000.00), (t, 2026, 3,  'diamante',  86400.00),
    -- Abril
    (t, 2026, 4,  'bronze',   60000.00), (t, 2026, 4,  'prata',    72000.00), (t, 2026, 4,  'ouro',     86400.00), (t, 2026, 4,  'diamante', 103680.00),
    -- Maio
    (t, 2026, 5,  'bronze',   52000.00), (t, 2026, 5,  'prata',    62400.00), (t, 2026, 5,  'ouro',     74880.00), (t, 2026, 5,  'diamante',  89856.00),
    -- Junho
    (t, 2026, 6,  'bronze',  105000.00), (t, 2026, 6,  'prata',   126000.00), (t, 2026, 6,  'ouro',    151200.00), (t, 2026, 6,  'diamante', 181440.00),
    -- Julho
    (t, 2026, 7,  'bronze',  135000.00), (t, 2026, 7,  'prata',   162000.00), (t, 2026, 7,  'ouro',    194400.00), (t, 2026, 7,  'diamante', 233280.00),
    -- Agosto
    (t, 2026, 8,  'bronze',  110000.00), (t, 2026, 8,  'prata',   132000.00), (t, 2026, 8,  'ouro',    158400.00), (t, 2026, 8,  'diamante', 190080.00),
    -- Setembro
    (t, 2026, 9,  'bronze',   95000.00), (t, 2026, 9,  'prata',   114000.00), (t, 2026, 9,  'ouro',    136800.00), (t, 2026, 9,  'diamante', 164160.00),
    -- Outubro
    (t, 2026, 10, 'bronze',  105000.00), (t, 2026, 10, 'prata',   126000.00), (t, 2026, 10, 'ouro',    151200.00), (t, 2026, 10, 'diamante', 181440.00),
    -- Novembro
    (t, 2026, 11, 'bronze',   95000.00), (t, 2026, 11, 'prata',   114000.00), (t, 2026, 11, 'ouro',    136800.00), (t, 2026, 11, 'diamante', 164160.00),
    -- Dezembro
    (t, 2026, 12, 'bronze',  135000.00), (t, 2026, 12, 'prata',   162000.00), (t, 2026, 12, 'ouro',    194400.00), (t, 2026, 12, 'diamante', 233280.00)
  ON CONFLICT DO NOTHING;
END $$;
