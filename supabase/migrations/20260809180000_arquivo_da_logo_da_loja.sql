-- =============================================================================
-- Sisteminha (RP System.IO) — Logo da loja vira arquivo anexado
-- =============================================================================
--
-- Pedido do Felipe em 09/08: "a logo seria anexada, não URL".
--
-- Ele está certo, e o campo antigo era pior do que parecia: pedir "URL do logo"
-- só funciona para quem já tem o arquivo publicado em algum lugar da internet.
-- Quem tem uma loja tem o arquivo da logo no computador — e ficava sem saída.
--
-- ESTE É O PRIMEIRO ARQUIVO QUE O SISTEMA GUARDA. Até agora não havia nenhum
-- lugar para isso, e foi o motivo de a foto do cliente e a do aparelho terem
-- sido adiadas duas vezes. A estrutura nasce aqui, mas de propósito só para a
-- logo — decisão do Felipe: "só a logo na parte Minha Empresa".
--
-- POR QUE O ARQUIVO É PÚBLICO
--
-- A logo aparece em laudo entregue ao cliente, em documento impresso e,
-- futuramente, no site. Deixá-la privada obrigaria cada uma dessas telas a
-- pedir uma permissão temporária ao banco para exibir a imagem — complicação
-- sem ganho, porque a logo é justamente o que a loja quer que todo mundo veja.
--
-- Foto de aparelho e documento de cliente, quando chegarem, NÃO seguem esta
-- regra: aqueles são privados e vão precisar de bucket próprio.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  -- 2 MB. Logo de loja tem alguns kilobytes; o limite existe para impedir que
  -- alguém suba uma foto de 12 MB por engano e deixe o laudo lento de abrir.
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- Quem pode mexer
-- -----------------------------------------------------------------------------
-- Cada loja só escreve na pasta dela: o primeiro pedaço do caminho do arquivo é
-- o id do tenant. Sem isso, uma loja poderia sobrescrever a logo de outra —
-- risco teórico hoje (um tenant só), mas o tipo de coisa que ninguém lembra de
-- fechar depois que vira multi-loja.

DROP POLICY IF EXISTS "Logo e publica para leitura" ON storage.objects;
CREATE POLICY "Logo e publica para leitura"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Quem configura o sistema envia a logo" ON storage.objects;
CREATE POLICY "Quem configura o sistema envia a logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'settings.edit')
  );

DROP POLICY IF EXISTS "Quem configura o sistema troca a logo" ON storage.objects;
CREATE POLICY "Quem configura o sistema troca a logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'settings.edit')
  );

DROP POLICY IF EXISTS "Quem configura o sistema remove a logo" ON storage.objects;
CREATE POLICY "Quem configura o sistema remove a logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND public.has_permission(auth.uid(), 'settings.edit')
  );


COMMENT ON COLUMN public.tenants.logo_url IS
  'Endereço público da logo, gerado pelo envio do arquivo em Minha Empresa. '
  'O arquivo vive no bucket `logos`, na pasta do tenant. Continua sendo texto '
  'para não quebrar quem já lê esta coluna.';


-- =============================================================================
-- CONFERÊNCIA (rodar depois, no SQL Editor)
-- =============================================================================
-- 1) O bucket existe e é público?
--    SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'logos';
--
-- 2) As quatro regras de acesso entraram?
--    SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects' AND policyname ILIKE '%logo%';
-- =============================================================================
