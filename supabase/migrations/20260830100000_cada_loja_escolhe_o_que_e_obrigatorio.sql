-- =============================================================================
-- CADA LOJA ESCOLHE QUAIS CAMPOS SÃO OBRIGATÓRIOS
-- =============================================================================
--
-- Pedido do Felipe em 27/08, abrindo OS no balcão, e repetido em 28/08 olhando
-- o cadastro de cliente:
--
--   "Quero poder escolher quais campos exijo, porque quero vender esse sistema
--    para várias pessoas. Tem loja para quem é importante ter o Instagram;
--    para mim não é."
--
-- O exemplo dele é o argumento inteiro: uma lista fixa no código atende uma
-- loja e atrapalha a outra.
--
-- -----------------------------------------------------------------------------
-- POR QUE A LINHA É "EXCEÇÃO", E NÃO "A LISTA INTEIRA"
-- -----------------------------------------------------------------------------
-- Mesmo desenho de `user_permissions` (20260802000001), a única tabela da casa
-- que já resolve este formato de problema:
--
--     obrigatório = o que a loja marcou, se marcou;
--                   senão, o padrão que vem no código.
--
-- Ausência de linha = vale o padrão. Duas consequências boas:
--
--   1. Nada precisa ser semeado. A Rio Preto Games continua exatamente com a
--      lista de 27/08 sem uma linha sequer aqui, e nada muda no dia em que
--      esta migration subir.
--   2. Campo novo criado daqui a seis meses nasce com o padrão do código
--      valendo para todas as lojas. Se a tabela guardasse a lista inteira,
--      cada campo novo exigiria migration de correção — e a loja criada
--      depois começaria sem exigir nada.
--
-- -----------------------------------------------------------------------------
-- O QUE ESTA TABELA NÃO FAZ
-- -----------------------------------------------------------------------------
-- Não vira gatilho. A exigência continua sendo de TELA, como já era: o banco
-- não recusa uma OS sem IMEI. Quem quiser gravar pela API, contornando a tela,
-- continua conseguindo — e isso é aceitável aqui porque o assunto é
-- preenchimento de cadastro, não dinheiro nem permissão. Trancar no banco
-- exigiria um gatilho por formulário lendo esta tabela, e o primeiro efeito
-- seria quebrar a importação de planilha de clientes, que grava linha a linha
-- justamente sem os campos completos.

CREATE TABLE IF NOT EXISTS public.campos_obrigatorios (
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Qual formulário: 'cliente', 'os'. A lista oficial mora em
  -- src/config/camposObrigatorios.ts, mesma ideia de `catalogos.tipo`.
  formulario   TEXT NOT NULL,

  -- Nome técnico do campo, igual ao do formulário no código ('instagram',
  -- 'numero_serie', 'tem_senha'). CONTRATO SILENCIOSO: renomear o campo no
  -- código sem migrar esta coluna faz a exigência da loja sumir sem erro
  -- nenhum — a linha continua no banco apontando para um campo que não existe.
  campo        TEXT NOT NULL,

  -- true  = esta loja EXIGE o campo.
  -- false = esta loja NÃO exige, mesmo que o padrão do código exija.
  obrigatorio  BOOLEAN NOT NULL,

  -- Por que a loja decidiu assim. Aparece na tela de configuração para quem
  -- vier depois não desfazer sem entender.
  motivo       TEXT,

  definido_por UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, formulario, campo)
);

COMMENT ON TABLE public.campos_obrigatorios IS
  'O que cada loja exige em cada formulário. Ausência de linha = vale o padrão do código (src/config/camposObrigatorios.ts). Pedido do Felipe em 27 e 28/08, pensando na venda do sistema para outras lojas.';

COMMENT ON COLUMN public.campos_obrigatorios.formulario IS
  'Qual formulário: cliente, os. A lista oficial mora em src/config/camposObrigatorios.ts.';

COMMENT ON COLUMN public.campos_obrigatorios.campo IS
  'Nome técnico do campo no formulário. Renomear no código sem migrar esta coluna faz a exigência da loja sumir em silêncio.';

COMMENT ON COLUMN public.campos_obrigatorios.obrigatorio IS
  'true exige; false dispensa mesmo que o padrão do código exija. Sem linha, vale o padrão.';

-- A tela lê "tudo que esta loja configurou para este formulário" de uma vez,
-- na abertura. Este índice é o dessa consulta.
CREATE INDEX IF NOT EXISTS idx_campos_obrigatorios_formulario
  ON public.campos_obrigatorios(tenant_id, formulario);

CREATE TRIGGER update_campos_obrigatorios_updated_at
  BEFORE UPDATE ON public.campos_obrigatorios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- -----------------------------------------------------------------------------
-- QUEM LÊ E QUEM MUDA
-- -----------------------------------------------------------------------------
-- A LEITURA É LIVRE DENTRO DA LOJA, e isso é deliberado. Copiar aqui o padrão
-- de `categorias_financeiras` (que exige `finance.view` para ler) seria o pior
-- erro possível deste trabalho: o vendedor que abre o cadastro de cliente
-- precisa saber o que a loja exige. Sem poder ler, a tela cairia no padrão do
-- código e cobraria uma lista diferente da que o dono configurou — e ninguém
-- entenderia por quê.
--
-- Mudar exige `settings.edit`, a mesma permissão das Preferências do Sistema.

ALTER TABLE public.campos_obrigatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver campos obrigatorios do tenant"
  ON public.campos_obrigatorios FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Definir campos obrigatorios do tenant"
  ON public.campos_obrigatorios FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'settings.edit')
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_permission(auth.uid(), 'settings.edit')
  );

-- Mexer no que a loja exige é decisão de configuração: quem mudou e quando
-- precisa ficar registrado, igual às outras tabelas sensíveis.
--
-- Detalhe conhecido, não é defeito: a função de auditoria grava `registro_id`
-- a partir de uma coluna `id`, e esta tabela tem chave composta (loja +
-- formulário + campo), sem `id`. O `registro_id` fica nulo e a coluna
-- `registro_id` da auditoria aceita nulo. Nada se perde: `dados_antes` e
-- `dados_depois` guardam a linha inteira, com formulário e campo dentro.
CREATE TRIGGER audit_campos_obrigatorios
  AFTER INSERT OR UPDATE OR DELETE ON public.campos_obrigatorios
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();
