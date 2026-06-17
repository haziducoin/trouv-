import {
  AlertTriangle,
  Ban,
  BookOpen,
  Building2,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  Mail,
  Scale,
  Shield,
  ShieldCheck,
  UserX,
} from 'lucide-react'
import trouveLogo from '@/assets/trouve-logo.png'

interface Props {
  onClose?: () => void
}

interface RuleBlock {
  icon: React.FC<{ size?: number; className?: string }>
  title: string
  text: string
  type: 'allowed' | 'forbidden' | 'obligation'
}

const RULES: RuleBlock[] = [
  {
    icon: Building2,
    title: 'Accès réservé aux professionnels',
    text: 'trouvé! est un service strictement réservé aux professionnels de l\'immobilier et aux entreprises du secteur. Toute utilisation personnelle est interdite.',
    type: 'allowed',
  },
  {
    icon: ShieldCheck,
    title: 'Utilisation professionnelle uniquement',
    text: 'Les données accessibles via trouvé! ne peuvent être utilisées qu\'à des fins de prospection commerciale professionnelle, dans le cadre de votre activité déclarée.',
    type: 'obligation',
  },
  {
    icon: Ban,
    title: 'Interdiction de revente des données',
    text: 'Il est strictement interdit de revendre, céder, louer ou partager les données obtenues via trouvé! à des tiers, à titre onéreux ou gratuit.',
    type: 'forbidden',
  },
  {
    icon: UserX,
    title: 'Interdiction d\'utilisation personnelle',
    text: 'Toute utilisation des données à des fins personnelles — incluant la recherche de personnes dans un cadre privé — est formellement interdite.',
    type: 'forbidden',
  },
  {
    icon: AlertTriangle,
    title: 'Interdiction de harcèlement',
    text: 'L\'utilisation de trouvé! à des fins de harcèlement, démarchage abusif ou contact non sollicité répété est interdite et peut faire l\'objet de poursuites.',
    type: 'forbidden',
  },
  {
    icon: Eye,
    title: 'Interdiction de surveillance de personnes',
    text: 'Il est interdit d\'utiliser trouvé! pour surveiller, tracer ou suivre des individus, que ce soit dans un cadre professionnel ou personnel.',
    type: 'forbidden',
  },
  {
    icon: Scale,
    title: 'Interdiction de profilage illicite',
    text: 'La constitution de profils individuels détaillés, le profilage comportemental ou toute analyse contraire au RGPD sont strictement interdits.',
    type: 'forbidden',
  },
  {
    icon: Lock,
    title: 'Responsabilité de l\'entreprise',
    text: 'L\'entreprise abonnée est entièrement responsable de l\'utilisation faite de trouvé! par ses collaborateurs. Elle s\'engage à ne désigner que des utilisateurs autorisés.',
    type: 'obligation',
  },
  {
    icon: FileText,
    title: 'Respect du RGPD',
    text: 'Tout traitement de données personnelles issues de trouvé! doit être conforme au Règlement Général sur la Protection des Données (RGPD) et à la loi informatique et libertés.',
    type: 'obligation',
  },
]

const typeStyle = {
  allowed:    { border: 'border-emerald-200', bg: 'bg-emerald-50', icon: 'text-emerald-600', badge: 'Autorisé',   badgeCls: 'bg-emerald-100 text-emerald-700' },
  forbidden:  { border: 'border-red-200',     bg: 'bg-red-50',     icon: 'text-red-500',     badge: 'Interdit',   badgeCls: 'bg-red-100 text-red-700' },
  obligation: { border: 'border-[#124bd2]/20',bg: 'bg-[#124bd2]/5',icon: 'text-[#124bd2]',  badge: 'Obligation', badgeCls: 'bg-[#124bd2]/10 text-[#124bd2]' },
}

export default function CompliancePage({ onClose }: Props) {
  return (
    <div className="min-h-screen bg-[#f5f8ff]">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <img src={trouveLogo} alt="trouvé!" className="h-8 w-auto" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#124bd2]/20 bg-[#124bd2]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#124bd2]">
            <Shield size={10} />
            Réservé aux professionnels
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition"
            >
              Fermer
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#124bd2]/10">
            <Scale size={28} className="text-[#124bd2]" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Politique de conformité</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500 leading-relaxed">
            trouvé! est un service B2B de prospection immobilière. Son utilisation est encadrée par des règles strictes
            visant à protéger la vie privée des personnes et à garantir un usage professionnel responsable.
          </p>
          <p className="mt-3 text-sm text-slate-400">Version 1.0 · En vigueur depuis le 1er janvier 2025</p>
        </div>

        {/* Principe fondamental */}
        <div className="mb-8 rounded-2xl border border-[#124bd2]/20 bg-[#124bd2]/5 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#124bd2]/10">
              <ShieldCheck size={20} className="text-[#124bd2]" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Principe fondamental</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                trouvé! collecte et structure des informations professionnelles accessibles légalement.
                Notre mission est de faciliter la prospection immobilière professionnelle.
                <strong className="text-slate-800"> Toute utilisation à des fins autres que professionnelles est prohibée
                et peut entraîner la résiliation immédiate du compte et des poursuites judiciaires.</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Règles */}
        <h2 className="mb-5 text-lg font-bold text-slate-800">Règles d'utilisation</h2>
        <div className="flex flex-col gap-4 mb-12">
          {RULES.map((rule, i) => {
            const s = typeStyle[rule.type]
            const Icon = rule.icon
            return (
              <div key={i} className={`rounded-xl border ${s.border} ${s.bg} p-5`}>
                <div className="flex items-start gap-4">
                  <Icon size={18} className={`mt-0.5 shrink-0 ${s.icon}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800 text-sm">{rule.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.badgeCls}`}>
                        {s.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{rule.text}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Journalisation */}
        <div className="mb-12 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <BookOpen size={20} className="text-slate-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Journalisation complète</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Dans le cadre de notre politique de conformité, toutes les actions effectuées sur trouvé! sont enregistrées :
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {[
                  'Identité de l\'utilisateur et de l\'entreprise',
                  'Date et heure de chaque connexion',
                  'Adresse IP de connexion',
                  'Chaque recherche effectuée',
                  'Chaque donnée débloquée (téléphone, email)',
                  'Chaque crédit consommé',
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <ChevronRight size={13} className="text-[#124bd2]" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                Ces données sont conservées pendant 3 ans et peuvent être communiquées aux autorités compétentes
                sur réquisition judiciaire.
              </p>
            </div>
          </div>
        </div>

        {/* Sanctions */}
        <div className="mb-12 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="flex items-center gap-2 font-bold text-red-800">
            <AlertTriangle size={16} />
            Sanctions en cas de non-respect
          </h2>
          <p className="mt-2 text-sm text-red-700 leading-relaxed">
            Tout manquement aux présentes règles peut entraîner : la suspension immédiate du compte sans
            remboursement, la résiliation définitive du contrat, la communication des données de journalisation
            aux autorités compétentes, et des poursuites civiles et/ou pénales.
          </p>
        </div>

        {/* Contact */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-800 mb-3">Contact conformité</h2>
          <p className="text-sm text-slate-600 mb-4">
            Pour toute question relative à la conformité, à l'exercice de vos droits RGPD
            ou pour signaler une utilisation non conforme :
          </p>
          <a
            href="mailto:conformite@trouve.fr"
            className="inline-flex items-center gap-2 rounded-xl bg-[#124bd2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]"
          >
            <Mail size={14} />
            conformite@trouve.fr
          </a>
        </div>
      </main>
    </div>
  )
}
