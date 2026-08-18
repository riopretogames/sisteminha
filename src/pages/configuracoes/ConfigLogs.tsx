import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { db } from '@/integrations/supabase/untyped';
import { dataHora } from '@/lib/format';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';

/**
 * Logs / Auditoria.
 *
 * Lê a tabela `auditoria`, alimentada por triggers no banco (não pela
 * aplicação). Isso importa: se alguém alterar um registro por fora do sistema
 * — direto no Supabase, por exemplo — o log registra mesmo assim.
 *
 * A tabela não tem policy de UPDATE nem de DELETE. Log que pode ser editado
 * não é log.
 */

interface Registro {
  id: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  tabela: string;
  registro_id: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  created_at: string;
  usuario_id: string | null;
}

const ACAO_META: Record<string, { label: string; classe: string; Icone: typeof Plus }> = {
  INSERT: { label: 'Criou', classe: 'bg-emerald-500/10 text-emerald-600', Icone: Plus },
  UPDATE: { label: 'Alterou', classe: 'bg-blue-500/10 text-blue-600', Icone: Pencil },
  DELETE: { label: 'Excluiu', classe: 'bg-red-500/10 text-red-600', Icone: Trash2 },
};

const TABELA_LABEL: Record<string, string> = {
  vendas: 'Venda',
  produtos: 'Produto',
  service_orders: 'Ordem de serviço',
  titulos_financeiros: 'Título financeiro',
  user_roles: 'Perfil de usuário',
  caixa_sessoes: 'Caixa',
  caixa_movimentos: 'Movimento de caixa',
};

const TABELAS = ['todas', ...Object.keys(TABELA_LABEL)];

/** Mostra só os campos que realmente mudaram — o resto é ruído. */
function diferencas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  if (!antes || !depois) return [];
  const ignorar = new Set(['updated_at', 'created_at']);

  return Object.keys(depois)
    .filter((k) => !ignorar.has(k))
    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    .map((k) => ({ campo: k, de: antes[k], para: depois[k] }));
}

export default function ConfigLogs() {
  const [tabela, setTabela] = useState('todas');

  const { data, isLoading } = useQuery({
    queryKey: ['auditoria', tabela],
    queryFn: async (): Promise<{ registros: Registro[]; nomes: Map<string, string> }> => {
      let q = db
        .from('auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (tabela !== 'todas') q = q.eq('tabela', tabela);

      // Achado na revisão de 18/08: esta tela prometia "quem mexeu em quê" no
      // texto de apoio e nunca entregava o "quem" — `usuario_id` vinha na
      // consulta e simplesmente não era usado. Não existe FK declarada entre
      // `auditoria.usuario_id` e `profiles`, então o nome vem numa busca à
      // parte e é juntado por id aqui no cliente (mesmo padrão de
      // DashboardMetas.tsx e DashboardVenda.tsx).
      const [res, perfis] = await Promise.all([
        q,
        db.from('profiles').select('id, nome'),
      ]);
      if (res.error) throw res.error;
      if (perfis.error) throw perfis.error;

      const nomes = new Map<string, string>(
        ((perfis.data ?? []) as Array<{ id: string; nome: string }>).map((p) => [p.id, p.nome]),
      );

      return { registros: (res.data ?? []) as Registro[], nomes };
    },
  });

  const registros = data?.registros ?? [];
  const nomes = data?.nomes ?? new Map<string, string>();

  /**
   * Nome de quem fez a alteração.
   *
   * `usuario_id` nulo é esperado e não é erro: gatilho disparado por rotina
   * do próprio banco não tem usuário logado por trás. Dizer isso é mais útil
   * do que deixar a célula vazia, que passa impressão de dado faltando.
   */
  const quemFez = (usuarioId: string | null): string => {
    if (!usuarioId) return 'Sistema';
    return nomes.get(usuarioId) ?? 'Usuário removido';
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Logs / Auditoria"
        hint="Quem mexeu em quê, e quando. Registrado por gatilhos no banco — vale mesmo para alterações feitas por fora do sistema."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABELAS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tabela === t ? 'default' : 'outline'}
            onClick={() => setTabela(t)}
          >
            {t === 'todas' ? 'Tudo' : TABELA_LABEL[t]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : registros.length === 0 ? (
        <Vazio
          titulo="Nenhum registro ainda"
          descricao="A auditoria começa a gravar a partir do momento em que as migrations forem aplicadas. Alterações anteriores não aparecem aqui."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Ação</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Mudanças</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registros.map((r) => {
                  const meta = ACAO_META[r.acao] ?? ACAO_META.UPDATE;
                  const diffs = diferencas(r.dados_antes, r.dados_depois);

                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="secondary" className={meta.classe}>
                          <meta.Icone className="mr-1 h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {TABELA_LABEL[r.tabela] ?? r.tabela}
                      </TableCell>
                      <TableCell className={r.usuario_id ? '' : 'text-muted-foreground'}>
                        {quemFez(r.usuario_id)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {dataHora(r.created_at)}
                      </TableCell>
                      <TableCell>
                        {r.acao !== 'UPDATE' ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : diffs.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            Nenhum campo relevante
                          </span>
                        ) : (
                          <Collapsible>
                            <CollapsibleTrigger className="text-sm text-primary hover:underline">
                              {diffs.length} {diffs.length === 1 ? 'campo' : 'campos'}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-1">
                              {diffs.map((d) => (
                                <div key={d.campo} className="text-xs">
                                  <span className="font-medium">{d.campo}:</span>{' '}
                                  <span className="text-red-600 line-through">
                                    {String(d.de ?? '—')}
                                  </span>{' '}
                                  <span className="text-emerald-600">{String(d.para ?? '—')}</span>
                                </div>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {registros.length === 200 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando os 200 registros mais recentes. Use os filtros acima para
              recortar — a paginação completa ainda não foi construída.
            </p>
          )}
        </>
      )}
    </div>
  );
}
