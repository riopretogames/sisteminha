-- =============================================================================
-- Sisteminha (RP System.IO) — Cores das etapas mais fortes
-- =============================================================================
--
-- "Coloque cores, estão muito apagado." — Felipe, 09/08, olhando o quadro.
--
-- Ele está certo. As etapas usavam cor a 10% de opacidade, que no fundo claro
-- vira quase branco. Etiqueta lavada não cumpre o papel de ser reconhecida
-- antes da leitura — e reconhecer antes de ler é a razão de existir cor num
-- quadro com dezenas de cartões.
--
-- Só mexe nas etapas que ainda estão com a cor padrão. Se a loja já escolheu
-- outra cor em "Gerenciar Status", a escolha dela continua valendo — mesma
-- regra que a migration das etapas fixas usou para o rótulo.
-- =============================================================================

UPDATE public.os_status_config SET color = 'bg-violet-500 text-white'
 WHERE key = 'aguardando_analise'   AND color = 'bg-violet-500/10 text-violet-600';

UPDATE public.os_status_config SET color = 'bg-amber-500 text-white'
 WHERE key = 'aguardando_aprovacao' AND color = 'bg-amber-500/10 text-amber-600';

UPDATE public.os_status_config SET color = 'bg-blue-500 text-white'
 WHERE key = 'aprovado'             AND color = 'bg-blue-500/10 text-blue-600';

UPDATE public.os_status_config SET color = 'bg-cyan-500 text-white'
 WHERE key = 'finalizado'           AND color = 'bg-cyan-500/10 text-cyan-600';

UPDATE public.os_status_config SET color = 'bg-emerald-500 text-white'
 WHERE key = 'entregue'             AND color = 'bg-emerald-500/10 text-emerald-600';

UPDATE public.os_status_config SET color = 'bg-red-500 text-white'
 WHERE key = 'cancelado'            AND color = 'bg-red-500/10 text-red-600';

-- Etapas antigas e as criadas pela loja com a paleta fraca sobem junto: ter
-- metade do quadro forte e metade lavada seria pior que tudo fraco.
UPDATE public.os_status_config
   SET color = regexp_replace(color, '^bg-([a-z]+)-500/10 text-[a-z]+-600$', 'bg-\1-500 text-white')
 WHERE color ~ '^bg-[a-z]+-500/10 text-[a-z]+-600$';

-- As que vieram do primeiro seed do sistema, com outro formato (bg-X-100).
UPDATE public.os_status_config
   SET color = regexp_replace(color, '^bg-([a-z]+)-100 text-[a-z]+-600$', 'bg-\1-500 text-white')
 WHERE color ~ '^bg-[a-z]+-100 text-[a-z]+-600$';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- SELECT key, label, color FROM public.os_status_config ORDER BY ordem;
-- -- nenhuma cor deve ter "/10"
-- =============================================================================
