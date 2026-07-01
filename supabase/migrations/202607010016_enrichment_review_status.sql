-- Enrichissement CrewAI : statut de validation humaine
-- auto           = confiance ≥ 75, écrit directement dans la fiche
-- pending_review = confiance 40-74, en attente de Valider/Rejeter par l'utilisateur
-- approved       = validé manuellement
-- rejected       = confiance < 40 ou rejeté manuellement (non affiché)

ALTER TABLE public.contact_enrichment
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'auto'
  CHECK (review_status IN ('auto', 'pending_review', 'approved', 'rejected'));

NOTIFY pgrst, 'reload schema';
