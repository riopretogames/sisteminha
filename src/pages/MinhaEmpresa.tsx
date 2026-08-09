import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS } from '@/config/permissions';
import { PageHeader, Vazio } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { mascaraCpfCnpj, mascaraTelefone, mascaraCep } from '@/lib/documento';

/**
 * Minha Empresa — dados cadastrais do próprio tenant (uma linha por loja).
 *
 * Duas camadas de permissão, igual ao padrão do IE Comercial:
 * - `company.view` (gate de rota, já aplicado em config/menu.ts): todo mundo
 *   que abre a tela vê os dados.
 * - `company.edit`: só quem tem essa permissão vê os campos como inputs e o
 *   botão Salvar. Sem essa permissão, os mesmos dados aparecem em texto
 *   simples — mesmo layout, sem duplicar tela.
 *
 * Escopo assumido (corte deliberado, não esquecimento): esta tela edita só
 * os campos cadastrais "de vitrine" da loja — nome, CNPJ, IE, contato,
 * endereço (campo único, sem sub-campos de rua/número/bairro — a tabela não
 * guarda isso separado) e a identidade visual (cores e logo). Os campos
 * `config_fiscal`, `config_whatsapp` e `webhook_url` são configuração de
 * integrações de outras áreas e não são editados aqui. `ativo`, `id`,
 * `created_at`, `updated_at` são metadados que não fazem sentido editar por
 * um formulário.
 */

interface TenantForm {
  nome_loja: string;
  cnpj: string;
  inscricao_estadual: string;
  telefone: string;
  email: string;
  endereco: string;
  cor_primaria: string;
  cor_secundaria: string;
  logo_url: string;
}

const FORM_VAZIO: TenantForm = {
  nome_loja: '',
  cnpj: '',
  inscricao_estadual: '',
  telefone: '',
  email: '',
  endereco: '',
  cor_primaria: '',
  cor_secundaria: '',
  logo_url: '',
};

export default function MinhaEmpresa() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.profile?.tenant_id ?? null;
  const podeEditar = can(PERMISSIONS.COMPANY_EDIT);

  const [formData, setFormData] = useState<TenantForm>(FORM_VAZIO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    let ativo = true;

    const fetchTenant = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', tenantId)
          .single();

        if (error) throw error;
        if (!ativo) return;

        setFormData({
          nome_loja: data.nome_loja ?? '',
          cnpj: mascaraCpfCnpj(data.cnpj ?? ''),
          inscricao_estadual: data.inscricao_estadual ?? '',
          telefone: mascaraTelefone(data.telefone ?? ''),
          email: data.email ?? '',
          endereco: data.endereco ?? '',
          cor_primaria: data.cor_primaria ?? '',
          cor_secundaria: data.cor_secundaria ?? '',
          logo_url: data.logo_url ?? '',
        });
      } catch (error) {
        console.error('Erro ao carregar dados da loja:', error);
        toast({
          title: 'Erro ao carregar dados da loja',
          description: 'Tente novamente mais tarde.',
          variant: 'destructive',
        });
      } finally {
        if (ativo) setLoading(false);
      }
    };

    void fetchTenant();

    return () => {
      ativo = false;
    };
  }, [tenantId, toast]);

  useEffect(() => {
    setLogoError(false);
  }, [formData.logo_url]);

  const handleSave = async () => {
    if (!tenantId) {
      toast({
        title: 'Não foi possível salvar',
        description: 'Usuário sem loja vinculada.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.nome_loja.trim()) {
      toast({
        title: 'Nome da loja obrigatório',
        description: 'Informe o nome da loja.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          nome_loja: formData.nome_loja.trim(),
          cnpj: formData.cnpj.trim() || null,
          inscricao_estadual: formData.inscricao_estadual.trim() || null,
          telefone: formData.telefone.trim() || null,
          email: formData.email.trim() || null,
          endereco: formData.endereco.trim() || null,
          cor_primaria: formData.cor_primaria.trim() || null,
          cor_secundaria: formData.cor_secundaria.trim() || null,
          logo_url: formData.logo_url.trim() || null,
        })
        .eq('id', tenantId);

      if (error) throw error;

      toast({
        title: 'Dados salvos!',
        description: 'As informações da loja foram atualizadas.',
      });
    } catch (error) {
      console.error('Erro ao salvar dados da loja:', error);
      const msg = error instanceof Error ? error.message : 'Tente novamente.';
      toast({
        title: 'Erro ao salvar',
        // Mensagem de RLS é críptica; traduz pro que de fato aconteceu.
        description: /row-level security|policy/i.test(msg)
          ? 'Seu perfil de acesso não permite fazer isso.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        titulo="Minha Empresa"
        hint="Dados cadastrais da loja. Aparecem em documentos e laudos técnicos e, futuramente, no site."
      />

      {!tenantId ? (
        <Vazio
          titulo="Usuário sem loja vinculada"
          descricao="Fale com um administrador para vincular seu perfil a uma loja."
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nome_loja">Nome da loja *</Label>
                {podeEditar ? (
                  <Input
                    id="nome_loja"
                    value={formData.nome_loja}
                    onChange={e => setFormData({ ...formData, nome_loja: e.target.value })}
                    placeholder="Nome da loja"
                  />
                ) : (
                  <p className="text-sm font-medium">{formData.nome_loja || '—'}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                {podeEditar ? (
                  <Input
                    id="cnpj"
                    value={formData.cnpj}
                    onChange={e => setFormData({ ...formData, cnpj: mascaraCpfCnpj(e.target.value) })}
                    placeholder="00.000.000/0000-00"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{formData.cnpj || '—'}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="inscricao_estadual">Inscrição estadual</Label>
                {podeEditar ? (
                  <Input
                    id="inscricao_estadual"
                    value={formData.inscricao_estadual}
                    onChange={e =>
                      setFormData({ ...formData, inscricao_estadual: e.target.value })
                    }
                    placeholder="Inscrição estadual"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {formData.inscricao_estadual || '—'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                {podeEditar ? (
                  <Input
                    id="telefone"
                    value={formData.telefone}
                    onChange={e => setFormData({ ...formData, telefone: mascaraTelefone(e.target.value) })}
                    placeholder="(00) 00000-0000"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{formData.telefone || '—'}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                {podeEditar ? (
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{formData.email || '—'}</p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                {podeEditar ? (
                  <Textarea
                    id="endereco"
                    value={formData.endereco}
                    onChange={e => setFormData({ ...formData, endereco: e.target.value })}
                    placeholder="Endereço completo da loja"
                    rows={2}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {formData.endereco || '—'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor_primaria">Cor primária</Label>
                {podeEditar ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="cor_primaria"
                      value={formData.cor_primaria}
                      onChange={e => setFormData({ ...formData, cor_primaria: e.target.value })}
                      placeholder="#8B5CF6"
                    />
                    <div
                      className="h-9 w-9 shrink-0 rounded border"
                      style={{ backgroundColor: formData.cor_primaria || undefined }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {formData.cor_primaria || '—'}
                    </p>
                    {formData.cor_primaria && (
                      <div
                        className="h-5 w-5 shrink-0 rounded border"
                        style={{ backgroundColor: formData.cor_primaria }}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor_secundaria">Cor secundária</Label>
                {podeEditar ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="cor_secundaria"
                      value={formData.cor_secundaria}
                      onChange={e =>
                        setFormData({ ...formData, cor_secundaria: e.target.value })
                      }
                      placeholder="#111827"
                    />
                    <div
                      className="h-9 w-9 shrink-0 rounded border"
                      style={{ backgroundColor: formData.cor_secundaria || undefined }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {formData.cor_secundaria || '—'}
                    </p>
                    {formData.cor_secundaria && (
                      <div
                        className="h-5 w-5 shrink-0 rounded border"
                        style={{ backgroundColor: formData.cor_secundaria }}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="logo_url">URL do logo</Label>
                {podeEditar ? (
                  <Input
                    id="logo_url"
                    value={formData.logo_url}
                    onChange={e => setFormData({ ...formData, logo_url: e.target.value })}
                    placeholder="https://.../logo.png"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{formData.logo_url || '—'}</p>
                )}
                {formData.logo_url && !logoError && (
                  <img
                    src={formData.logo_url}
                    alt="Prévia do logo da loja"
                    className="h-20 max-w-[200px] rounded border object-contain p-2"
                    onError={() => setLogoError(true)}
                  />
                )}
              </div>
            </div>

            {podeEditar && (
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
