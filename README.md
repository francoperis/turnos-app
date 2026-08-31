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

## 💾 Backups de la base (Supabase / Postgres)

Supabase es Postgres, así que el respaldo se hace con `pg_dump`. El script
`scripts/backup-db.sh` genera un dump completo comprimido (`.sql.gz`).

### Requisitos (una sola vez)
- **`postgresql-client` v17** (el `pg_dump` debe ser ≥ que el Postgres del
  servidor, o falla con *"server version mismatch"*).
  - macOS: `brew install postgresql@17`
  - Ubuntu/Debian: `sudo apt install postgresql-client-17`
- `gzip` (ya viene en macOS/Linux).

### Configurar la conexión
En `.env` cargá `DATABASE_URL` con la cadena del **Session pooler** (puerto
5432): Dashboard → **Project Settings → Database → Connection string →
Session pooler**. Ver `.env.example`.

> ⚠️ Usá el **Session pooler (5432)**, no la conexión directa (en el free tier
> hoy es solo IPv6) ni el pooler *transaction* (6543, no sirve para `pg_dump`).

### Hacer un backup a mano
```bash
./scripts/backup-db.sh
# → backups/turnos-AAAAMMDD-HHMMSS.sql.gz
```
Variables opcionales:
- `BACKUP_DIR=/ruta` — dónde guardar (default `backups/`).
- `BACKUP_SCHEMAS="public,auth"` — esquemas a incluir (default `public`).
- `BACKUP_RETENTION=14` — cuántos dumps conservar (0 = no borrar).

Por defecto respalda el esquema **`public`** (todos los datos de la app:
`profesionales`, `pacientes`, `turnos`, `pagos`, etc.). Los **logins** de los
profesionales viven en el esquema `auth` de Supabase (Supabase Auth): si querés
respaldarlos también, corré con `BACKUP_SCHEMAS="public,auth"`. Restaurar `auth`
es más delicado (ver abajo).

### Restaurar
El dump es SQL plano comprimido. Para restaurarlo en un proyecto Supabase
**nuevo/vacío** (recuperación ante desastre):

```bash
gunzip -c backups/turnos-AAAAMMDD-HHMMSS.sql.gz \
  | psql "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Notas de restauración:
- El dump se genera con `--no-owner --no-privileges`, así que no arrastra los
  roles internos de Supabase.
- Restaurar el esquema **`public`** sobre uno ya existente puede chocar con
  objetos presentes; lo más limpio es restaurar en un proyecto nuevo. Para
  restaurar solo los datos sobre un esquema ya creado, revisá/aplicá partes del
  `.sql` a mano.
- El esquema **`auth`**: no lo pises entero en un proyecto ya en uso. Si migraste
  a un proyecto nuevo, lo habitual es recrear los profesionales con el panel de
  admin (que ya crea el usuario en Auth), o importar solo `auth.users` con
  cuidado. Los `profesional_id`/`user_id` de `public` referencian esos usuarios.
- Verificá siempre un backup restaurándolo alguna vez en un proyecto de prueba:
  un backup sin probar no es un backup.

### Backup automático diario (GitHub Actions)

El workflow `.github/workflows/backup.yml` corre **todos los días a las 07:00 UTC**
(~04:00 AR) y también se puede disparar a mano desde la pestaña **Actions →
Backup diario de la base → Run workflow**. Qué hace y por qué:

- Reutiliza `scripts/backup-db.sh` para hacer el dump de `public` + `auth`
  (datos de la app **y** los logins de los profesionales).
- **Cifra el dump con GPG (AES-256) dentro del runner**, antes de guardarlo. El
  `.sql.gz` en claro se borra: solo sale del job el archivo `.gpg`. Ni GitHub ni
  nadie sin la passphrase puede leer los datos de pacientes. **Requisito legal/de
  confianza, no opcional.**
- Guarda el `.gpg` como **artifact con 90 días de retención** (≈90 backups
  diarios). GitHub te **avisa por email si el workflow falla** (un backup que
  falla en silencio es el peor escenario).

**Setup (una sola vez):** en GitHub → **Settings → Secrets and variables →
Actions → New repository secret**, cargá:

| Secret | Valor |
|---|---|
| `DATABASE_URL` | La misma cadena del **Session pooler** (puerto 5432). |
| `BACKUP_PASSPHRASE` | Una passphrase larga y aleatoria para cifrar los backups. **Guardala en tu gestor de contraseñas: sin ella los backups son irrecuperables.** |

**Descargar y restaurar un backup automático:**
```bash
# 1) Bajá el artifact desde Actions → (la corrida) → Artifacts, y descomprimí el zip.
# 2) Descifrá + restaurá en un proyecto Supabase nuevo/vacío:
gpg -d turnos-AAAAMMDD-HHMMSS.sql.gz.gpg \
  | gunzip -c \
  | psql "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
# (te pide la BACKUP_PASSPHRASE al descifrar)
```

> **Durabilidad a futuro:** los backups viven en GitHub (cifrados) con 90 días de
> retención. Si querés retención más larga o copia fuera de GitHub, el paso
> natural es agregar un `upload` a object storage barato (Cloudflare R2 /
> Backblaze B2) al final del workflow — como ya sale cifrado, subirlo a
> cualquier lado es seguro.

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
