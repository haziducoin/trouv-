"""E2E : tire N contacts au hasard en DB et exécute le flow d'enrichissement complet.

Usage :
    uv run python scripts/e2e_random_contacts.py [N]

Prérequis : .env rempli (SUPABASE_*, GROQ_API_KEY a minima).
Le rapport est affiché en console et ajouté à ../ENRICHMENT.md (section Résultats E2E).
"""
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from enrichment_service import db                      # noqa: E402
from enrichment_service.crew import run_enrichment     # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 5


def pick_random_contacts(n: int):
    """Contacts avec nom+prénom, tirés au hasard."""
    res = (
        db.get_client()
        .table("contacts")
        .select("id, prenom, nom, ville")
        .neq("nom", "")
        .neq("prenom", "")
        .limit(500)
        .execute()
    )
    import random
    rows = [r for r in (res.data or []) if (r.get("nom") or "").strip() and (r.get("prenom") or "").strip()]
    random.shuffle(rows)
    return rows[:n]


def main() -> None:
    picks = pick_random_contacts(N)
    if not picks:
        print("Aucun contact éligible en DB.")
        sys.exit(1)

    lines = [f"\n## Résultats E2E — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"]
    lines.append("| Contact | Ville | Score | Statut | Review | Entreprise trouvée | Sources | Durée |")
    lines.append("|---|---|---|---|---|---|---|---|")

    ok_count = 0
    for row in picks:
        cid = row["id"]
        label = f"{row['prenom']} {row['nom']}"
        print(f"\n▶ Enrichissement de #{cid} — {label} ({row.get('ville') or '?'})")
        t0 = time.time()
        try:
            ctx = db.load_contact(cid)
            assert ctx is not None
            result = run_enrichment(ctx)
            review = db.save_enrichment(cid, result)
            dur = time.time() - t0
            plausible = result.status != "insufficient_data" and (result.confidence_score > 0)
            if plausible:
                ok_count += 1
            print(f"  ✓ score={result.confidence_score} statut={result.status} review={review} "
                  f"entreprise={result.company or '—'} sources={len(result.sources)} ({dur:.0f}s)")
            lines.append(
                f"| {label} (#{cid}) | {row.get('ville') or '—'} | {result.confidence_score} "
                f"| {result.status} | {review} | {result.company or '—'} | {len(result.sources)} | {dur:.0f}s |"
            )
        except Exception as e:  # noqa: BLE001
            dur = time.time() - t0
            print(f"  ✗ ERREUR : {e}")
            lines.append(f"| {label} (#{cid}) | {row.get('ville') or '—'} | — | erreur | — | — | — | {dur:.0f}s |")

    lines.append(f"\n**Bilan : {ok_count}/{len(picks)} enrichissements plausibles** (critère : ≥ 4/5)\n")
    report = "\n".join(lines)
    print(report)

    md = Path(__file__).parent.parent.parent / "ENRICHMENT.md"
    with md.open("a", encoding="utf-8") as f:
        f.write(report)
    print(f"\nRapport ajouté à {md}")


if __name__ == "__main__":
    main()
