# Enrichissement approfondi des fiches contacts — CrewAI

## Vue d'ensemble

Quand l'utilisateur ouvre une fiche contact et clique sur **« Lancer la recherche
approfondie »**, une équipe de 4 agents CrewAI recherche la personne sur des
sources web légales, vérifie la cohérence des trouvailles et enrichit la fiche
avec un score de confiance et une traçabilité complète.

```
Fiche contact (React)
  └─ POST /api/enrich-crew            (proxy Vercel — auth JWT Supabase)
       └─ POST /enrich/{contact_id}   (microservice Python FastAPI, Railway)
            └─ Crew CrewAI : Identifier → Web Researcher → Fact Checker → Writer
                 ├─ Tool registre gouv (recherche-entreprises.api.gouv.fr)
                 ├─ Tool Exa            (index LinkedIn légal, via API)
                 └─ Tool Brave Search   (web public)
            └─ Écriture dans public.contact_enrichment (+ review_status)
       └─ Stream SSE relayé jusqu'au navigateur (progression temps réel)
```

## Décisions techniques

| Décision | Choix | Raison |
|---|---|---|
| Orchestration | CrewAI (process séquentiel, 4 agents) | Demande projet ; rôles explicites et extensibles |
| LLM | Llama 3.3 70B (open-weights) servi par Groq, tier gratuit | Demande « IA gratuite open source » ; CrewAI le supporte nativement (`groq/llama-3.3-70b-versatile`) |
| Hébergement | Microservice FastAPI séparé (Railway, comme `backend/`) | CrewAI = Python ; les runs multi-agents dépassent les timeouts serverless Vercel |
| Exposition | Jamais directe — proxy `api/enrich-crew.ts` avec secret partagé | Le JWT utilisateur est vérifié côté Vercel, le service Python reste privé |
| Streaming | SSE (sse-starlette → relayé par le proxy → parsé en fetch/ReadableStream) | EventSource ne supporte pas POST ; progression temps réel dans l'UI |
| Stockage | Réutilisation de `contact_enrichment` (upsert par `contact_id`) | Schéma existant déjà adapté (confidence_score, status, sources jsonb) |
| Validation humaine | Colonne `review_status` : `auto` / `pending_review` / `approved` / `rejected` | Sépare écriture directe (≥75) de la validation manuelle (40–74) |
| RGPD / légal | Sources : registre gouv + Exa + Brave uniquement. Pas de scraping LinkedIn direct (ToS). Chaque donnée : `source_url` + `date_collecte`. Signaux privés (date de naissance) utilisés côté serveur pour désambiguïser, jamais restitués. | CLAUDE.md du projet + conformité |

## Règles de confiance

| Score | `review_status` | Comportement UI |
|---|---|---|
| ≥ 75 | `auto` | Écrit directement dans la fiche |
| 40–74 | `pending_review` | Affiché avec bandeau ambre + boutons **Valider / Rejeter** |
| < 40 | `rejected` | Non affiché |

## Fichiers

- `enrichment-service/` — microservice Python (uv, Python 3.12)
  - `src/enrichment_service/crew.py` — agents, tâches, LLM
  - `src/enrichment_service/tools/search_tools.py` — tools gouv/Exa/Brave
  - `src/enrichment_service/main.py` — endpoints SSE `/enrich/{id}`, `/review/{id}`, `/health`
  - `src/enrichment_service/db.py` — lecture contact, upsert enrichissement
  - `scripts/e2e_random_contacts.py` — E2E sur contacts réels tirés au hasard
  - `tests/` — pytest (tools mockés respx + intégration TestClient)
- `api/enrich-crew.ts` — proxy Vercel (auth + relais SSE + review)
- `src/lib/crewEnrichApi.ts` — client SSE navigateur
- `src/components/CrewEnrichPanel.tsx` — panel fiche contact
- `supabase/migrations/202607010016_enrichment_review_status.sql` — migration

## Configuration

### Microservice (Railway) — variables d'environnement
Voir `enrichment-service/.env.example` :
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EXA_API_KEY`, `BRAVE_API_KEY`,
`GROQ_API_KEY` (gratuit sur console.groq.com), `ENRICH_SERVICE_SECRET`.

### Vercel — variables d'environnement
- `ENRICH_SERVICE_URL` — URL Railway du microservice (ex. `https://enrich.up.railway.app`)
- `ENRICH_SERVICE_SECRET` — même valeur que côté microservice

### Lancer en local
```bash
cd enrichment-service
cp .env.example .env   # remplir les clés
uv sync
uv run uvicorn enrichment_service.main:app --reload --port 8000
```

### Tests
```bash
uv run pytest            # 12 tests, aucun appel réseau réel
uv run python scripts/e2e_random_contacts.py 5   # E2E réel (clés requises)
```

## Gestion des erreurs

- Contact introuvable → 404 propre relayé à l'UI (« Contact introuvable »)
- Contact sans nom/prénom → 422 (« enrichissement impossible »)
- Tool en échec (clé manquante, API down) → JSON d'erreur retourné à l'agent,
  le crew continue avec les autres sources
- Crew sans résultat exploitable → `status=insufficient_data`, score 0, non affiché
- Stream interrompu → message d'erreur + bouton Réessayer dans l'UI
