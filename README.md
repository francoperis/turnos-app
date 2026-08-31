# TurnosPai — Panel de gestión de turnos

Web app de turnos (SPA de HTML estático + Supabase). Sin build step: los
archivos `.html` se sirven tal cual. Solo las funciones de `/api` corren en el
servidor (Vercel Edge Functions).

- **Producción:** https://turnos.paipai.ar
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Vercel

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html` | Panel del profesional (login + agenda + turnos) |
| `paciente.html` | Reserva pública del paciente, se sirve en `/:slug` |
| `admin.html` | Panel de super-admin (alta/baja de profesionales, pagos) |
| `reset.html` | Recuperación de contraseña (flujo PKCE de Supabase) |
| `api/crear-profesional.js` | Edge Function: crea usuario en Auth + fila en `profesionales` |
| `api/eliminar-profesional.js` | Edge Function: borra profesional de la tabla y de Auth |
| `manifest.json`, `sw.js` | PWA (instalable + service worker de push) |
| `vercel.json` | Rewrites de rutas (`/panel`, `/paciente`, `/admin`, `/:slug`, …) |

### Tablas de Supabase que usa el front
`profesionales`, `pacientes`, `turnos`, `pagos`, `dias_bloqueados`,
`sesiones_por_paciente`.

## Configuración

### Variables de entorno (solo para `/api`)
Ver `.env.example`. Se setean en **Vercel → Settings → Environment Variables**:

| Variable | Dónde sale (Supabase Dashboard) |
|---|---|
| `SUPABASE_URL` | Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_KEY` | Project Settings → API Keys → `service_role` (secreta) |

### Config del front (hardcodeada en los HTML)
El front **no** usa variables de entorno. La URL y la **anon key** de Supabase
están escritas directo en cada HTML (`index`, `paciente`, `admin`, `reset`). Si
cambiás de proyecto Supabase, hay que actualizar esas 4 constantes
`SUPABASE_URL` / `SUPABASE_KEY` a mano. La anon key es pública por diseño; la
seguridad depende de tener **RLS activo** en todas las tablas.

## 🔧 Cómo volver a levantarlo (runbook de recuperación)

Si el deploy se cayó tras un tiempo de inactividad, seguí este orden:

1. **Reactivar Supabase.** Entrá al [dashboard](https://supabase.com/dashboard).
   Si el proyecto figura *Paused*, tocá **Restore/Resume** y esperá a que quede
   *Active*. (El free tier pausa proyectos tras ~7 días sin actividad — es la
   causa más común de que "la app cargue pero no traiga datos".)
   - Confirmá que la **anon key** y la **Project URL** siguen siendo las mismas
     que están en los HTML. Si Supabase generó un proyecto nuevo, actualizá las
     constantes en los 4 archivos.
   - Verificá que **RLS** siga activo en todas las tablas.
2. **Configurar env vars en Vercel.** En Settings → Environment Variables cargá
   `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` (Production + Preview). Sin esto, el
   alta/baja de profesionales devuelve 500.
3. **Redeploy.** Vercel → Deployments → Redeploy (o `git push`, que dispara un
   deploy si el repo está conectado). Si el proyecto de Vercel se desconectó del
   repo, reconectalo o volvé a importarlo desde GitHub.
4. **Verificar dominio.** Confirmá que `turnos.paipai.ar` siga apuntando al
   proyecto de Vercel y que el dominio no haya vencido. El dominio está
   hardcodeado en el CORS de `/api/*`: si servís desde otro dominio, ajustá la
   allow-list `isAllowed` en ambas funciones.

### Checklist rápido
- [ ] Supabase *Active* (no *Paused*)
- [ ] RLS activo en todas las tablas
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` en Vercel
- [ ] Anon key / URL de los HTML coinciden con el proyecto Supabase
- [ ] Redeploy verde en Vercel
- [ ] `turnos.paipai.ar` resuelve y el certificado es válido

## Desarrollo local

Al no haber build, alcanza con servir la carpeta. Para probar también las
funciones `/api`:

```bash
cp .env.example .env    # completá los valores reales
npx vercel dev          # levanta el front + las Edge Functions en local
```

O, para solo el front estático (sin `/api`):

```bash
npx serve .             # o cualquier server estático
```
