export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const origin = req.headers.get('origin') || '';
  // Permitir solo turnos.paipai.ar (todos los clientes viven en rutas /:slug) y localhost
  const isAllowed =
    origin === 'https://turnos.paipai.ar' ||
    origin.startsWith('http://localhost');
  if (!isAllowed) {
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

  const { id } = body;
  if (!id) return json({ error: 'Falta el id del profesional' }, 400);

  // 1 — Borrar de tabla profesionales (CASCADE borra pagos y turnos asociados si están configurados)
  const proRes = await fetch(`${SUPABASE_URL}/rest/v1/profesionales?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
  });

  if (!proRes.ok) {
    // Intentar con user_id como fallback
    const proRes2 = await fetch(`${SUPABASE_URL}/rest/v1/profesionales?user_id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
    });
    if (!proRes2.ok) {
      return json({ error: 'Error al eliminar el perfil' }, 400);
    }
  }

  // 2 — Borrar usuario de Supabase Auth
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });

  // Si no existe en Auth (usuario creado manualmente sin cuenta), no es error fatal
  if (!authRes.ok && authRes.status !== 404) {
    return json({ ok: true, warning: 'Perfil eliminado pero no se pudo borrar de Auth' });
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
