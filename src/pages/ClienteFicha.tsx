import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  Cake,
  Crown,
  Heart,
  AlertTriangle,
  Edit,
  Mail,
  MapPin,
  Phone,
  Instagram,
  Link as LinkIcon,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, Indicador, Vazio } from '@/components/PageHeader';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo } from '@/hooks/useCatalogos';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import type { Cliente } from '@/hooks/useClientes';
import { supabase } from '@/integrations/supabase/client';
import { PERMISSIONS } from '@/config/permissions';
import { moeda, data as formatarData, dataHora } from '@/lib/format';
import { corDaEtiqueta } from '@/lib/cores';

/**
 * Ficha do cliente.
 *
 * Antes, "Ver detalhes" na lista de clientes levava para uma rota que não
 * existia — dava tela de "não encontrado". Esta página resolve isso e vai
 * além do cadastro: mostra o que o cliente já comprou e as ordens de serviço
 * dele, que é a pergunta que o balcão realmente faz ("esse aqui é bom
 * cliente?", "já trouxe esse aparelho antes?").
 *
 * O total gasto ignora venda cancelada de propósito — senão devolução viraria
 * faturamento na ficha.
 */

interface VendaDoCliente {
  id: string;
  numero_venda: string | null;
  created_at: string | null;
  total: number | null;
  status: string | null;
}

interface OsDoCliente {
  id: string;
  numero_os: string;
  created_at: string | null;
  status: string | null;
  marca: string | null;
  modelo: string | null;
  defeito_cliente: string;
  total_orcamento: number | null;
}

/** Idade em anos a partir da data de nascimento (coluna DATE, sem fuso). */
function idadeEm(dataNascimento: string): number | null {
  const [ano, mes, dia] = dataNascimento.split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const jaFezAniversario =
    hoje.getMonth() + 1 > mes || (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia);
  if (!jaFezAniversario) idade -= 1;
  return idade;
}

/** Quantos dias faltam para o próximo aniversário. */
function diasParaAniversario(dataNascimento: string): number | null {
  const [, mes, dia] = dataNascimento.split('-').map(Number);
  if (!mes || !dia) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let proximo = new Date(hoje.getFullYear(), mes - 1, dia);
  if (proximo < hoje) proximo = new Date(hoje.getFullYear() + 1, mes - 1, dia);
  return Math.round((proximo.getTime() - hoje.getTime()) / 86_400_000);
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-sm">{valor || '—'}</p>
    </div>
  );
}

export default function ClienteFicha() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { getStatusConfig } = useOsStatuses();
  const origens = useCatalogo('origem_cliente');
  const motivos = useCatalogo('motivo_compra');
  const marcacoes = useCatalogo('tag_cliente');

  const podeGerenciar = can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE);
  const podeVerVendas = can(PERMISSIONS.SALES_VIEW);
  const podeVerOs = can(PERMISSIONS.ORDERS_VIEW);

  const [editarAberto, setEditarAberto] = useState(false);

  const clienteQuery = useQuery({
    queryKey: ['cliente', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Cliente | null> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*, cliente_tags(catalogo_id)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const vendasQuery = useQuery({
    queryKey: ['cliente-vendas', id],
    enabled: Boolean(id) && podeVerVendas,
    queryFn: async (): Promise<VendaDoCliente[]> => {
      const { data, error } = await supabase
        .from('vendas')
        .select('id, numero_venda, created_at, total, status')
        .eq('cliente_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const osQuery = useQuery({
    queryKey: ['cliente-os', id],
    enabled: Boolean(id) && podeVerOs,
    queryFn: async (): Promise<OsDoCliente[]> => {
      const { data, error } = await supabase
        .from('service_orders')
        .select('id, numero_os, created_at, status, marca, modelo, defeito_cliente, total_orcamento')
        .eq('cliente_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const cliente = clienteQuery.data;
  const vendas = vendasQuery.data ?? [];
  const ordens = osQuery.data ?? [];

  if (clienteQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/cadastros/clientes')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Vazio
          titulo="Cliente não encontrado"
          descricao="O cadastro pode ter sido excluído por alguém da equipe."
        />
      </div>
    );
  }

  const vendasValidas = vendas.filter((v) => v.status !== 'cancelado');
  const totalGasto = vendasValidas.reduce((soma, v) => soma + (v.total ?? 0), 0);
  const ultimaCompra = vendasValidas[0]?.created_at ?? null;

  const endereco = [
    cliente.logradouro,
    cliente.numero,
    cliente.complemento,
    cliente.bairro,
    cliente.municipio,
    cliente.estado,
  ]
    .filter(Boolean)
    .join(', ');

  const origemDescricao = cliente.origem_id
    ? (origens.data ?? []).find((o) => o.id === cliente.origem_id)?.descricao
    : null;
  const motivoDescricao = cliente.motivo_compra_id
    ? (motivos.data ?? []).find((m) => m.id === cliente.motivo_compra_id)?.descricao
    : null;

  const idade = cliente.data_nascimento ? idadeEm(cliente.data_nascimento) : null;
  const faltamDias = cliente.data_nascimento ? diasParaAniversario(cliente.data_nascimento) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate('/cadastros/clientes')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Todos os clientes
      </Button>

      <PageHeader
        titulo={cliente.nome}
        hint={
          cliente.tipo_pessoa === 'juridica' ? 'Pessoa jurídica' : 'Pessoa física'
        }
        acoes={
          podeGerenciar && (
            <Button onClick={() => setEditarAberto(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar ficha
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {cliente.liberado_venda === false && (
          <Badge variant="destructive">
            <Ban className="mr-1 h-3 w-3" />
            Bloqueado para venda
          </Badge>
        )}
        {cliente.cliente_tags?.map(({ catalogo_id }) => {
          const marcacao = (marcacoes.data ?? []).find((m) => m.id === catalogo_id);
          if (!marcacao) return null;
          return (
            <Badge key={catalogo_id} className={corDaEtiqueta(marcacao.cor, marcacao.descricao)}>
              {marcacao.descricao}
            </Badge>
          );
        })}
        {faltamDias !== null && faltamDias <= 30 && (
          <Badge variant="outline" className="border-amber-500/50 text-amber-600">
            <Cake className="mr-1 h-3 w-3" />
            {faltamDias === 0 ? 'Faz aniversário hoje' : `Aniversário em ${faltamDias} dia(s)`}
          </Badge>
        )}
      </div>

      {/* Indicadores só aparecem para quem pode ver venda — senão a ficha
          contaria dinheiro para quem o RBAC diz que não vê venda. */}
      {podeVerVendas && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Já gastou" valor={moeda(totalGasto)} tom="positivo" />
          <Indicador rotulo="Compras" valor={String(vendasValidas.length)} />
          <Indicador
            rotulo="Última compra"
            valor={ultimaCompra ? formatarData(ultimaCompra) : '—'}
          />
          <Indicador rotulo="Ordens de serviço" valor={String(ordens.length)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Dados cadastrais ───────────────────────────────────────────── */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Campo
              rotulo={cliente.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}
              valor={cliente.cpf_cnpj}
            />
            <Campo
              rotulo={cliente.tipo_pessoa === 'juridica' ? 'Inscrição Estadual' : 'RG'}
              valor={
                cliente.tipo_pessoa === 'juridica' ? cliente.inscricao_estadual : cliente.rg
              }
            />
            {cliente.data_nascimento && (
              <Campo
                rotulo="Nascimento"
                valor={`${formatarData(cliente.data_nascimento)}${idade !== null ? ` (${idade} anos)` : ''}`}
              />
            )}
            {cliente.genero && <Campo rotulo="Gênero" valor={cliente.genero} />}

            <div className="space-y-2 border-t pt-4">
              {cliente.telefones?.map((tel) => (
                <p key={tel} className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {tel}
                </p>
              ))}
              {cliente.email && (
                <p className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {cliente.email}
                </p>
              )}
              {cliente.instagram && (
                <p className="flex items-center gap-2 text-sm">
                  <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                  {cliente.instagram}
                </p>
              )}
              {cliente.site && (
                <p className="flex items-center gap-2 break-all text-sm">
                  <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {cliente.site}
                </p>
              )}
            </div>

            {endereco && (
              <div className="border-t pt-4">
                <p className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    {endereco}
                    {cliente.cep && (
                      <span className="block text-muted-foreground">CEP {cliente.cep}</span>
                    )}
                  </span>
                </p>
              </div>
            )}

            <div className="space-y-4 border-t pt-4">
              <Campo rotulo="Como conheceu" valor={origemDescricao} />
              <Campo rotulo="Motivo da compra" valor={motivoDescricao} />
              <Campo rotulo="Cliente desde" valor={formatarData(cliente.created_at)} />
            </div>

            {cliente.observacoes && (
              <div className="border-t pt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Observações
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{cliente.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Histórico ──────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <Tabs defaultValue="compras">
              <TabsList>
                <TabsTrigger value="compras">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Compras ({vendas.length})
                </TabsTrigger>
                <TabsTrigger value="os">
                  <Wrench className="mr-2 h-4 w-4" />
                  Assistência ({ordens.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="compras" className="mt-4">
                {!podeVerVendas ? (
                  <Vazio
                    titulo="Sem acesso às vendas"
                    descricao="Seu perfil não permite ver o histórico de compras."
                  />
                ) : vendas.length === 0 ? (
                  <Vazio
                    titulo="Nenhuma compra ainda"
                    descricao="As vendas fechadas no PDV no nome deste cliente aparecem aqui."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Venda</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendas.map((venda) => (
                        <TableRow key={venda.id}>
                          <TableCell className="font-medium">
                            {venda.numero_venda ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {dataHora(venda.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={venda.status === 'cancelado' ? 'destructive' : 'outline'}
                            >
                              {venda.status ?? '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {moeda(venda.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="os" className="mt-4">
                {!podeVerOs ? (
                  <Vazio
                    titulo="Sem acesso às ordens de serviço"
                    descricao="Seu perfil não permite ver a assistência técnica."
                  />
                ) : ordens.length === 0 ? (
                  <Vazio
                    titulo="Nenhuma ordem de serviço"
                    descricao="Aparelhos deixados na assistência por este cliente aparecem aqui."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OS</TableHead>
                        <TableHead>Aparelho</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right">Orçamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordens.map((os) => {
                        const status = getStatusConfig(os.status ?? '');
                        return (
                          <TableRow
                            key={os.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/os/${os.id}`)}
                          >
                            <TableCell className="font-medium">
                              {os.numero_os}
                              <span className="block text-xs text-muted-foreground">
                                {formatarData(os.created_at)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {[os.marca, os.modelo].filter(Boolean).join(' ') || '—'}
                              <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
                                {os.defeito_cliente}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge className={status.color}>{status.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {moeda(os.total_orcamento)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <ClienteFormDialog
        open={editarAberto}
        onOpenChange={setEditarAberto}
        cliente={cliente}
        onSalvo={() => clienteQuery.refetch()}
      />
    </div>
  );
}
