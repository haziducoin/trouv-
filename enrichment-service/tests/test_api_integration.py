"""Test d'intégration : flow complet sur une fiche mockée (crew stubé, DB stubée)."""
from unittest.mock import patch

from fastapi.testclient import TestClient

from enrichment_service.main import app
from enrichment_service.schemas import ContactContext, EnrichmentOutput, EnrichmentSource, review_status_for

client = TestClient(app)

FAKE_CONTACT = ContactContext(contact_id=42, prenom="Jean", nom="Dupont", ville="Paris", code_postal="75008")

FAKE_RESULT = EnrichmentOutput(
    company="Cabinet Dupont",
    job_title="Gérant",
    confidence_score=68,
    status="likely",
    ai_summary="Jean Dupont dirige le Cabinet Dupont à Paris.",
    sources=[EnrichmentSource(url="https://annuaire-entreprises.data.gouv.fr/entreprise/123456789", source_type="gouv", confidence=90)],
)


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_enrich_requires_secret():
    assert client.post("/enrich/42").status_code == 401
    assert client.post("/enrich/42", headers={"X-Enrich-Secret": "wrong"}).status_code == 401


def test_enrich_404_when_contact_missing():
    with patch("enrichment_service.main.db.load_contact", return_value=None):
        r = client.post("/enrich/42", headers={"X-Enrich-Secret": "test-secret"})
    assert r.status_code == 404


def test_enrich_full_flow_sse():
    """Fiche mockée → le stream SSE doit contenir start puis result avec review_status."""
    saved: dict = {}

    def fake_save(contact_id: int, result: EnrichmentOutput) -> str:
        saved["contact_id"] = contact_id
        saved["result"] = result
        return review_status_for(result.confidence_score)

    with (
        patch("enrichment_service.main.db.load_contact", return_value=FAKE_CONTACT),
        patch("enrichment_service.main.db.save_enrichment", side_effect=fake_save),
        patch("enrichment_service.main.run_enrichment", return_value=FAKE_RESULT),
    ):
        with client.stream("POST", "/enrich/42", headers={"X-Enrich-Secret": "test-secret"}) as r:
            assert r.status_code == 200
            body = "".join(chunk for chunk in r.iter_text())

    assert "event: start" in body
    assert "event: result" in body
    assert '"review_status": "pending_review"' in body  # 68 → validation humaine
    assert '"company": "Cabinet Dupont"' in body
    assert saved["contact_id"] == 42


def test_review_endpoint():
    with patch("enrichment_service.main.db.set_review_status") as mock_set:
        r = client.post("/review/42", json={"decision": "approve"}, headers={"X-Enrich-Secret": "test-secret"})
    assert r.status_code == 200
    assert r.json()["review_status"] == "approved"
    mock_set.assert_called_once_with(42, "approved")


def test_review_rejects_bad_decision():
    r = client.post("/review/42", json={"decision": "peut-etre"}, headers={"X-Enrich-Secret": "test-secret"})
    assert r.status_code == 422


def test_review_status_thresholds():
    assert review_status_for(80) == "auto"
    assert review_status_for(75) == "auto"
    assert review_status_for(74) == "pending_review"
    assert review_status_for(40) == "pending_review"
    assert review_status_for(39) == "rejected"
