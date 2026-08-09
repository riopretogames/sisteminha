import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, UserCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCatalogo } from '@/hooks/useCatalogos';
import {
  useClientes,
  buscarClientesSemelhantes,
  bancoParaFormData,
  CLIENTE_FORM_VAZIO,
  type Cliente,
  type ClienteFormData,
  type ClienteSemelhante,
} from '@/hooks/useClientes';
import {
  mascaraCpfCnpj,
  mascaraTelefone,
  mascaraCep,
  conferirCpfCnpj,
  buscarEnderecoPorCep,
  telefoneIdentifica,
  soDigitos,
} from '@/lib/documento';

/**
 * Cadastro de cliente — a ficha completa.
 *
 * O formulário antigo tinha 5 campos (nome, CPF, telefone, e-mail, origem)
 * enquanto o banco já guardava 25. Não era falta de estrutura: as colunas
 * foram criadas em 01/08 espelhando o formulário que a equipe preenche no
 * sistema antigo, e nunca ganharam tela. Isto aqui liga o que já existia.
 *
 * Duas regras de negócio moram aqui, além de "guardar campo":
 *
 *  1. Um cliente, um cadastro (decisão de 08/08). A tela procura antes de
 *     gravar e oferece o cadastro existente. O banco recusa de verdade se
 *     alguém contornar a tela — ver migration 20260808150000.
 *  2. Cliente pode ser bloqueado para venda. Não é enfeite: o PDV recusa
 *     fechar venda para cliente bloqueado, e o banco também.
 */

const GENEROS = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null`/ausente = cadastro novo. */
  cliente?: Cliente | null;
  /** Aproveita o que já foi digitado numa busca que não achou ninguém. */
  nomeInicial?: string;
  onSalvo?: (cliente: Cliente) => void;
  /** Chamado quando a pessoa decide usar um cadastro que já existia. */
  onUsarExistente?: (clienteId: string) => void;
}

export function ClienteFormDialog({
  open,
  onOpenChange,
  cliente = null,
  nomeInicial = '',
  onSalvo,
  onUsarExistente,
}: Props) {
  const { toast } = useToast();
  const { criar, atualizar } = useClientes();
  // Os três catálogos que a ficha do cliente consome. Criar item novo em
  // Cadastros > Listas do Sistema faz ele aparecer aqui sozinho — nenhum
  // deles é lista fixa no código.
  const origens = useCatalogo('origem_cliente');
  const motivos = useCatalogo('motivo_compra');
  const marcacoes = useCatalogo('tag_cliente');

  const [form, setForm] = useState<ClienteFormData>(CLIENTE_FORM_VAZIO);
  const [semelhantes, setSemelhantes] = useState<ClienteSemelhante[]>([]);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const editando = Boolean(cliente);
  const pessoaFisica = form.tipo_pessoa === 'fisica';

  // Só documento e telefone são recusados pelo banco. Nome igual é aviso.
  const impedimentos = semelhantes.filter((s) => s.motivo !== 'nome');
  const avisosDeNome = semelhantes.filter((s) => s.motivo === 'nome');

  /**
   * Opções de um catálogo para um campo.
   *
   * Inclui o item já escolhido mesmo que ele tenha sido DESATIVADO depois. Sem
   * isso, editar o telefone de um cliente cuja origem foi desativada apagaria a
   * origem dele em silêncio — o Select viria vazio e o vazio seria salvo.
   */
  const opcoes = (todos: typeof origens.data, escolhidos: string[]) =>
    (todos ?? []).filter((i) => i.ativo || escolhidos.includes(i.id));

  const listaOrigens = opcoes(origens.data, [form.origem_id]);
  const listaMotivos = opcoes(motivos.data, [form.motivo_compra_id]);
  const listaMarcacoes = opcoes(marcacoes.data, form.tags);

  useEffect(() => {
    if (!open) return;
    setForm(cliente ? bancoParaFormData(cliente) : { ...CLIENTE_FORM_VAZIO, nome: nomeInicial });
    setSemelhantes([]);
  }, [open, cliente, nomeInicial]);

  /**
   * Cadastro novo começa com a origem marcada como padrão em Listas do
   * Sistema. Roda num efeito à parte porque o catálogo costuma chegar do banco
   * depois de o formulário já ter aberto.
   */
  useEffect(() => {
    if (!open || cliente) return;
    const padrao = (origens.data ?? []).find((o) => o.padrao && o.ativo);
    if (!padrao) return;
    setForm((f) => (f.origem_id ? f : { ...f, origem_id: padrao.id }));
  }, [open, cliente, origens.data]);

  const alterar = <C extends keyof ClienteFormData>(campo: C, valor: ClienteFormData[C]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  /**
   * Procura cadastro parecido enquanto a pessoa preenche, não só no fim.
   * Descobrir no meio do caminho evita digitar a ficha inteira para depois
   * levar "já existe".
   */
  const procurarSemelhantes = async () => {
    const achados = await buscarClientesSemelhantes({
      documento: form.cpf_cnpj,
      telefone: form.telefone,
      nome: form.nome,
      ignorarId: cliente?.id,
    });
    setSemelhantes(achados);
    return achados;
  };

  const preencherPeloCep = async (cep: string) => {
    if (soDigitos(cep).length !== 8) return;
    setBuscandoCep(true);
    const endereco = await buscarEnderecoPorCep(cep);
    setBuscandoCep(false);

    if (!endereco) {
      toast({
        title: 'CEP não encontrado',
        description: 'Pode preencher o endereço à mão normalmente.',
      });
      return;
    }

    setForm((f) => ({
      ...f,
      estado: endereco.estado || f.estado,
      municipio: endereco.municipio || f.municipio,
      bairro: endereco.bairro || f.bairro,
      logradouro: endereco.logradouro || f.logradouro,
    }));
  };

  const alternarTag = (tag: string) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: pessoaFisica ? 'Informe o nome do cliente.' : 'Informe a razão social.',
        variant: 'destructive',
      });
      return;
    }

    const problemaNoDocumento = conferirCpfCnpj(form.cpf_cnpj);
    if (problemaNoDocumento) {
      toast({
        title: 'Documento não confere',
        description: problemaNoDocumento,
        variant: 'destructive',
      });
      return;
    }

    if (form.telefone.trim() && !telefoneIdentifica(form.telefone)) {
      toast({
        title: 'Telefone incompleto',
        description: 'Faltam números — confira o DDD e o número.',
        variant: 'destructive',
      });
      return;
    }

    setSalvando(true);
    try {
      // Última conferência antes de gravar: entre abrir o formulário e clicar
      // em salvar, alguém em outro terminal pode ter cadastrado a mesma pessoa.
      const achados = await procurarSemelhantes();
      if (achados.some((s) => s.motivo !== 'nome')) {
        toast({
          title: 'Este cliente já tem cadastro',
          description: 'Use o cadastro que já existe, logo abaixo.',
          variant: 'destructive',
        });
        return;
      }

      const origemDescricao = listaOrigens.find((o) => o.id === form.origem_id)?.descricao;

      const salvo = editando
        ? await atualizar.mutateAsync({ id: cliente!.id, form, origemDescricao })
        : await criar.mutateAsync({ form, origemDescricao });

      toast({
        title: editando ? 'Cliente atualizado!' : 'Cliente cadastrado!',
        description: `${salvo.nome} foi salvo com sucesso.`,
      });

      onSalvo?.(salvo);
      onOpenChange(false);
    } catch {
      // O hook já mostrou o motivo em português.
    } finally {
      setSalvando(false);
    }
  };

  const usarExistente = (id: string) => {
    onUsarExistente?.(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          <DialogDescription>
            {editando
              ? 'Atualize a ficha do cliente.'
              : 'Só o nome é obrigatório — o resto pode ser completado depois.'}
          </DialogDescription>
        </DialogHeader>

        {/* Cadastro que já existe: some com o erro depois e resolve agora. */}
        {impedimentos.length > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Este cliente já está cadastrado
            </p>
            <div className="mt-2 space-y-2">
              {impedimentos.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <strong>{s.nome}</strong>{' '}
                    <span className="text-muted-foreground">
                      — mesmo {s.motivo === 'documento' ? 'CPF/CNPJ' : 'telefone'}
                      {s.telefones?.[0] ? ` (${s.telefones[0]})` : ''}
                    </span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => usarExistente(s.id)}>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Usar este cadastro
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {avisosDeNome.length > 0 && impedimentos.length === 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
              Já existe alguém com esse mesmo nome
            </p>
            <div className="mt-2 space-y-2">
              {avisosDeNome.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <strong>{s.nome}</strong>
                    {s.telefones?.[0] && (
                      <span className="text-muted-foreground"> — {s.telefones[0]}</span>
                    )}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => usarExistente(s.id)}>
                    É esse mesmo
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Se for outra pessoa, pode cadastrar normalmente.
            </p>
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* ── Identificação ────────────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Identificação</h3>

            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="tipo_pessoa">Tipo de pessoa</Label>
                <Select
                  value={form.tipo_pessoa}
                  onValueChange={(v) => alterar('tipo_pessoa', v as 'fisica' | 'juridica')}
                >
                  <SelectTrigger id="tipo_pessoa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fisica">Pessoa Física (CPF)</SelectItem>
                    <SelectItem value="juridica">Pessoa Jurídica (CNPJ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">{pessoaFisica ? 'Nome completo *' : 'Razão social *'}</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => alterar('nome', e.target.value)}
                  onBlur={procurarSemelhantes}
                  placeholder={pessoaFisica ? 'Nome do cliente' : 'Nome da empresa'}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cpf_cnpj">{pessoaFisica ? 'CPF' : 'CNPJ'}</Label>
                <Input
                  id="cpf_cnpj"
                  value={form.cpf_cnpj}
                  onChange={(e) => alterar('cpf_cnpj', mascaraCpfCnpj(e.target.value))}
                  onBlur={procurarSemelhantes}
                  placeholder={pessoaFisica ? '000.000.000-00' : '00.000.000/0000-00'}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="documento_extra">
                  {pessoaFisica ? 'RG' : 'Inscrição Estadual'}
                </Label>
                <Input
                  id="documento_extra"
                  value={pessoaFisica ? form.rg : form.inscricao_estadual}
                  onChange={(e) =>
                    alterar(pessoaFisica ? 'rg' : 'inscricao_estadual', e.target.value)
                  }
                />
              </div>
            </div>

            {pessoaFisica && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="data_nascimento">Data de nascimento</Label>
                  <Input
                    id="data_nascimento"
                    type="date"
                    value={form.data_nascimento}
                    onChange={(e) => alterar('data_nascimento', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genero">Gênero</Label>
                  <Select
                    value={form.genero || 'nao-informado'}
                    onValueChange={(v) => alterar('genero', v === 'nao-informado' ? '' : v)}
                  >
                    <SelectTrigger id="genero">
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao-informado">Não informado</SelectItem>
                      {GENEROS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>

          {/* ── Contato ──────────────────────────────────────────────────── */}
          <section className="space-y-4 border-t pt-5">
            <h3 className="text-sm font-semibold text-muted-foreground">Contato</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                <Input
                  id="telefone"
                  value={form.telefone}
                  onChange={(e) => alterar('telefone', mascaraTelefone(e.target.value))}
                  onBlur={procurarSemelhantes}
                  placeholder="(17) 99999-9999"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone_extra">Telefone extra</Label>
                <Input
                  id="telefone_extra"
                  value={form.telefone_extra}
                  onChange={(e) => alterar('telefone_extra', mascaraTelefone(e.target.value))}
                  placeholder="Recado, trabalho, familiar"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => alterar('email', e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  value={form.instagram}
                  onChange={(e) => alterar('instagram', e.target.value)}
                  placeholder="@nome"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="site">Link / site / outra rede</Label>
              <Input
                id="site"
                value={form.site}
                onChange={(e) => alterar('site', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </section>

          {/* ── Endereço ─────────────────────────────────────────────────── */}
          <section className="space-y-4 border-t pt-5">
            <h3 className="text-sm font-semibold text-muted-foreground">Endereço</h3>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cep">
                  CEP
                  {buscandoCep && (
                    <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </Label>
                <Input
                  id="cep"
                  value={form.cep}
                  onChange={(e) => {
                    const valor = mascaraCep(e.target.value);
                    alterar('cep', valor);
                    if (soDigitos(valor).length === 8) void preencherPeloCep(valor);
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="logradouro">Rua</Label>
                <Input
                  id="logradouro"
                  value={form.logradouro}
                  onChange={(e) => alterar('logradouro', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  value={form.numero}
                  onChange={(e) => alterar('numero', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  value={form.complemento}
                  onChange={(e) => alterar('complemento', e.target.value)}
                  placeholder="Apto, bloco, fundos"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  value={form.bairro}
                  onChange={(e) => alterar('bairro', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="municipio">Município</Label>
                <Input
                  id="municipio"
                  value={form.municipio}
                  onChange={(e) => alterar('municipio', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Input
                  id="estado"
                  value={form.estado}
                  onChange={(e) => alterar('estado', e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                />
              </div>
            </div>
          </section>

          {/* ── Relacionamento ───────────────────────────────────────────── */}
          <section className="space-y-4 border-t pt-5">
            <h3 className="text-sm font-semibold text-muted-foreground">Relacionamento</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="origem_id">Como conheceu a loja</Label>
                <Select
                  value={form.origem_id || 'nao-informado'}
                  onValueChange={(v) => alterar('origem_id', v === 'nao-informado' ? '' : v)}
                >
                  <SelectTrigger id="origem_id">
                    <SelectValue placeholder="Não informado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao-informado">Não informado</SelectItem>
                    {listaOrigens.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="motivo_compra_id">Motivo da compra</Label>
                <Select
                  value={form.motivo_compra_id || 'nao-informado'}
                  onValueChange={(v) => alterar('motivo_compra_id', v === 'nao-informado' ? '' : v)}
                >
                  <SelectTrigger id="motivo_compra_id">
                    <SelectValue placeholder="Não informado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao-informado">Não informado</SelectItem>
                    {listaMotivos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Marcações</Label>
              {listaMarcacoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma marcação cadastrada. Crie em Cadastros &gt; Listas do Sistema &gt; Tags
                  de Cliente e elas aparecem aqui.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {listaMarcacoes.map((tag) => {
                    const marcada = form.tags.includes(tag.id);
                    return (
                      <Button
                        key={tag.id}
                        type="button"
                        size="sm"
                        variant={marcada ? 'default' : 'outline'}
                        onClick={() => alternarTag(tag.id)}
                      >
                        {tag.descricao}
                        {!tag.ativo && ' (desativada)'}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="liberado_venda">Pode comprar na loja</Label>
                <p className="text-xs text-muted-foreground">
                  Desligue para bloquear este cliente. O PDV recusa fechar venda no nome dele —
                  serve para golpe, cheque sem fundo ou cliente que a loja não quer mais atender.
                </p>
              </div>
              <Switch
                id="liberado_venda"
                checked={form.liberado_venda}
                onCheckedChange={(v) => alterar('liberado_venda', v)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={form.observacoes}
                onChange={(e) => alterar('observacoes', e.target.value)}
                placeholder="Anotações sobre este cliente — preferências, histórico, combinados"
                rows={3}
              />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || impedimentos.length > 0}>
            {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
