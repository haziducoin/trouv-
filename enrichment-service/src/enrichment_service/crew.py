"""Crew d'enrichissement : Identifier → Web Researcher → Fact Checker → Writer.

LLM : modèle open-weights (Llama 3.3 70B) servi gratuitement par Groq.
"""
from crewai import Agent, Crew, LLM, Process, Task

from .schemas import ContactContext, EnrichmentOutput
from .settings import settings
from .tools.search_tools import (
    recherche_web_brave,
    recherche_web_exa,
    registre_entreprises_gouv,
    registre_entreprises_siren,
)


def _llm() -> LLM:
    return LLM(model=settings.groq_model, api_key=settings.groq_api_key, temperature=0.1)


def _contact_brief(ctx: ContactContext) -> str:
    """Signaux transmis aux agents — la date de naissance sert uniquement à
    désambiguïser, elle ne doit jamais apparaître dans la sortie (RGPD)."""
    lines = [f"Prénom : {ctx.prenom}", f"Nom : {ctx.nom}"]
    if ctx.ville:
        lines.append(f"Ville : {ctx.ville}")
    if ctx.code_postal:
        lines.append(f"Code postal : {ctx.code_postal}")
    if ctx.societe:
        lines.append(f"Société connue : {ctx.societe}")
    if ctx.siren:
        lines.append(f"SIREN : {ctx.siren}")
    if ctx.code_naf:
        lines.append(f"Code NAF : {ctx.code_naf}")
    if ctx.activite:
        lines.append(f"Activité : {ctx.activite}")
    if ctx.site_web:
        lines.append(f"Site web : {ctx.site_web}")
    if ctx.date_naissance:
        lines.append(f"Année de naissance (signal privé, ne jamais restituer) : {str(ctx.date_naissance)[:4]}")
    return "\n".join(lines)


def build_crew(ctx: ContactContext, step_callback=None) -> Crew:
    llm = _llm()
    brief = _contact_brief(ctx)

    identifier = Agent(
        role="Identificateur d'identité",
        goal="Établir avec certitude quelle personne réelle correspond au contact, en écartant les homonymes.",
        backstory=(
            "Expert en désambiguïsation d'identités françaises. Tu croises registre "
            "officiel des entreprises, ville et secteur d'activité pour distinguer les homonymes. "
            "Tu commences TOUJOURS par le registre gouvernemental (fiable et déterministe), "
            "par SIREN si disponible, sinon par nom+prénom de dirigeant."
        ),
        tools=[registre_entreprises_siren, registre_entreprises_gouv],
        llm=llm,
        max_iter=4,
        verbose=False,
    )

    researcher = Agent(
        role="Chercheur web professionnel",
        goal="Trouver les informations professionnelles publiques et à jour sur la personne identifiée.",
        backstory=(
            "Spécialiste OSINT strictement limité aux sources légales : index Exa "
            "(profils LinkedIn publics via API) et Brave Search (presse pro, sites d'entreprise). "
            "Tu cherches : entreprise actuelle, poste actuel, URL de profil public, site de "
            "l'entreprise, secteur, localisation professionnelle, formation. "
            "Tu notes l'URL exacte de chaque information trouvée."
        ),
        tools=[recherche_web_exa, recherche_web_brave],
        llm=llm,
        max_iter=5,
        verbose=False,
    )

    fact_checker = Agent(
        role="Vérificateur de faits",
        goal="Vérifier la cohérence entre les sources et attribuer un score de confiance honnête.",
        backstory=(
            "Auditeur sceptique. Tu confrontes chaque affirmation aux données de départ du contact "
            "(ville, société, secteur). Une incohérence de ville ou d'entreprise fait chuter le score. "
            "Barème : 85-100 = confirmé par registre officiel + source web concordante ; "
            "60-84 = probable (sources concordantes sans registre) ; 40-59 = incertain ; "
            "20-39 = homonyme possible ; 0-19 = données insuffisantes. "
            "Tu peux relancer une recherche de vérification si un point est douteux."
        ),
        tools=[recherche_web_brave],
        llm=llm,
        max_iter=3,
        verbose=False,
    )

    writer = Agent(
        role="Rédacteur de fiche",
        goal="Produire l'enrichissement final structuré, sourcé et en français.",
        backstory=(
            "Tu synthétises les conclusions validées en une fiche propre. Tu ne gardes que les "
            "informations vérifiées, chacune avec sa source (URL + date de collecte). "
            "Tu n'inventes JAMAIS : un champ sans source fiable reste null."
        ),
        llm=llm,
        max_iter=2,
        verbose=False,
    )

    identify_task = Task(
        description=(
            f"Identifie la personne correspondant à ce contact :\n{brief}\n\n"
            "Utilise le registre officiel (SIREN en priorité s'il est fourni, sinon recherche "
            "dirigeant par nom+prénom+code postal). Liste les candidats trouvés et conclus : "
            "quelle entreprise et quel rôle sont rattachés à cette personne, ou signale un risque "
            "d'homonymie / une absence de résultat."
        ),
        expected_output=(
            "Synthèse d'identification : entreprise(s) rattachée(s) avec SIREN, rôle de la personne, "
            "URLs sources gouv, niveau de certitude et signaux d'homonymie éventuels."
        ),
        agent=identifier,
    )

    research_task = Task(
        description=(
            f"À partir de l'identification précédente, enrichis le profil professionnel de "
            f"{ctx.prenom} {ctx.nom}" + (f" ({ctx.ville})" if ctx.ville else "") + ". "
            "Cherche : entreprise actuelle, poste actuel, URL de profil professionnel public, "
            "site web de l'entreprise, secteur d'activité, localisation professionnelle, formation, "
            "actualités récentes (changement de poste, publication). 2 à 4 requêtes maximum, "
            "en variant Exa et Brave. Note l'URL exacte de chaque info."
        ),
        expected_output=(
            "Liste des informations trouvées, chacune au format : donnée — URL source — date de "
            "publication si connue. Mentionner explicitement ce qui n'a pas été trouvé."
        ),
        agent=researcher,
        context=[identify_task],
    )

    factcheck_task = Task(
        description=(
            "Confronte les trouvailles de la recherche web aux données de départ du contact :\n"
            f"{brief}\n\n"
            "Vérifie la cohérence (ville, entreprise, secteur, âge plausible). Attribue le score "
            "de confiance selon ton barème et le statut : confirmed / likely / uncertain / "
            "possible_homonym / insufficient_data. Justifie chaque rejet."
        ),
        expected_output=(
            "Verdict : score 0-100, statut, liste des informations VALIDÉES (avec source) et liste "
            "des informations REJETÉES (avec raison)."
        ),
        agent=fact_checker,
        context=[identify_task, research_task],
    )

    write_task = Task(
        description=(
            "Rédige l'enrichissement final à partir des seules informations VALIDÉES par le "
            "vérificateur. ai_summary : 2-3 phrases en français résumant le profil professionnel. "
            "Chaque source : url, source_type (gouv/exa/brave), confidence, date_collecte ISO. "
            "Les champs sans information validée restent null. Ne restitue jamais la date de "
            "naissance ni aucune donnée personnelle non professionnelle."
        ),
        expected_output="Objet JSON conforme au schéma EnrichmentOutput.",
        agent=writer,
        context=[identify_task, research_task, factcheck_task],
        output_pydantic=EnrichmentOutput,
    )

    return Crew(
        agents=[identifier, researcher, fact_checker, writer],
        tasks=[identify_task, research_task, factcheck_task, write_task],
        process=Process.sequential,
        step_callback=step_callback,
        verbose=False,
    )


def run_enrichment(ctx: ContactContext, step_callback=None) -> EnrichmentOutput:
    crew = build_crew(ctx, step_callback=step_callback)
    result = crew.kickoff()
    if result.pydantic is not None:
        return result.pydantic
    # Fallback si le modèle n'a pas produit un JSON valide
    return EnrichmentOutput(status="insufficient_data", confidence_score=0,
                            ai_summary="L'enrichissement n'a pas produit de résultat exploitable.")
