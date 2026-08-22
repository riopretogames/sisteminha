import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  MoreHorizontal,
  Phone,
  Mail,
  Ban,
  Edit,
  Trash2,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { ClienteFormDialog } from '@/components/clientes/ClienteFormDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCatalogo } from '@/hooks/useCatalogos';
import { useClientes, type Cliente } from '@/hooks/useClientes';
import { PERMISSIONS } from '@/config/permissions';
import { CLIENTE_ORIGEM } from '@/lib/constants';
import { soDigitos } from '@/lib/documento';
import { corDaEtiqueta } from '@/lib/cores';

/**
 * Lista de clientes.
 *
 * O cadastro em si mora em `components/clientes/ClienteFormDialog` — a ficha
 * do cliente reaproveita o mesmo formulário, e manter uma cópia em cada lugar
 * garantiria que uma das duas ficasse para trás.
 */

export default function Clientes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = useAuth();
  const { clientes, carregando, inativar } = useClientes();
  const origens = useCatalogo('origem_cliente');
  const marcacoes = useCatalogo('tag_cliente');

  // Mesma chave que a policy de INSERT/UPDATE em `clientes` exige. Antes esta
  // tela mostrava os botões para todo mundo e deixava o banco recusar com erro
  // cru — era a única tela de cadastro sem checagem nenhuma.
  const podeGerenciar = can(PERMISSIONS.REGISTRY_CUSTOMERS_MANAGE);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);

  const origemPorId = useMemo(() => {
    const mapa = new Map<string, string>();
    (origens.data ?? []).forEach((o) => mapa.set(o.id, o.descricao));
    return mapa;
  }, [origens.data]);

  /** Marcações vêm do catálogo editável, com a cor definida lá. */
  const marcacaoPorId = useMemo(() => {
    const mapa = new Map<string, { descricao: string; cor: string | null }>();
    (marcacoes.data ?? []).forEach((m) => mapa.set(m.id, { descricao: m.descricao, cor: m.cor }));
    return mapa;
  }, [marcacoes.data]);

  /** Catálogo editável quando existir; lista fixa antiga para cadastro velho. */
  const rotuloOrigem = (cliente: Cliente): string => {
    if (cliente.origem_id && origemPorId.has(cliente.origem_id)) {
      return origemPorId.get(cliente.origem_id)!;
    }
    const legado = CLIENTE_ORIGEM[cliente.origem as keyof typeof CLIENTE_ORIGEM];
    return legado?.label ?? cliente.origem ?? '—';
  };

  const abrirNovo = () => {
    setEditando(null);
    setDialogOpen(true);
  };

  const abrirEdicao = (cliente: Cliente) => {
    setEditando(cliente);
    setDialogOpen(true);
  };

  const excluir = async (cliente: Cliente) => {
    if (!confirm(`Excluir o cadastro de ${cliente.nome}?`)) return;
    await inativar.mutateAsync(cliente.id);
    toast({ variant: 'success', title: 'Cliente excluído', description: 'O cadastro foi removido da lista.' });
  };

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return clientes;
    const digitos = soDigitos(termo);

    return clientes.filter((c) => {
      const porTexto =
        c.nome.toLowerCase().includes(termo) ||
        c.email?.toLowerCase().includes(termo) ||
        c.instagram?.toLowerCase().includes(termo);

      // Busca por número ignora pontuação: quem digita "17999991234" tem que
      // achar o cliente salvo como "(17) 99999-1234".
      const porNumero =
        digitos.length > 0 &&
        (soDigitos(c.cpf_cnpj).includes(digitos) ||
          (c.telefones ?? []).some((t) => soDigitos(t).includes(digitos)));

      return Boolean(porTexto) || porNumero;
    });
  }, [clientes, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        titulo="Clientes"
        hint="A base da loja. Um cliente, um cadastro — o sistema não deixa cadastrar a mesma pessoa duas vezes."
        acoes={
          podeGerenciar && (
            <Button onClick={abrirNovo}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          )
        }
      />

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, telefone, e-mail ou @..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {!carregando && (
          <span className="text-sm text-muted-foreground">
            {filtrados.length} de {clientes.length}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-4">
              <Vazio
                titulo="Nenhum cliente encontrado"
                descricao={search ? 'Tente outra busca.' : 'Cadastre seu primeiro cliente.'}
              />
              {!search && podeGerenciar && (
                <div className="flex justify-center pb-8">
                  <Button onClick={abrirNovo}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar Cliente
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Como conheceu</TableHead>
                  <TableHead>Marcações</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((cliente) => (
                  <TableRow
                    key={cliente.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/cadastros/clientes/${cliente.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {cliente.nome}
                        {cliente.tipo_pessoa === 'juridica' && (
                          <Badge variant="outline" className="text-xs">
                            PJ
                          </Badge>
                        )}
                        {cliente.liberado_venda === false && (
                          <Badge variant="destructive" className="text-xs">
                            <Ban className="mr-1 h-3 w-3" />
                            Bloqueado
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {cliente.telefones?.[0] && (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {cliente.telefones[0]}
                          </span>
                        )}
                        {cliente.email && (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {cliente.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cliente.cpf_cnpj || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{rotuloOrigem(cliente)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {cliente.cliente_tags?.map(({ catalogo_id }) => {
                          const marcacao = marcacaoPorId.get(catalogo_id);
                          if (!marcacao) return null;
                          return (
                            <Badge
                              key={catalogo_id}
                              className={corDaEtiqueta(marcacao.cor, marcacao.descricao)}
                            >
                              {marcacao.descricao}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate(`/cadastros/clientes/${cliente.id}`)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver ficha
                          </DropdownMenuItem>
                          {podeGerenciar && (
                            <>
                              <DropdownMenuItem onClick={() => abrirEdicao(cliente)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => excluir(cliente)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ClienteFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cliente={editando}
        nomeInicial={editando ? '' : search.trim()}
        onUsarExistente={(id) => navigate(`/cadastros/clientes/${id}`)}
      />
    </div>
  );
}
