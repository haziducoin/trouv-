"""Tests unitaires des tools de recherche — HTTP mocké avec respx."""
import json

import respx
from httpx import Response

from enrichment_service.tools.search_tools import (
    brave_search,
    exa_search,
    gouv_search_dirigeant,
    gouv_search_siren,
    recherche_web_exa,
)


@respx.mock
def test_gouv_search_dirigeant():
    respx.get("https://recherche-entreprises.api.gouv.fr/search").mock(
        return_value=Response(200, json={
            "results": [{
                "nom_complet": "CABINET DUPONT",
                "siren": "123456789",
                "libelle_activite_principale": "Conseil",
                "siege": {"libelle_commune": "PARIS", "code_postal": "75008"},
                "dirigeants": [{"prenoms": "Jean", "nom": "Dupont", "qualite": "Gérant"}],
            }]
        })
    )
    out = gouv_search_dirigeant("Dupont", "Jean", "75008")
    assert out["provider"] == "gouv"
    assert out["results"][0]["siren"] == "123456789"
    assert "Jean Dupont" in out["results"][0]["dirigeants"][0]
    assert out["results"][0]["source_url"].endswith("123456789")
    assert out["results"][0]["date_collecte"]  # traçabilité RGPD


@respx.mock
def test_gouv_search_siren_empty():
    respx.get("https://recherche-entreprises.api.gouv.fr/search").mock(
        return_value=Response(200, json={"results": []})
    )
    assert gouv_search_siren("999999999")["results"] == []


@respx.mock
def test_exa_search():
    respx.post("https://api.exa.ai/search").mock(
        return_value=Response(200, json={
            "results": [{"title": "Jean Dupont — Directeur", "url": "https://linkedin.com/in/jdupont",
                         "text": "Directeur chez Cabinet Dupont", "publishedDate": "2026-01-15"}]
        })
    )
    out = exa_search("Jean Dupont directeur Paris")
    assert out["results"][0]["url"] == "https://linkedin.com/in/jdupont"
    assert out["results"][0]["date_collecte"]


@respx.mock
def test_brave_search():
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=Response(200, json={
            "web": {"results": [{"title": "Cabinet Dupont", "url": "https://cabinet-dupont.fr",
                                 "description": "Site officiel"}]}
        })
    )
    out = brave_search("Cabinet Dupont Paris")
    assert out["results"][0]["url"] == "https://cabinet-dupont.fr"


@respx.mock
def test_crewai_tool_wrapper_returns_json_on_error():
    """Le wrapper CrewAI ne doit jamais lever : une erreur devient un JSON exploitable."""
    respx.post("https://api.exa.ai/search").mock(return_value=Response(500))
    raw = recherche_web_exa.run(query="test")
    parsed = json.loads(raw)
    assert parsed["provider"] == "exa"
    assert parsed["results"] == []
    assert "error" in parsed
