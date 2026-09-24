import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2, LogIn, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { dataHora } from '@/lib/format';
import { rotuloDoPapel } from '@/config/permissions';
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
  acao: 'INSERT' | 'UPDATE' | 'DELETE' | 'ENTRAR_COMO' | 'GEROU_ACESSO';
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
  // Um administrador entrou na conta de outra pessoa ("Entrar como", 24/09).
  // Não é gatilho de tabela: a função de servidor grava a linha na mão, e é o
  // único jeito de saber que a venda "do Richard" foi feita pelo Felipe.
  ENTRAR_COMO: { label: 'Entrou como', classe: 'bg-amber-500/10 text-amber-700', Icone: LogIn },
  // "Copiar link" do Entrar como: o acesso foi GERADO, mas ninguém entrou por
  // ele ainda (e talvez nunca entre). Sem esta linha a tela dizia "Alterou".
  GEROU_ACESSO: { label: 'Gerou link de acesso', classe: 'bg-amber-500/10 text-amber-700', Icone: Link2 },
};

// `os_pagamentos` e `user_permissions` ganharam gatilho de auditoria em
// 20260818100000 e 20260818110000 — sem entrada aqui, essas linhas ainda
// apareciam em "Tudo" mas com o nome cru da tabela na coluna Registro, e sem
// botão de filtro próprio (achado na revisão de 20/08: outra frente, no
// mesmo dia, adicionou a coluna "Quem" a este arquivo sem saber das duas
// tabelas novas sendo auditadas).
//
// Revisão de 24/09: o mesmo defeito voltou com `campos_obrigatorios` e
// `tarefas_quadros` (achado 80 — já tinham gatilho, apareciam com o nome cru e
// sem filtro), e `role_permissions` ganhou gatilho na migration
// 20260924166000 (achado 79: mudar o perfil INTEIRO não deixava rastro).
// Tabela auditada nova precisa de uma linha aqui.
const TABELA_LABEL: Record<string, string> = {
  vendas: 'Venda',
  produtos: 'Produto',
  service_orders: 'Ordem de serviço',
  titulos_financeiros: 'Título financeiro',
  user_roles: 'Perfil de usuário',
  caixa_sessoes: 'Caixa',
  caixa_movimentos: 'Movimento de caixa',
  os_pagamentos: 'Pagamento de OS',
  user_permissions: 'Exceção de permissão',
  role_permissions: 'Permissão de perfil',
  profiles: 'Usuário',
  campos_obrigatorios: 'Campo obrigatório',
  tarefas_quadros: 'Quadro de tarefas',
};

const TABELAS = ['todas', ...Object.keys(TABELA_LABEL)];

/**
 * O que foi dado ou tirado, em uma frase, para as linhas de permissão.
 *
 * Nelas a mudança é criar ou apagar uma linha (marcar ou desmarcar uma caixa),
 * não alterar — e a coluna Mudanças só sabia mostrar alteração, então ficava
 * um "—" que não dizia QUAL permissão, nem de QUEM. `descricao` traduz a chave
 * ("inventory.cost.view") para o texto da tela ("Ver custo e margem").
 */
function resumoDaPermissao(
  r: Pick<Registro, 'acao' | 'tabela' | 'dados_antes' | 'dados_depois'>,
  descricao: (chave: string) => string,
  nomeDe: (id: string) => string,
): string | null {
  const linha = (r.dados_depois ?? r.dados_antes ?? {}) as Record<string, unknown>;
  const chave = typeof linha.permission_key === 'string' ? linha.permission_key : null;
  if (!chave) return null;
  const permissao = descricao(chave);

  if (r.tabela === 'role_permissions') {
    const perfil = rotuloDoPapel(typeof linha.role === 'string' ? linha.role : null);
    if (r.acao === 'INSERT') return `Perfil ${perfil} ganhou: ${permissao}`;
    if (r.acao === 'DELETE') return `Perfil ${perfil} perdeu: ${permissao}`;
    return null;
  }

  if (r.tabela === 'user_permissions') {
    // Alteração (o motivo, por exemplo) segue pela lista de campos mudados.
    if (r.acao === 'UPDATE') return null;
    const quem = typeof linha.user_id === 'string' ? nomeDe(linha.user_id) : 'alguém';
    if (r.acao === 'DELETE') return `${quem}: voltou a seguir o perfil em ${permissao}`;
    return linha.concedida === false
      ? `${quem}: tirado à parte — ${permissao}`
      : `${quem}: concedido à parte — ${permissao}`;
  }

  return null;
}

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
    queryFn: async (): Promise<{
      registros: Registro[];
      nomes: Map<string, string>;
      permissoes: Map<string, string>;
    }> => {
      // Pela view, não pela tabela (desde 15/09): a tabela guarda a linha
      // inteira do produto, custo e margem inclusos, e quem tem só "Ver logs"
      // lia tudo. A view apaga as chaves de custo para quem não tem "Ver
      // custo e margem" — mesma regra das vw_* de produto.
      let q = supabase
        .from('vw_auditoria')
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
      const [res, perfis, catalogo] = await Promise.all([
        q,
        supabase.from('profiles').select('id, nome'),
        // Só para traduzir a chave da permissão no resumo. Falhar aqui não
        // derruba a tela: a chave crua aparece no lugar do texto.
        supabase.from('permissions').select('key, descricao'),
      ]);
      if (res.error) throw res.error;
      if (perfis.error) throw perfis.error;

      const nomes = new Map<string, string>(
        ((perfis.data ?? []) as Array<{ id: string; nome: string }>).map((p) => [p.id, p.nome]),
      );
      const permissoes = new Map<string, string>(
        ((catalogo.data ?? []) as Array<{ key: string; descricao: string }>).map((p) => [
          p.key,
          p.descricao,
        ]),
      );

      return { registros: (res.data ?? []) as Registro[], nomes, permissoes };
    },
  });

  const registros = data?.registros ?? [];
  const nomes = data?.nomes ?? new Map<string, string>();
  const permissoes = data?.permissoes ?? new Map<string, string>();
  const descricaoDa = (chave: string) => permissoes.get(chave) ?? chave;
  const nomeDe = (id: string) => nomes.get(id) ?? 'Usuário removido';

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
                  const resumo = resumoDaPermissao(r, descricaoDa, nomeDe);
                  // Linha de cadastro de funcionário: dizer QUEM foi mexido,
                  // não só "Usuário".
                  const deQuem =
                    r.tabela === 'profiles' && r.registro_id ? nomes.get(r.registro_id) : undefined;

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
                        {deQuem && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {deQuem}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={r.usuario_id ? '' : 'text-muted-foreground'}>
                        {quemFez(r.usuario_id)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {dataHora(r.created_at)}
                      </TableCell>
                      <TableCell>
                        {resumo ? (
                          <span className="text-sm">{resumo}</span>
                        ) : r.acao !== 'UPDATE' ? (
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
