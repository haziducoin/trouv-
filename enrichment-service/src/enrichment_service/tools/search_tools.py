"""Tools CrewAI — sources autorisées uniquement (RGPD) :
  1. recherche-entreprises.api.gouv.fr — registre officiel, gratuit, déterministe
  2. Exa — index LinkedIn/web accessible légalement par API (pas de scraping direct)
  3. Brave Search — résultats web publics

Chaque résultat embarque url + date de collecte pour la traçabilité.
"""
import json
from datetime import datetime, timezone

import httpx
from crewai.tools import tool

from ..settings import settings

_TIMEOUT = 15.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── 1. Registre officiel gouv.fr ────────────────────────────────────────────

def gouv_search_dirigeant(nom: str, prenom: str, code_postal: str | None = None) -> dict:
    params: dict[str, str | int] = {
        "q": f"{prenom} {nom}",
        "est_dirigeant": "true",
        "per_page": 5,
        "page": 1,
    }
    if code_postal:
        params["code_postal"] = code_postal
    r = httpx.get("https://recherche-entreprises.api.gouv.fr/search", params=params, timeout=_TIMEOUT)
    r.raise_for_status()
    results = []
    for e in r.json().get("results", [])[:5]:
        siege = e.get("siege") or {}
        results.append({
            "nom_entreprise": e.get("nom_complet"),
            "siren": e.get("siren"),
            "activite": e.get("libelle_activite_principale") or (e.get("activite_principale")),
            "ville": siege.get("libelle_commune"),
            "code_postal": siege.get("code_postal"),
            "dirigeants": [
                f"{d.get('prenoms', '')} {d.get('nom', '')} — {d.get('qualite', '')}".strip()
                for d in (e.get("dirigeants") or [])[:5]
            ],
            "source_url": f"https://annuaire-entreprises.data.gouv.fr/entreprise/{e.get('siren')}",
            "date_collecte": _now(),
        })
    return {"provider": "gouv", "results": results}


def gouv_search_siren(siren: str) -> dict:
    r = httpx.get(
        "https://recherche-entreprises.api.gouv.fr/search",
        params={"q": siren, "per_page": 1},
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    results = r.json().get("results", [])
    if not results:
        return {"provider": "gouv", "results": []}
    e = results[0]
    siege = e.get("siege") or {}
    return {
        "provider": "gouv",
        "results": [{
            "nom_entreprise": e.get("nom_complet"),
            "siren": e.get("siren"),
            "activite": e.get("libelle_activite_principale") or e.get("activite_principale"),
            "ville": siege.get("libelle_commune"),
            "code_postal": siege.get("code_postal"),
            "dirigeants": [
                f"{d.get('prenoms', '')} {d.get('nom', '')} — {d.get('qualite', '')}".strip()
                for d in (e.get("dirigeants") or [])[:5]
            ],
            "source_url": f"https://annuaire-entreprises.data.gouv.fr/entreprise/{e.get('siren')}",
            "date_collecte": _now(),
        }],
    }


# ─── 2. Exa (index LinkedIn légal) ───────────────────────────────────────────

def exa_search(query: str, num_results: int = 5) -> dict:
    if not settings.exa_api_key:
        return {"provider": "exa", "error": "EXA_API_KEY manquante", "results": []}
    r = httpx.post(
        "https://api.exa.ai/search",
        headers={"x-api-key": settings.exa_api_key, "Content-Type": "application/json"},
        json={
            "query": query,
            "numResults": num_results,
            "type": "auto",
            "contents": {"text": {"maxCharacters": 600}},
        },
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return {
        "provider": "exa",
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "extrait": (item.get("text") or "")[:600],
                "date_publication": item.get("publishedDate"),
                "date_collecte": _now(),
            }
            for item in r.json().get("results", [])
        ],
    }


# ─── 3. Brave Search ─────────────────────────────────────────────────────────

def brave_search(query: str, count: int = 5) -> dict:
    if not settings.brave_api_key:
        return {"provider": "brave", "error": "BRAVE_API_KEY manquante", "results": []}
    r = httpx.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": count, "country": "fr", "search_lang": "fr"},
        headers={"X-Subscription-Token": settings.brave_api_key, "Accept": "application/json"},
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    web = r.json().get("web", {}).get("results", [])
    return {
        "provider": "brave",
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "extrait": item.get("description"),
                "date_collecte": _now(),
            }
            for item in web[:count]
        ],
    }


# ─── Wrappers CrewAI ─────────────────────────────────────────────────────────

@tool("registre_entreprises_gouv")
def registre_entreprises_gouv(nom: str, prenom: str, code_postal: str = "") -> str:
    """Cherche une personne comme dirigeant d'entreprise dans le registre officiel
    français (recherche-entreprises.api.gouv.fr). Source déterministe et fiable.
    Fournir nom et prénom, et si possible le code postal pour filtrer."""
    try:
        return json.dumps(gouv_search_dirigeant(nom, prenom, code_postal or None), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"provider": "gouv", "error": str(e), "results": []})


@tool("registre_entreprises_siren")
def registre_entreprises_siren(siren: str) -> str:
    """Récupère la fiche officielle d'une entreprise française par son numéro SIREN
    (9 chiffres) depuis le registre gouvernemental. À utiliser en priorité si le
    SIREN du contact est connu."""
    try:
        return json.dumps(gouv_search_siren(siren), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"provider": "gouv", "error": str(e), "results": []})


@tool("recherche_web_exa")
def recherche_web_exa(query: str) -> str:
    """Recherche web via l'index Exa (couvre notamment les profils LinkedIn publics,
    accessibles légalement par API). Utile pour trouver le profil professionnel,
    le poste actuel et l'entreprise d'une personne. Exemple de requête :
    'Jean Dupont directeur Paris LinkedIn'."""
    try:
        return json.dumps(exa_search(query), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"provider": "exa", "error": str(e), "results": []})


@tool("recherche_web_brave")
def recherche_web_brave(query: str) -> str:
    """Recherche web générale via Brave Search (presse professionnelle, sites
    d'entreprise, annuaires publics). Complémentaire à Exa pour vérifier ou
    recouper une information."""
    try:
        return json.dumps(brave_search(query), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"provider": "brave", "error": str(e), "results": []})
