#!/bin/bash
# setup.sh — Configure et migre la base Supabase en une seule commande
# Usage : bash scripts/setup.sh <DB_URL> <ANON_KEY>
#
# DB_URL  : Supabase → Settings → Database → Connection string (URI)
#           Format : postgresql://postgres.[ref]:[password]@aws-0-*.pooler.supabase.com:6543/postgres
# ANON_KEY: Supabase → Settings → API → anon public

set -e

DB_URL="${1:-}"
ANON_KEY="${2:-}"

if [ -z "$DB_URL" ]; then
  echo "Usage : bash scripts/setup.sh <DB_URL> [ANON_KEY]"
  echo ""
  echo "Trouver DB_URL : Supabase → Settings → Database → Connection string (URI)"
  exit 1
fi

echo "🔧 Installation de psql si absent..."
if ! command -v psql &>/dev/null; then
  brew install postgresql@16 2>/dev/null || brew install postgresql 2>/dev/null || true
  export PATH="$PATH:/opt/homebrew/opt/postgresql@16/bin"
fi

echo ""
echo "📋 Application de la migration contacts..."
psql "$DB_URL" -f supabase/migrations/202605280003_contacts_altea_sps.sql
echo "✅ Table contacts créée"

echo ""
echo "📦 Import des chunks CSV..."
CHUNKS_DIR="/tmp/chunks"
if [ ! -d "$CHUNKS_DIR" ] || [ -z "$(ls $CHUNKS_DIR/*.csv 2>/dev/null)" ]; then
  echo "⚠️  Chunks CSV absents dans $CHUNKS_DIR"
  echo "   Lance d'abord : python3 ~/Desktop/pipeline-contacts/scripts/clean_data.py --sps '...' --altea '...' --out /tmp/chunks/"
  exit 1
fi

COLS="source,prenom,nom,date_naissance,adresse,code_postal,ville,telephone,email,organisme,situation,norm_key"
COUNT=0
for f in $CHUNKS_DIR/chunk_*.csv; do
  echo "  → $f"
  psql "$DB_URL" -c "\COPY contacts ($COLS) FROM '$f' DELIMITER ';' CSV HEADER ON CONFLICT (norm_key) WHERE norm_key <> '' DO NOTHING;"
  COUNT=$((COUNT + 1))
done
echo "✅ $COUNT chunks importés"

echo ""
echo "🔍 Déduplication..."
psql "$DB_URL" -c "SELECT COUNT(*) AS total_contacts FROM contacts;"

if [ -n "$ANON_KEY" ]; then
  echo ""
  echo "🔑 Mise à jour .env.local avec la clé anon..."
  sed -i.bak "s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=$ANON_KEY|" .env.local
  echo "✅ .env.local mis à jour"
fi

echo ""
echo "✅ Setup terminé ! Lance maintenant :"
echo "   Terminal 1 : cd backend && npm run dev"
echo "   Terminal 2 : npm run dev"
