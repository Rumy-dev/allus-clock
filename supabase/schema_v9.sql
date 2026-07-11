-- Allus Clock — incremento v9
-- Rode no SQL Editor do Supabase (uma vez), depois do schema_v8.sql.
--
-- FIX DE SEGURANÇA CRÍTICO: a policy "profiles só são editáveis pelo dono"
-- (schema.sql) usa USING (id = auth.uid()) sem WITH CHECK e sem restrição de
-- coluna — isso permite que QUALQUER usuário autenticado troque o próprio
-- `role` para 'admin' direto via update na tabela, contornando por completo
-- a Edge Function admin-members (que é o único lugar que deveria poder
-- promover/rebaixar membros). Este trigger bloqueia mudança de `role` a
-- menos que a chamada venha com a service_role key (usada só pela Edge
-- Function, nunca pelo app desktop).

create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'Alterar role requer privilégio de administrador (use o Allus Pulse).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on public.profiles;
create trigger trg_prevent_self_role_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_self_role_escalation();
