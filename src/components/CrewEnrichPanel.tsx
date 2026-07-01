// ─── Panel "Enrichissement approfondi" (CrewAI) — fiche contact ──────────────
// États : idle → running (progression temps réel) → done (badges de confiance,
// Valider/Rejeter si confiance moyenne) | error.

import { useEffect, useRef, useState } from 'react'
import {
  Sparkles, Building2, Briefcase, GraduationCap, Hash, MapPin, Link2, Globe,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ExternalLink,
} from 'lucide-react'
import {
  streamCrewEnrichment, reviewCrewEnrichment,
  type CrewEnrichResult,
} from '@/lib/crewEnrichApi'

type Phase = 'idle' | 'running' | 'done' | 'error'

const STATUS_LABELS: Record<CrewEnrichResult['status'], string> = {
  confirmed:         'Identité confirmée',
  likely:            'Identité probable',
  uncertain:         'Identité incertaine',
  possible_homonym:  'Homonyme possible',
  insufficient_data: 'Données insuffisantes',
}

function ConfidenceBadge({ score }: { score: number }) {
  const tone =
    score >= 75 ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : score >= 40 ? 'bg-amber-50 text-amber-600 border-amber-200'
    : 'bg-red-50 text-red-500 border-red-200'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      {score}% de confiance
    </span>
  )
}

function ResultRow({ icon: Icon, label, value, href }: {
  icon: React.ElementType; label: string; value: string; href?: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2.5 shrink-0">
        <Icon size={13} className="text-gray-300" />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-[#1B54FF] font-medium truncate max-w-[170px] hover:underline">
          {value} <ExternalLink size={10} />
        </a>
      ) : (
        <span className="text-xs text-gray-700 font-medium text-right truncate max-w-[190px]">{value}</span>
      )}
    </div>
  )
}

export function CrewEnrichPanel({ contactId }: { contactId: string | number }) {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [stages, setStages]     = useState<string[]>([])
  const [stepCount, setSteps]   = useState(0)
  const [result, setResult]     = useState<CrewEnrichResult | null>(null)
  const [error, setError]       = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const launch = () => {
    setPhase('running'); setSteps(0); setError(''); setResult(null)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    streamCrewEnrichment(contactId, {
      onStart: s => setStages(s),
      onStep:  () => setSteps(n => n + 1),
      onResult: r => { setResult(r); setPhase('done') },
      onError:  m => { setError(m); setPhase('error') },
    }, ctrl.signal).catch(e => {
      if (e?.name !== 'AbortError') { setError(e.message ?? 'Erreur réseau'); setPhase('error') }
    })
  }

  const review = async (decision: 'approve' | 'reject') => {
    if (!result) return
    setReviewBusy(true)
    try {
      await reviewCrewEnrichment(contactId, decision)
      setResult({ ...result, review_status: decision === 'approve' ? 'approved' : 'rejected' })
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la validation')
    } finally {
      setReviewBusy(false)
    }
  }

  // Étape courante estimée : ~1 étape d'agent sur 4, bornée par le nombre de ticks
  const stageIdx = Math.min(Math.floor(stepCount / 2), Math.max(0, stages.length - 1))

  const hasData = result && (result.company || result.job_title || result.industry
    || result.professional_location || result.public_profile_url || result.company_website || result.school)

  return (
    <section className="px-5 py-4 pb-6">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Enrichissement approfondi</p>
        <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
          <Sparkles size={9} /> Agents IA
        </span>
      </div>

      {phase === 'idle' && (
        <button onClick={launch}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">
          <Sparkles size={13} /> Lancer la recherche approfondie
        </button>
      )}

      {phase === 'running' && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Loader2 size={16} className="animate-spin text-violet-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-violet-700">
                {stages[stageIdx] ?? 'Analyse en cours…'}
              </p>
              <p className="mt-0.5 text-[11px] text-violet-400">Registre officiel, Exa, Brave Search…</p>
            </div>
          </div>
          {stages.length > 0 && (
            <div className="mt-3 flex gap-1">
              {stages.map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= stageIdx ? 'bg-violet-400' : 'bg-violet-100'}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-600">{error || 'Une erreur est survenue.'}</p>
          </div>
          <button onClick={launch} className="mt-2 text-[11px] font-medium text-red-500 hover:underline">
            Réessayer
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-3">
          {/* En-tête verdict */}
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge score={result.confidence_score} />
            <span className="text-[11px] text-gray-500">{STATUS_LABELS[result.status]}</span>
            {result.review_status === 'approved' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><CheckCircle2 size={11} /> Validé</span>
            )}
            {result.review_status === 'rejected' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500"><XCircle size={11} /> Rejeté</span>
            )}
          </div>

          {/* Données (masquées si rejeté) */}
          {hasData && result.review_status !== 'rejected' ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
              {result.company               && <ResultRow icon={Building2}     label="Entreprise" value={result.company} />}
              {result.job_title             && <ResultRow icon={Briefcase}     label="Poste" value={result.job_title} />}
              {result.industry              && <ResultRow icon={Hash}          label="Secteur" value={result.industry} />}
              {result.school                && <ResultRow icon={GraduationCap} label="Formation" value={result.school} />}
              {result.professional_location && <ResultRow icon={MapPin}        label="Zone pro" value={result.professional_location} />}
              {result.public_profile_url    && <ResultRow icon={Link2}         label="Profil public" value="Voir le profil" href={result.public_profile_url} />}
              {result.company_website       && <ResultRow icon={Globe}         label="Site entreprise" value={result.company_website.replace(/^https?:\/\//, '')} href={result.company_website} />}
              {result.ai_summary && (
                <p className="px-4 py-2.5 text-[11px] leading-relaxed text-gray-400 italic border-t border-gray-100">
                  {result.ai_summary}
                </p>
              )}
            </div>
          ) : result.review_status !== 'rejected' ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5">
              <p className="text-xs text-gray-400">Aucune information fiable trouvée pour ce contact.</p>
            </div>
          ) : null}

          {/* Validation humaine — confiance moyenne */}
          {result.review_status === 'pending_review' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[11px] text-amber-700 font-medium mb-2.5">
                Confiance moyenne — vérifiez ces informations avant de les conserver.
              </p>
              <div className="flex gap-2">
                <button onClick={() => review('approve')} disabled={reviewBusy}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle2 size={12} /> Valider
                </button>
                <button onClick={() => review('reject')} disabled={reviewBusy}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-[11px] font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-50">
                  <XCircle size={12} /> Rejeter
                </button>
              </div>
            </div>
          )}

          {/* Sources (traçabilité RGPD) */}
          {result.sources.length > 0 && result.review_status !== 'rejected' && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-medium text-gray-400 hover:text-gray-600 select-none">
                {result.sources.length} source{result.sources.length > 1 ? 's' : ''} — voir la traçabilité
              </summary>
              <ul className="mt-1.5 space-y-1">
                {result.sources.filter(s => s.url).map((s, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="rounded bg-gray-100 px-1 py-0.5 font-mono">{s.source_type}</span>
                    <a href={s.url!} target="_blank" rel="noopener noreferrer" className="truncate max-w-[240px] text-[#1B54FF] hover:underline">
                      {s.url}
                    </a>
                    <span className="shrink-0">· {new Date(s.date_collecte).toLocaleDateString('fr-FR')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
