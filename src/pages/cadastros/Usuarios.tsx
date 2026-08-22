import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, Search, ShieldCheck, UserCog, RotateCcw, MessageSquare,
  Plus, KeyRound, Eye, EyeOff, Dices,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ROLES, ROLE_LABELS, PERMISSIONS, type Role, type Permission, rotuloDoPapel } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { useUsuarios, useExcecoes, type UsuarioLinha } from '@/hooks/useUsuarios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Cadastro de Usuários.
 *
 * Além dos dados da pessoa, mostra a "Lista de Perfil": a árvore de tudo que
 * ela pode fazer, agrupada por módulo, com três estados visíveis:
 *
 *   • marcado, discreto  → vem do perfil, como esperado
 *   • marcado, destacado → EXCEÇÃO que concedeu algo além do perfil
 *   • desmarcado, destacado → EXCEÇÃO que tirou algo que o perfil daria
 *
 * Destacar as exceções é o ponto principal da tela. Um sistema que mostra só
 * o resultado final esconde POR QUE fulano tem um acesso que o colega de mesmo
 * cargo não tem — e é assim que permissão vira bagunça em seis meses.
 */

interface PermissaoCatalogo {
  key: string;
  modulo: string;
  descricao: string;
}

export default function Usuarios() {
  const { usuarios, definirPapel, definirAtivo, renomear, criarUsuario, redefinirSenha } =
    useUsuarios();
  const { can } = useAuth();
  const podeGerenciar = can(PERMISSIONS.USERS_MANAGE);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<UsuarioLinha | null>(null);
  const [criando, setCriando] = useState(false);

  const lista = (usuarios.data ?? []).filter(
    (u) =>
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        titulo="Usuários"
        hint="Quem acessa o sistema, com qual perfil, e o que cada um pode fazer."
        acoes={
          podeGerenciar ? (
            <Button onClick={() => setCriando(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo usuário
            </Button>
          ) : null
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar por nome ou e-mail..."
          className="pl-9"
        />
      </div>

      {usuarios.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <Vazio titulo="Nenhum usuário encontrado" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((u) => (
            <Card
              key={u.id}
              className={cn('transition-all', !u.ativo && 'opacity-60')}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium leading-none">{u.nome}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      u.ativo
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {rotuloDoPapel(u.role)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setEditando(u)}>
                    <UserCog className="mr-1.5 h-3.5 w-3.5" />
                    Gerenciar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {criando && (
        <DialogNovoUsuario
          salvando={criarUsuario.isPending}
          onFechar={() => setCriando(false)}
          onCriar={(dados) =>
            criarUsuario.mutate(dados, { onSuccess: () => setCriando(false) })
          }
        />
      )}

      {editando && (
        <DialogUsuario
          usuario={editando}
          onFechar={() => setEditando(null)}
          onPapel={(role) => definirPapel.mutate({ userId: editando.id, role })}
          onAtivo={(ativo) => definirAtivo.mutate({ userId: editando.id, ativo })}
          onNome={(nome) => renomear.mutate({ userId: editando.id, nome })}
          onSenha={(senha) => redefinirSenha.mutate({ userId: editando.id, senha })}
          trocandoSenha={redefinirSenha.isPending}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Mínimo aceito. O servidor exige o mesmo — a tela só avisa antes. */
const SENHA_MINIMA = 8;

/**
 * Senha aleatória fácil de ditar em voz alta.
 *
 * Sem as letras e números que se confundem lendo no papel ou no WhatsApp:
 * i/l/1, o/0. Quem entrega a senha para o funcionário fala ela em voz alta —
 * uma senha "correta" que ninguém consegue transmitir vira chamado de suporte.
 */
function gerarSenha(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const sortear = (fonte: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((v) => fonte[v % fonte.length])
      .join('');
  return `${sortear(letras, 4)}-${sortear(numeros, 4)}-${sortear(letras, 4)}`;
}

/** Campo de senha com olho para conferir e dado para sortear. */
function CampoSenha({
  valor,
  onChange,
  id,
}: {
  valor: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type={mostrar ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`No mínimo ${SENHA_MINIMA} caracteres`}
          className="pr-9 font-mono"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setMostrar((m) => !m)}
          className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onChange(gerarSenha());
          setMostrar(true);
        }}
      >
        <Dices className="mr-1.5 h-4 w-4" />
        Sortear
      </Button>
    </div>
  );
}

/**
 * Criação de usuário.
 *
 * O perfil vem no mesmo formulário de propósito: usuário criado sem perfil não
 * consegue fazer nada no sistema, e "eu defino depois" é justamente o passo
 * que fica para depois. Quem não tem permissão para definir perfil vê o campo
 * travado, com o motivo — em vez de criar uma conta inútil sem saber.
 */
function DialogNovoUsuario({
  onFechar,
  onCriar,
  salvando,
}: {
  onFechar: () => void;
  onCriar: (dados: { nome: string; email: string; senha: string; papel: Role }) => void;
  salvando: boolean;
}) {
  const { can } = useAuth();
  const podeTrocarPapel = can(PERMISSIONS.ROLES_MANAGE);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Role>(ROLES.VENDEDOR);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const podeSalvar =
    nome.trim().length > 0 && emailOk && senha.length >= SENHA_MINIMA && !salvando;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            A pessoa já entra no sistema com o e-mail e a senha definidos aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="n-nome">Nome completo</Label>
            <Input
              id="n-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Maria Souza"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-email">E-mail</Label>
            <Input
              id="n-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@riopretogames.com.br"
            />
            {email.trim().length > 0 && !emailOk && (
              <p className="text-xs text-destructive">
                Esse e-mail não parece válido — é com ele que a pessoa entra.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-senha">Senha</Label>
            <CampoSenha id="n-senha" valor={senha} onChange={setSenha} />
            <p className="text-xs text-muted-foreground">
              Anote antes de salvar: depois de criado, o sistema não mostra a senha de
              novo — só permite trocar por outra.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select
              value={papel}
              onValueChange={(v) => setPapel(v as Role)}
              disabled={!podeTrocarPapel}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.values(ROLES) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!podeTrocarPapel && (
              <p className="text-xs text-muted-foreground">
                Definir perfil exige a permissão de gerenciar perfis de acesso. A conta
                será criada sem perfil, e quem tiver essa permissão define depois.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            disabled={!podeSalvar}
            onClick={() =>
              onCriar({
                nome: nome.trim(),
                email: email.trim(),
                senha,
                papel: podeTrocarPapel ? papel : ('' as Role),
              })
            }
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar usuário
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function DialogUsuario({
  usuario,
  onFechar,
  onPapel,
  onAtivo,
  onNome,
  onSenha,
  trocandoSenha,
}: {
  usuario: UsuarioLinha;
  onFechar: () => void;
  onPapel: (role: Role) => void;
  onAtivo: (ativo: boolean) => void;
  onNome: (nome: string) => void;
  onSenha: (senha: string) => void;
  trocandoSenha: boolean;
}) {
  const { can } = useAuth();
  const [senhaNova, setSenhaNova] = useState('');
  const [trocandoAberto, setTrocandoAberto] = useState(false);
  // Ver e editar o cadastro é `users.manage`; trocar o PERFIL é
  // `roles.manage`. São concedidas separadamente, então a tela pergunta as
  // duas em vez de supor que quem entrou pode tudo.
  const podeTrocarPapel = can(PERMISSIONS.ROLES_MANAGE);
  const [nome, setNome] = useState(usuario.nome);
  const [papel, setPapel] = useState<Role | null>(usuario.role);
  const [ativo, setAtivo] = useState(usuario.ativo);

  const { data: excecoes, aplicar, definirMotivo } = useExcecoes(usuario.id);

  const { data: catalogo } = useQuery({
    queryKey: ['permissions-catalogo'],
    queryFn: async (): Promise<PermissaoCatalogo[]> => {
      const { data, error } = await supabase.from('permissions').select('key, modulo, descricao');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: doPerfil } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async (): Promise<Array<{ role: string; permission_key: string }>> => {
      const { data, error } = await supabase.from('role_permissions').select('role, permission_key');
      if (error) throw error;
      return data ?? [];
    },
  });

  const concedidasPeloPerfil = useMemo(() => {
    const s = new Set<string>();
    for (const r of doPerfil ?? []) if (r.role === papel) s.add(r.permission_key);
    return s;
  }, [doPerfil, papel]);

  const excecaoDe = useMemo(() => {
    const m = new Map<string, { concedida: boolean; motivo: string | null }>();
    for (const e of excecoes ?? []) m.set(e.permission_key, { concedida: e.concedida, motivo: e.motivo });
    return m;
  }, [excecoes]);

  const porModulo = useMemo(() => {
    const g = new Map<string, PermissaoCatalogo[]>();
    for (const p of catalogo ?? []) {
      const l = g.get(p.modulo) ?? [];
      l.push(p);
      g.set(p.modulo, l);
    }
    return [...g.entries()];
  }, [catalogo]);

  const totalExcecoes = excecoes?.length ?? 0;
  const ehAdministrador = papel === ROLES.ADMINISTRADOR;

  return (
    <Dialog open onOpenChange={onFechar}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastro de Usuário</DialogTitle>
          <DialogDescription>{usuario.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-nome">Nome completo</Label>
              <Input
                id="u-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onBlur={() => nome.trim() && nome !== usuario.nome && onNome(nome)}
              />
            </div>

            {/*
              A tela inteira é liberada por `users.manage`, mas TROCAR O PERFIL
              exige `roles.manage` — são permissões diferentes, e o sistema
              deixa conceder uma sem a outra. Sem esta checagem, quem tivesse
              só a primeira via o seletor habilitado, escolhia um perfil e a
              operação era recusada pelo banco depois do clique.
            */}
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select
                value={papel ?? ''}
                disabled={!podeTrocarPapel}
                onValueChange={(v) => {
                  setPapel(v as Role);
                  onPapel(v as Role);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem perfil" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ROLES).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!podeTrocarPapel && (
                <p className="text-xs text-muted-foreground">
                  Você pode ver e editar o cadastro, mas trocar o perfil exige a
                  permissão "Gerenciar perfis de acesso".
                </p>
              )}
            </div>
          </div>

          {/* Senha: só troca, nunca mostra a atual — nem o sistema sabe qual é. */}
          <div className="rounded-lg border p-3">
            {!trocandoAberto ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Senha de acesso</p>
                  <p className="text-xs text-muted-foreground">
                    Para quem esqueceu a senha. A antiga para de valer na hora.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSenhaNova('');
                    setTrocandoAberto(true);
                  }}
                >
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="e-senha" className="text-sm font-medium">
                  Senha nova para {usuario.nome}
                </Label>
                <CampoSenha id="e-senha" valor={senhaNova} onChange={setSenhaNova} />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTrocandoAberto(false)}
                    disabled={trocandoSenha}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={senhaNova.length < SENHA_MINIMA || trocandoSenha}
                    onClick={() => {
                      onSenha(senhaNova);
                      setTrocandoAberto(false);
                    }}
                  >
                    {trocandoSenha && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Salvar senha
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Ativo</p>
              <p className="text-xs text-muted-foreground">
                Desativar tira o acesso a tudo na hora, sem apagar o histórico da pessoa.
              </p>
            </div>
            <Switch
              checked={ativo}
              onCheckedChange={(v) => {
                setAtivo(v);
                onAtivo(v);
              }}
            />
          </div>

          {/* ── Lista de Perfil ──────────────────────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Lista de Perfil</h3>
              {totalExcecoes > 0 && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                  {totalExcecoes} {totalExcecoes === 1 ? 'exceção' : 'exceções'}
                </Badge>
              )}
            </div>

            {ehAdministrador ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Administrador tem acesso a tudo, sempre. Não há o que ajustar aqui —
                inclusive porque poder tirar permissão de administrador permitiria
                trancar o sistema sem ninguém capaz de destravá-lo.
              </p>
            ) : !papel ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Escolha um perfil acima. Enquanto não houver perfil, esta pessoa
                entra no sistema mas não enxerga nenhum módulo.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  As caixas já vêm marcadas conforme o perfil{' '}
                  <span className="font-medium">{ROLE_LABELS[papel]}</span>. Mexer aqui
                  cria uma exceção só para esta pessoa — o perfil dos colegas não muda.
                </p>

                <div className="space-y-4">
                  {porModulo.map(([modulo, itens]) => (
                    <div key={modulo}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {modulo}
                      </p>
                      <div className="divide-y rounded-lg border">
                        {itens.map((p) => {
                          const perfilConcede = concedidasPeloPerfil.has(p.key);
                          const excecao = excecaoDe.get(p.key);
                          const efetivo = excecao?.concedida ?? perfilConcede;
                          const temExcecao = excecao !== undefined;

                          return (
                            <label
                              key={p.key}
                              className={cn(
                                'flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40',
                                temExcecao && 'bg-amber-500/5',
                              )}
                            >
                              <Checkbox
                                checked={efetivo}
                                disabled={aplicar.isPending}
                                onCheckedChange={(v) =>
                                  aplicar.mutate({
                                    permissao: p.key as Permission,
                                    desejado: Boolean(v),
                                    perfilConcede,
                                  })
                                }
                              />
                              <span className="flex-1 text-sm">{p.descricao}</span>

                              {temExcecao && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Badge
                                    variant="secondary"
                                    className="bg-amber-500/10 text-[10px] text-amber-600"
                                  >
                                    {excecao?.concedida ? 'concedido à parte' : 'removido'}
                                  </Badge>
                                  <MotivoExcecao
                                    motivoAtual={excecao?.motivo ?? null}
                                    salvando={definirMotivo.isPending}
                                    onSalvar={(motivo) =>
                                      definirMotivo.mutate({ permissao: p.key as Permission, motivo })
                                    }
                                  />
                                  <button
                                    type="button"
                                    title="Voltar ao que o perfil define"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      aplicar.mutate({
                                        permissao: p.key as Permission,
                                        desejado: perfilConcede,
                                        perfilConcede,
                                      });
                                    }}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Motivo (opcional) de uma exceção de permissão — separado do clique do
 * checkbox de propósito (achado de 18/08: exceção nunca deixava rastro do
 * "por quê"). Preencher não é obrigatório, senão criar/tirar uma exceção
 * rápida no balcão viraria um formulário — mas quem quiser documentar tem
 * onde, e fica salvo junto com quem decidiu (`definida_por`, gravado
 * sozinho por `useExcecoes`).
 */
function MotivoExcecao({
  motivoAtual,
  salvando,
  onSalvar,
}: {
  motivoAtual: string | null;
  salvando: boolean;
  onSalvar: (motivo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState(motivoAtual ?? '');

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setRascunho(motivoAtual ?? '');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={motivoAtual ? 'Ver/editar motivo desta exceção' : 'Registrar motivo (opcional)'}
          onClick={(e) => {
            // Só stopPropagation — o botão está dentro do <label> do Checkbox,
            // e sem isso o clique "vazaria" e alternaria a exceção por baixo.
            // NÃO chamar preventDefault aqui: o Radix PopoverTrigger compõe o
            // onClick com o próprio onOpenToggle via composeEventHandlers, que
            // só dispara quando o evento NÃO está com defaultPrevented — um
            // preventDefault() neste handler (que roda antes, por causa de como
            // o Slot do Radix mescla os dois onClick) cancelava silenciosamente
            // a abertura do Popover. Achado na revisão de 18/08.
            e.stopPropagation();
          }}
          className={cn(
            'text-muted-foreground hover:text-foreground',
            motivoAtual && 'text-amber-600',
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Label className="text-xs">Motivo desta exceção (opcional)</Label>
        <Textarea
          rows={3}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          placeholder="Ex.: cobre férias do gerente até 30/09"
          className="text-sm"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={salvando}
            onClick={() => {
              onSalvar(rascunho);
              setAberto(false);
            }}
          >
            {salvando && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
