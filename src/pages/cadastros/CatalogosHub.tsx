import { useState } from 'react';
import { Plus, Check, Star, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { getIcon } from '@/config/icons';
import {
  CATALOGOS,
  CATALOGO_GRUPOS,
  getCatalogosPorGrupo,
  rotuloNovo,
  type CatalogoDef,
  type CatalogoGrupo,
} from '@/config/catalogos';
import { useCatalogo } from '@/hooks/useCatalogos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

/**
 * Listas do Sistema.
 *
 * Uma tela para os ~12 cadastros de lista simples. No sistema atual cada um
 * destes é uma tela separada, mantida separadamente. Aqui a diferença entre
 * "Cores" e "Checklist de Defeitos" é só a configuração em config/catalogos.ts.
 *
 * A tela foi escrita para quem nunca mexeu em ERP: cada lista explica o que é,
 * dá um exemplo concreto e mostra o efeito de desativar um item.
 */

const GRUPOS = Object.keys(CATALOGO_GRUPOS) as CatalogoGrupo[];

function EditorCatalogo({ def }: { def: CatalogoDef }) {
  const { can } = useAuth();
  const podeEditar = can(PERMISSIONS.REGISTRY_PRODUCTS_MANAGE);

  const { data, isLoading, criar, renomear, alternarAtivo, definirPadrao } = useCatalogo(def.tipo);
  const [novo, setNovo] = useState('');
  const [busca, setBusca] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');

  const itens = (data ?? []).filter((i) =>
    i.descricao.toLowerCase().includes(busca.toLowerCase()),
  );

  const adicionar = () => {
    const texto = novo.trim();
    if (!texto) return;
    criar.mutate(texto, { onSuccess: () => setNovo('') });
  };

  const salvarEdicao = (id: string) => {
    const texto = rascunho.trim();
    if (texto) renomear.mutate({ id, descricao: texto });
    setEditandoId(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm leading-relaxed text-muted-foreground">{def.hint}</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          <span className="font-medium">Exemplos:</span> {def.exemplo}
        </p>
      </div>

      {podeEditar && (
        <div className="flex gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            placeholder={`Digite e aperte Enter — ex.: ${def.exemplo.split(',')[0].trim()}`}
            aria-label={rotuloNovo(def)}
          />
          <Button onClick={adicionar} disabled={!novo.trim() || criar.isPending}>
            {criar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Adicionar</span>
          </Button>
        </div>
      )}

      {(data?.length ?? 0) > 8 && (
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar nesta lista..."
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : itens.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {busca ? 'Nenhum item encontrado.' : 'Esta lista ainda está vazia.'}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {itens.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 transition-colors',
                !item.ativo && 'bg-muted/40',
              )}
            >
              {editandoId === item.id ? (
                <Input
                  autoFocus
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  onBlur={() => salvarEdicao(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarEdicao(item.id);
                    if (e.key === 'Escape') setEditandoId(null);
                  }}
                  className="h-8"
                />
              ) : (
                <button
                  type="button"
                  disabled={!podeEditar}
                  onClick={() => {
                    setEditandoId(item.id);
                    setRascunho(item.descricao);
                  }}
                  className={cn(
                    'flex-1 text-left text-sm',
                    !item.ativo && 'text-muted-foreground line-through',
                    podeEditar && 'hover:text-primary',
                  )}
                >
                  {item.descricao}
                </button>
              )}

              {item.padrao && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Star className="h-3 w-3" />
                  Padrão
                </Badge>
              )}

              {def.permitePadrao && podeEditar && !item.padrao && item.ativo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => definirPadrao.mutate(item.id)}
                >
                  Tornar padrão
                </Button>
              )}

              {podeEditar && (
                <div className="flex items-center gap-2">
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <Switch
                    checked={item.ativo}
                    onCheckedChange={(ativo) => alternarAtivo.mutate({ id: item.id, ativo })}
                    aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.descricao}`}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Desativar não apaga: o item some dos campos de seleção mas continua nos
        registros antigos que já o usavam. É de propósito — apagar reescreveria
        o histórico de vendas e OS.
      </p>
    </div>
  );
}

export default function CatalogosHub() {
  const [selecionado, setSelecionado] = useState<string>(CATALOGOS[0].tipo);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Listas do Sistema</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          São as opções que aparecem nos campos de seleção do sistema inteiro.
          Quando você cadastra um produto e escolhe a marca, a lista de marcas
          vem daqui. Mexeu aqui, mudou em todo lugar.
        </p>
      </header>

      <Tabs defaultValue={GRUPOS[0]}>
        <TabsList className="mb-6">
          {GRUPOS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {CATALOGO_GRUPOS[g].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {GRUPOS.map((grupo) => {
          const defs = getCatalogosPorGrupo(grupo);
          const ativo = defs.find((d) => d.tipo === selecionado) ?? defs[0];

          return (
            <TabsContent key={grupo} value={grupo} className="mt-0">
              <p className="mb-4 text-sm text-muted-foreground">
                {CATALOGO_GRUPOS[grupo].hint}
              </p>

              <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                {/* Lista de catálogos do grupo */}
                <nav className="space-y-1">
                  {defs.map((def) => {
                    const Icon = getIcon(def.icon);
                    const estaAtivo = ativo?.tipo === def.tipo;
                    return (
                      <button
                        key={def.tipo}
                        onClick={() => setSelecionado(def.tipo)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                          estaAtivo
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{def.label}</span>
                        {estaAtivo && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </nav>

                {/* Editor do catálogo selecionado */}
                <Card>
                  <CardContent className="pt-6">
                    {ativo ? (
                      <>
                        <h2 className="mb-1 text-lg font-semibold">{ativo.label}</h2>
                        <EditorCatalogo def={ativo} />
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
