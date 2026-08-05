import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * PONTE TEMPORÁRIA — remover assim que os tipos forem regenerados.
 * ---------------------------------------------------------------------------
 *
 * `client.ts` cria o client com `createClient<Database>(...)`, e `types.ts` é
 * gerado automaticamente a partir do schema real do Supabase. As tabelas
 * criadas nas migrations 20260801000002 e 20260801000003 — `permissions`,
 * `role_permissions`, `catalogos`, `fornecedores`, `transportadoras`,
 * `servicos`, `formas_pagamento` — ainda não existem naquele arquivo, porque
 * as migrations não foram aplicadas.
 *
 * Enquanto isso, `supabase.from('catalogos')` não compila: o TypeScript só
 * aceita nomes de tabela que estão em `Database`.
 *
 * COMO REMOVER ISTO (é o caminho normal, não uma gambiarra permanente):
 *
 *   1. Aplique as migrations no Supabase
 *        supabase db push
 *      (ou deixe o Lovable aplicar ao sincronizar o projeto)
 *
 *   2. Regenere os tipos
 *        supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
 *
 *   3. Troque os imports de `db` por `supabase` e apague este arquivo.
 *      Um grep por 'untyped' encontra todos os pontos.
 *
 * Enquanto este arquivo existir, as tabelas novas NÃO têm checagem de tipo —
 * erro de nome de coluna só aparece em runtime. É dívida consciente e de
 * prazo curto, não um padrão a ser copiado.
 *
 * ---------------------------------------------------------------------------
 * ATENÇÃO: há um segundo grupo de arquivos que NÃO usa esta ponte de propósito
 * ---------------------------------------------------------------------------
 * A migration 20260801000004 renomeou `service_orders.imei` para
 * `numero_serie` e acrescentou `observacoes`, `garantia_meses`,
 * `suspeita_tecnica`, `constatacao_tecnica`, `risco_informado_em` e
 * `reparo_inviavel`. Os arquivos abaixo já usam os nomes NOVOS:
 *
 *   src/pages/NovaOS.tsx
 *   src/pages/OrdensServico.tsx
 *   src/components/os/OSKanbanCard.tsx
 *   src/types/os.ts
 *
 * Eles continuam usando o client TIPADO — e por isso NÃO compilam enquanto
 * `types.ts` ainda descrever a coluna antiga `imei`. Isso é intencional:
 * `service_orders` é a tabela mais crítica do sistema e não deve perder
 * checagem de tipo para mascarar uma etapa de build que falta rodar.
 *
 * Tradução prática: o passo 1 (aplicar as migrations) e o passo 2 (regenerar
 * os tipos) não são opcionais. Sem eles o projeto não compila.
 */
export const db = supabase as unknown as SupabaseClient;
