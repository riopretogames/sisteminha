-- =============================================================================
-- Sisteminha (RPG System.IO) — a logo segue a permissão de Minha Empresa
-- =============================================================================
--
-- ACHADO NA REVISÃO DE 18/08: trocar a logo da loja exigia uma permissão
-- diferente da que libera a própria tela onde o botão fica.
--
--   Tela "Minha Empresa" (`MinhaEmpresa.tsx:63`) → `company.edit`
--   Bucket `logos` (migration 20260809180000)    → `settings.edit`
--
-- São permissões de módulos diferentes: uma é "editar os dados da minha
-- empresa", a outra é "mexer nas configurações do sistema". Hoje ninguém
-- tropeça porque só o Administrador tem as duas, mas o sistema permite
-- conceder cada uma separadamente (via exceção de usuário) — e no dia em que
-- alguém receber só `company.edit`, a tela abre, o campo de logo aparece
-- habilitado, a pessoa escolhe o arquivo e o envio falha com erro de
-- permissão. Botão habilitado que não funciona é pior do que botão escondido:
-- quem está usando não tem como saber que o problema é de acesso.
--
-- CORREÇÃO: o bucket passa a exigir `company.edit`, a mesma da tela. A logo é
-- um dado da empresa (fica em `tenants.logo_url`, ao lado de nome, CNPJ e
-- endereço), não uma configuração do sistema — quem pode trocar o nome
-- fantasia da loja pode trocar o logotipo dela.
--
-- A leitura continua pública, sem mudança: a logo aparece em documento
-- impresso e não tem nada de sigiloso.
-- =============================================================================

DROP POLICY IF EXISTS "Quem configura o sistema envia a logo" ON storage.objects;
CREATE POLICY "Quem edita a empresa envia a logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'company.edit')
  );

DROP POLICY IF EXISTS "Quem configura o sistema troca a logo" ON storage.objects;
CREATE POLICY "Quem edita a empresa troca a logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'company.edit')
  );

DROP POLICY IF EXISTS "Quem configura o sistema remove a logo" ON storage.objects;
CREATE POLICY "Quem edita a empresa remove a logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'company.edit')
  );

NOTIFY pgrst, 'reload schema';
