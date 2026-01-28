-- Allow authenticated users to insert tenants (for signup flow)
CREATE POLICY "Users can create their own tenant"
ON public.tenants FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also update profiles policy to allow viewing own profile even without tenant
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view own profile or profiles in tenant"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR tenant_id = get_user_tenant_id(auth.uid()));