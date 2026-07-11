import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AdminAction =
  | { action?: undefined }
  | { action: 'invite'; email: string; fullName: string; role: 'member' | 'admin'; password: string }
  | { action: 'set-role'; userId: string; role: 'member' | 'admin' }
  | { action: 'set-password'; userId: string; password: string };

// Rate limit best-effort por usuário admin, em memória: sobrevive só enquanto
// a instância da function ficar "quente" (Deno Deploy recicla instâncias),
// então não é garantia absoluta contra abuso distribuído — mas barra o caso
// comum de um token vazado/comprometido sendo usado pra criar/alterar contas
// em massa dentro de uma janela curta. Ações sensíveis (invite, set-password,
// set-role) ficam limitadas a 10 chamadas / 5 min por admin.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitHits = new Map<string, number[]>();

function checkRateLimit(adminUserId: string): void {
  const now = Date.now();
  const hits = (rateLimitHits.get(adminUserId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    throw new Response(
      JSON.stringify({ error: 'Muitas alterações em pouco tempo. Aguarde alguns minutos.' }),
      { status: 429, headers: corsHeaders },
    );
  }
  hits.push(now);
  rateLimitHits.set(adminUserId, hits);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getAdminClient(authHeader: string | null) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase env vars ausentes.');
  }

  // Client "puro" com a service_role, sem Authorization sobrescrito — é o
  // único jeito de auth.admin.* (inviteUserByEmail, listUsers) ser aceito
  // pelo GoTrue. Se o header Authorization for trocado pelo JWT do usuário,
  // as chamadas admin passam a usar esse JWT em vez da service_role e o
  // GoTrue responde "User not allowed".
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader?.replace(/^Bearer\s+/i, '') ?? null;
  const { data: userData, error: userError } = token
    ? await adminClient.auth.getUser(token)
    : { data: { user: null }, error: new Error('Sem token') };
  if (userError || !userData.user) {
    throw new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401, headers: corsHeaders });
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Acesso negado.' }), { status: 403, headers: corsHeaders });
  }

  return { adminClient, adminUserId: userData.user.id };
}

async function listMembers(client: ReturnType<typeof createClient>) {
  const [{ data: profiles, error: profilesError }, { data: usersData, error: usersError }] = await Promise.all([
    client.from('profiles').select('id, full_name, created_at, role').order('full_name'),
    client.auth.admin.listUsers(),
  ]);

  if (profilesError) throw new Error(profilesError.message);
  if (usersError) throw new Error(usersError.message);

  const emailById = new Map((usersData?.users ?? []).map((user) => [user.id, user.email ?? null]));

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    email: emailById.get(profile.id) ?? null,
    role: profile.role ?? 'member',
    createdAt: profile.created_at,
  }));
}

async function inviteMember(
  client: ReturnType<typeof createClient>,
  payload: Extract<AdminAction, { action: 'invite' }>,
) {
  const email = payload.email.trim();
  const fullName = payload.fullName.trim();
  const password = payload.password;
  if (!email) throw new Error('E-mail é obrigatório.');
  if (!password || password.length < 6) throw new Error('Senha precisa ter ao menos 6 caracteres.');

  // Cria o usuário já com a senha definida pelo admin — sem depender de
  // e-mail (nem de link mágico, nem de código de recuperação, que esbarram
  // no limite de envio do serviço de e-mail padrão do Supabase).
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split('@')[0] },
  });
  if (error || !data.user) throw new Error(error?.message ?? 'Falha ao criar usuário.');

  const { error: upsertError } = await client.from('profiles').upsert(
    {
      id: data.user.id,
      full_name: fullName || email.split('@')[0],
      role: payload.role,
    },
    { onConflict: 'id' },
  );
  if (upsertError) throw new Error(upsertError.message);
}

async function setRole(
  client: ReturnType<typeof createClient>,
  payload: Extract<AdminAction, { action: 'set-role' }>,
) {
  const { error } = await client.from('profiles').update({ role: payload.role }).eq('id', payload.userId);
  if (error) throw new Error(error.message);
}

async function setPassword(
  client: ReturnType<typeof createClient>,
  payload: Extract<AdminAction, { action: 'set-password' }>,
) {
  if (!payload.password || payload.password.length < 6) throw new Error('Senha precisa ter ao menos 6 caracteres.');
  const { error } = await client.auth.admin.updateUserById(payload.userId, { password: payload.password });
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { adminClient: client, adminUserId } = await getAdminClient(req.headers.get('Authorization'));
    if (req.method === 'GET') {
      const members = await listMembers(client);
      return json({ ok: true, members });
    }

    if (req.method === 'POST') {
      const body = (await req.json()) as AdminAction;
      if (body.action === 'invite' || body.action === 'set-role' || body.action === 'set-password') {
        checkRateLimit(adminUserId);
      }
      if (body.action === 'invite') {
        await inviteMember(client, body);
        return json({ ok: true });
      }
      if (body.action === 'set-role') {
        await setRole(client, body);
        return json({ ok: true });
      }
      if (body.action === 'set-password') {
        await setPassword(client, body);
        return json({ ok: true });
      }
      return json({ ok: false, error: 'Ação inválida.' }, 400);
    }

    return json({ ok: false, error: 'Método não suportado.' }, 405);
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
