"""Schémas Pydantic alignés sur la table contact_enrichment existante."""
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class EnrichmentSource(BaseModel):
    """Traçabilité RGPD : chaque donnée doit être sourcée et datée."""
    url: str | None = None
    source_type: str = "other"  # gouv | exa | brave | other
    confidence: int = Field(default=50, ge=0, le=100)
    date_collecte: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class EnrichmentOutput(BaseModel):
    """Sortie finale du crew — mappée 1:1 sur contact_enrichment."""
    company: str | None = None
    job_title: str | None = None
    school: str | None = None
    industry: str | None = None
    professional_location: str | None = None
    public_profile_url: str | None = None
    company_website: str | None = None
    confidence_score: int = Field(default=50, ge=0, le=100)
    status: Literal["confirmed", "likely", "uncertain", "possible_homonym", "insufficient_data"] = "uncertain"
    ai_summary: str = ""
    sources: list[EnrichmentSource] = Field(default_factory=list)


def review_status_for(score: int) -> str:
    """Règle de confiance : ≥75 écrit direct, 40–74 validation humaine, <40 non affiché."""
    if score >= 75:
        return "auto"
    if score >= 40:
        return "pending_review"
    return "rejected"


class ContactContext(BaseModel):
    """Signaux du contact lus en DB — utilisés côté serveur uniquement (RGPD)."""
    contact_id: int
    prenom: str = ""
    nom: str = ""
    ville: str | None = None
    code_postal: str | None = None
    societe: str | None = None
    siren: str | None = None
    siret: str | None = None
    code_naf: str | None = None
    activite: str | None = None
    site_web: str | None = None
    date_naissance: str | None = None
