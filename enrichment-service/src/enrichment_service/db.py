"""Accès Supabase : lecture des signaux contact, écriture de l'enrichissement."""
from datetime import datetime, timezone

from supabase import Client, create_client

from .schemas import ContactContext, EnrichmentOutput, review_status_for
from .settings import settings

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


def load_contact(contact_id: int) -> ContactContext | None:
    res = (
        get_client()
        .table("contacts")
        .select("id, prenom, nom, ville, code_postal, societe, siren, siret, code_naf, activite, site_web, date_naissance")
        .eq("id", contact_id)
        .maybe_single()
        .execute()
    )
    row = res.data if res else None
    if not row:
        return None
    return ContactContext(
        contact_id=row["id"],
        prenom=row.get("prenom") or "",
        nom=row.get("nom") or "",
        ville=row.get("ville"),
        code_postal=row.get("code_postal"),
        societe=row.get("societe"),
        siren=row.get("siren"),
        siret=row.get("siret"),
        code_naf=row.get("code_naf"),
        activite=row.get("activite"),
        site_web=row.get("site_web"),
        date_naissance=row.get("date_naissance"),
    )


def save_enrichment(contact_id: int, result: EnrichmentOutput) -> str:
    review_status = review_status_for(result.confidence_score)
    get_client().table("contact_enrichment").upsert(
        {
            "contact_id": contact_id,
            "company": result.company,
            "job_title": result.job_title,
            "school": result.school,
            "industry": result.industry,
            "professional_location": result.professional_location,
            "public_profile_url": result.public_profile_url,
            "company_website": result.company_website,
            "confidence_score": result.confidence_score,
            "status": result.status,
            "ai_summary": result.ai_summary,
            "sources": [s.model_dump() for s in result.sources],
            "review_status": review_status,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="contact_id",
    ).execute()
    return review_status


def set_review_status(contact_id: int, review_status: str) -> None:
    get_client().table("contact_enrichment").update({"review_status": review_status}).eq(
        "contact_id", contact_id
    ).execute()
