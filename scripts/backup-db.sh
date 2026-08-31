#!/usr/bin/env bash
#
# backup-db.sh — Dump completo de la base Supabase (Postgres) a un .sql.gz
#
# Uso:
#   DATABASE_URL="postgresql://..." ./scripts/backup-db.sh
#   ./scripts/backup-db.sh                 # toma DATABASE_URL de .env si existe
#   BACKUP_DIR=/ruta ./scripts/backup-db.sh
#
# DATABASE_URL: cadena del "Session pooler" de Supabase (puerto 5432).
#   Dashboard → Project Settings → Database → Connection string → Session pooler.
#   Formato: postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
#
# Requisitos: pg_dump (postgresql-client >= 17) y gzip.
#
set -euo pipefail

# ── Config (todo sobreescribible por variable de entorno) ────────────────
BACKUP_DIR="${BACKUP_DIR:-backups}"      # dónde se guardan los dumps
SCHEMAS="${BACKUP_SCHEMAS:-public}"      # esquemas a respaldar, separados por coma
RETENTION="${BACKUP_RETENTION:-14}"      # cuántos dumps conservar (0 = no borrar)

# ── Cargar .env si no viene DATABASE_URL en el entorno ───────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -z "${DATABASE_URL:-}" && -f "$ROOT_DIR/.env" ]]; then
  # Exporta solo DATABASE_URL desde .env, sin ejecutar el archivo entero
  DATABASE_URL="$(grep -E '^\s*DATABASE_URL=' "$ROOT_DIR/.env" | tail -1 | cut -d= -f2- | sed 's/^["'\'']//; s/["'\'']$//')"
fi

# ── Validaciones ─────────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: falta DATABASE_URL (pasala por entorno o ponela en .env)." >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump no está instalado (necesitás postgresql-client >= 17)." >&2
  exit 1
fi

# ── Dump ─────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/turnos-${TS}.sql.gz"

# Construir los flags --schema a partir de la lista separada por coma
SCHEMA_FLAGS=()
IFS=',' read -ra _schemas <<< "$SCHEMAS"
for s in "${_schemas[@]}"; do
  s="$(echo "$s" | xargs)"   # trim
  [[ -n "$s" ]] && SCHEMA_FLAGS+=("--schema=$s")
done

echo "→ Respaldando esquema(s) [$SCHEMAS] a $OUT ..."
# --no-owner / --no-privileges: evita errores por roles propios de Supabase al restaurar.
# --no-comments: dumps más limpios. Formato plano (SQL) para poder leerlo y restaurar con psql.
pg_dump "$DATABASE_URL" \
  "${SCHEMA_FLAGS[@]}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip -9 > "$OUT"

# ── Verificar que no quedó vacío ─────────────────────────────────────────
SIZE=$(gzip -l "$OUT" 2>/dev/null | awk 'NR==2{print $2}')
if [[ -z "$SIZE" || "$SIZE" -lt 100 ]]; then
  echo "ERROR: el dump quedó vacío o corrupto. Revisá la conexión." >&2
  rm -f "$OUT"
  exit 1
fi
echo "✓ Backup OK: $OUT ($(du -h "$OUT" | cut -f1))"

# ── Retención: borrar los más viejos, conservar los últimos $RETENTION ───
if [[ "$RETENTION" -gt 0 ]]; then
  mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/turnos-*.sql.gz 2>/dev/null | tail -n +$((RETENTION + 1)))
  if [[ ${#OLD[@]} -gt 0 ]]; then
    printf '%s\n' "${OLD[@]}" | xargs rm -f
    echo "  (limpieza: borrados ${#OLD[@]} backup(s) viejo(s), conservados $RETENTION)"
  fi
fi
