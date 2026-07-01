"""API du microservice d'enrichissement CrewAI.

POST /enrich/{contact_id}  — lance le crew, streame la progression en SSE,
                             écrit le résultat dans contact_enrichment.
POST /review/{contact_id}  — validation humaine (approve / reject).
GET  /health               — liveness.

Auth : header X-Enrich-Secret partagé avec le proxy Vercel (le service n'est
jamais appelé directement par le navigateur).
"""
import json
import queue
import threading

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from . import db
from .crew import run_enrichment
from .settings import settings

app = FastAPI(title="trouve-enrichment-service")

STAGES = [
    ("identifier", "Identification de la personne"),
    ("researcher", "Recherche web professionnelle"),
    ("fact_checker", "Vérification des sources"),
    ("writer", "Rédaction de la fiche"),
]


def _check_secret(secret: str | None) -> None:
    if not secret or secret != settings.enrich_service_secret:
        raise HTTPException(status_code=401, detail="Non autorisé")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/enrich/{contact_id}")
async def enrich(contact_id: int, x_enrich_secret: str | None = Header(default=None)):
    _check_secret(x_enrich_secret)

    ctx = db.load_contact(contact_id)
    if ctx is None:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if not ctx.nom.strip() and not ctx.prenom.strip():
        raise HTTPException(status_code=422, detail="Contact sans nom ni prénom : enrichissement impossible")

    events: queue.Queue = queue.Queue()

    def step_callback(step) -> None:
        # Chaque action d'agent = un tick de progression (outil appelé, réflexion…)
        tool = getattr(step, "tool", None)
        events.put({"event": "step", "data": {"tool": str(tool) if tool else None}})

    def worker() -> None:
        try:
            result = run_enrichment(ctx, step_callback=step_callback)
            review_status = db.save_enrichment(contact_id, result)
            events.put({
                "event": "result",
                "data": {
                    "contact_id": contact_id,
                    "review_status": review_status,
                    **result.model_dump(),
                },
            })
        except Exception as e:  # noqa: BLE001 — toute erreur doit arriver au client proprement
            events.put({"event": "error", "data": {"message": str(e)[:500]}})
        finally:
            events.put(None)  # sentinelle de fin

    threading.Thread(target=worker, daemon=True).start()

    async def stream():
        import anyio

        yield {"event": "start", "data": json.dumps({"contact_id": contact_id, "stages": [s[1] for s in STAGES]})}
        while True:
            try:
                item = events.get_nowait()
            except queue.Empty:
                await anyio.sleep(0.25)
                yield {"event": "ping", "data": ""}
                continue
            if item is None:
                break
            yield {"event": item["event"], "data": json.dumps(item["data"], ensure_ascii=False)}

    return EventSourceResponse(stream())


class ReviewBody(BaseModel):
    decision: str  # "approve" | "reject"


@app.post("/review/{contact_id}")
def review(contact_id: int, body: ReviewBody, x_enrich_secret: str | None = Header(default=None)):
    _check_secret(x_enrich_secret)
    if body.decision not in ("approve", "reject"):
        raise HTTPException(status_code=422, detail="decision doit être approve ou reject")
    db.set_review_status(contact_id, "approved" if body.decision == "approve" else "rejected")
    return {"ok": True, "contact_id": contact_id, "review_status": "approved" if body.decision == "approve" else "rejected"}
