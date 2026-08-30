-- =============================================================================
-- AS ETAPAS DA ASSISTÊNCIA GANHAM NÚMERO — E ENTRA "TERCEIRIZADA"
-- =============================================================================
--
-- Pedido do Felipe em 30/08, olhando o quadro de OS: "numere as etapas", com a
-- lista ditada por ele:
--
--   1    Entrada / Análise
--   2a   Aguardando aprovação
--   2b   Aguardando Peça
--   3    Aprovado / Executar
--   4    Finalizado
--   5    Entregue / Retirado
--   6    Terceirizada
--
-- -----------------------------------------------------------------------------
-- POR QUE UMA COLUNA DE TEXTO, E NÃO A `etapa` QUE JÁ EXISTE
-- -----------------------------------------------------------------------------
-- `os_status_config.etapa` já guarda 1 a 5 — mas é INTEGER, e serve de contrato
-- para o código e para as automações do n8n. O que o Felipe pediu tem "2a" e
-- "2b" dentro: duas colunas do quadro que são a MESMA fase de espera (o
-- aparelho parado, uma vez esperando o cliente responder, outra esperando peça
-- chegar). Isso não cabe num número inteiro, e transformar `etapa` em texto
-- quebraria o contrato de quem já depende dela.
--
-- Então `numero` é o RÓTULO da etapa, coisa de tela, que a loja edita junto com
-- o nome e a cor. `etapa` continua sendo o contrato de código.

ALTER TABLE public.os_status_config
  ADD COLUMN IF NOT EXISTS numero TEXT;

COMMENT ON COLUMN public.os_status_config.numero IS
  'O número da etapa como a loja fala dela ("1", "2a", "2b"). É rótulo de tela: quem manda no código e nas automações é a coluna `etapa`. Vazio = a etapa aparece sem número, e nada quebra.';

-- A numeração ditada pelo Felipe. Só onde a loja ainda não escreveu nada:
-- quem já numerou do jeito dela não é sobrescrito.
UPDATE public.os_status_config SET numero = '1'  WHERE key = 'aguardando_analise'   AND numero IS NULL;
UPDATE public.os_status_config SET numero = '2a' WHERE key = 'aguardando_aprovacao' AND numero IS NULL;
UPDATE public.os_status_config SET numero = '2b' WHERE key = 'aguardando_peca'      AND numero IS NULL;
UPDATE public.os_status_config SET numero = '3'  WHERE key = 'aprovado'             AND numero IS NULL;
UPDATE public.os_status_config SET numero = '4'  WHERE key = 'finalizado'           AND numero IS NULL;
UPDATE public.os_status_config SET numero = '5'  WHERE key = 'entregue'             AND numero IS NULL;


-- -----------------------------------------------------------------------------
-- TERCEIRIZADA — ETAPA NOVA
-- -----------------------------------------------------------------------------
-- É o aparelho que saiu da loja para outra empresa consertar: microsoldagem
-- que a bancada não faz, garantia de fabricante, serviço especializado. Hoje
-- ele fica parado em "Aprovado / Executar" como se estivesse na bancada — e
-- quem olha o quadro não tem como saber que o aparelho nem está na loja.
--
-- Nasce como etapa DA LOJA (`sistema = false`), igual "Aguardando Peça":
--   • o código não depende dela, então ela pode ser renomeada ou desativada
--     sem quebrar nada;
--   • `etapa` fica NULO de propósito — não é passo obrigatório da esteira, e
--     entrar como etapa de sistema faria dela contrato de automação do n8n
--     sem ninguém ter pedido isso.
--
-- Ordem 60: depois de Entregue, exatamente onde o Felipe numerou (6). Se na
-- prática ficar melhor no meio do quadro — ao lado de "Aguardando Peça", que é
-- a outra espera com o aparelho fora da bancada —, basta mudar a ordem na tela
-- de Gerenciar Status, sem migration.
--
-- Cor âmbar: é o tom que este sistema usa para "parado esperando alguém de
-- fora", o mesmo de Aguardando Peça e Aguardando Aprovação (ver lib/acoes.ts).

INSERT INTO public.os_status_config (tenant_id, key, label, color, icon, ordem, ativo, sistema, etapa, numero)
SELECT t.id, 'terceirizada', 'Terceirizada', 'bg-amber-500/10 text-amber-600', 'circle', 60, true, false, NULL, '6'
FROM public.tenants t
ON CONFLICT (tenant_id, key) DO UPDATE
   SET ativo  = true,
       numero = COALESCE(public.os_status_config.numero, EXCLUDED.numero);
