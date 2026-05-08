export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const origin = req.headers.get('origin') || '';
  const allowed = ['https://teresaarauz.vercel.app', 'http://localhost:3000'];
  if (!allowed.some(o => origin.startsWith(o))) {
    return new Response('Forbidden', { status: 403 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Variables de entorno no configuradas' }, 500);
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: 'Body inválido' }, 400); }

  const { nombre, profesion, email, password, slug, plan } = body;
  if (!nombre || !email || !password || !slug) {
    return json({ error: 'Faltan campos obligatorios' }, 400);
  }

  // Calcular subscription_end según el plan elegido
  // trial  → +30 días desde hoy
  // activo → +30 días desde hoy (primer período pago)
  const planFinal = plan === 'activo' ? 'activo' : 'trial';
  const subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1 — Crear usuario en Supabase Auth
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  const authData = await authRes.json();
  if (!authRes.ok) {
    return json({ error: authData.message || 'Error al crear usuario en Auth' }, 400);
  }

  const userId = authData.id;

  // 2 — Insertar en tabla profesionales
  const proRes = await fetch(`${SUPABASE_URL}/rest/v1/profesionales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      id: userId,
      user_id: userId,
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      nombre,
      email,
      profesion: profesion || null,
      role: 'profesional',
      activo: true,
      plan: planFinal,
      trial_start: new Date().toISOString(),
      subscription_end: subscriptionEnd,
    }),
  });

  if (!proRes.ok) {
    const proErr = await proRes.json().catch(() => ({}));
    // Rollback: borrar usuario de Auth si falló el insert
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    });
    return json({ error: proErr.message || 'Error al crear perfil' }, 400);
  }

  return json({ ok: true, id: userId });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
