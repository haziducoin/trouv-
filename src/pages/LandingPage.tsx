import { useState } from 'react'
import { 
  Search, 
  Shield, 
  Database, 
  Globe, 
  Users, 
  ArrowRight, 
  TriangleAlert,
  Send,
  Mail,
  Lock
} from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { blink } from '@/blink/client'
import { useAuth } from '@/hooks/useAuth'

const STATS = [
  { icon: Database, value: '5.8B+', label: 'Enregistrements' },
  { icon: Globe, value: '25+', label: 'Critères' },
  { icon: Users, value: '150k+', label: 'Utilisateurs' },
  { icon: Shield, value: '99.9%', label: 'Précision' },
]

const SEARCH_FIELDS = [
  { id: 'nom', label: 'Nom', placeholder: '...', icon: '👤' },
  { id: 'prenom', label: 'Prénom', placeholder: '...', icon: '✏️' },
  { id: 'email', label: 'Email', placeholder: '...', icon: '✉️' },
  { id: 'phone', label: 'Téléphone', placeholder: '...', icon: '📞' },
  { id: 'adresse', label: 'Adresse', placeholder: '...', icon: '🏠' },
  { id: 'ville', label: 'Ville', placeholder: '...', icon: '🏙️' },
  { id: 'zip', label: 'Code postal', placeholder: '...', icon: '📮' },
  { id: 'ip', label: 'Adresse IP', placeholder: '...', icon: '🌐' },
  { id: 'password', label: 'Mot de passe', placeholder: '...', icon: '🔑' },
  { id: 'dob', label: 'Date de naissance', placeholder: '...', icon: '🎂' },
  { id: 'username', label: 'Pseudo', placeholder: '...', icon: '👤' },
  { id: 'country', label: 'Pays', placeholder: '...', icon: '🏳️' },
  { id: 'link', label: 'Lien profil', placeholder: '...', icon: '🔗' },
]

export default function LandingPage() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'multi' | 'omni'>('multi')

  const handleStartAnalysis = () => {
    if (!user) {
      blink.auth.login(window.location.href)
      return
    }
    navigate({ to: '/search' })
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30 selection:text-primary-foreground">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
              <Search className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">z<span className="text-primary">Searcher</span></span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Rechercher</Link>
            <Link to="/" className="hover:text-foreground transition-colors">Tarifs</Link>
            <Link to="/" className="hover:text-foreground transition-colors">OSINT</Link>
            <Link to="/" className="hover:text-foreground transition-colors">API</Link>
          </div>

          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="w-20 h-9 rounded-full bg-secondary animate-pulse" />
            ) : user ? (
              <button 
                onClick={() => navigate({ to: '/search' })}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-full text-sm font-medium shadow-lg shadow-primary/20 transition-all"
              >
                Dashboard
              </button>
            ) : (
              <button 
                onClick={() => blink.auth.login()}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-full text-sm font-medium shadow-lg shadow-primary/20 transition-all"
              >
                Connexion
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <div className="pt-32 pb-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
                <Shield className="w-4 h-4" />
                <span>+5,8 milliards d'enregistrements indexés</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
                Explorez l'<span className="text-primary italic">invisible</span>.
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
                Interrogez la plus grande archive de fuites publiques via plus de 25 critères de recherche ultra-précis. 
                Protégez votre identité en sachant ce que les autres savent.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={handleStartAnalysis}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 h-14 text-lg font-bold shadow-xl shadow-primary/30 flex items-center gap-2 transition-all hover:scale-105"
                >
                  Commencer une recherche
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button className="border border-white/10 bg-white/5 hover:bg-white/10 rounded-full px-8 h-14 text-lg font-medium transition-colors">
                  Voir les tarifs
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto mb-24">
              {STATS.map((stat) => (
                <div key={stat.label} className="p-6 rounded-2xl bg-card border border-border/50 text-center hover:border-primary/30 transition-all hover:translate-y-[-4px]">
                  <stat.icon className="mx-auto mb-4 text-primary w-6 h-6" />
                  <div className="text-2xl font-bold mb-1">{stat.value}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Search Tool UI */}
            <div className="max-w-6xl mx-auto">
              <div className="bg-card border border-border rounded-[2rem] overflow-hidden shadow-2xl">
                <div className="flex border-b border-border">
                  <button 
                    onClick={() => setActiveTab('multi')}
                    className={`flex-1 py-6 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'multi' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'hover:bg-white/5 text-muted-foreground'}`}
                  >
                    Recherche Multi-critères
                  </button>
                  <button 
                    onClick={() => setActiveTab('omni')}
                    className={`flex-1 py-6 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'omni' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'hover:bg-white/5 text-muted-foreground'}`}
                  >
                    Omni-search
                  </button>
                </div>
                
                <div className="p-8 md:p-12">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activeTab === 'multi' ? (
                      SEARCH_FIELDS.map((field) => (
                        <div key={field.id} className="search-grid-item group">
                          <label className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                            <span>{field.icon}</span>
                            {field.label}
                          </label>
                          <input 
                            type="text" 
                            placeholder={field.placeholder}
                            className="bg-transparent border-none focus:ring-0 p-0 text-lg h-8 placeholder:text-muted-foreground/30 w-full"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full search-grid-item">
                        <label className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                          <span>🔍</span>
                          Omni-search
                        </label>
                        <input 
                          type="text" 
                          placeholder="Entrez n'importe quelle donnée (nom, email, hash, IP...)"
                          className="bg-transparent border-none focus:ring-0 p-0 text-xl h-12 placeholder:text-muted-foreground/30 w-full"
                        />
                      </div>
                    )}
                    <div className="lg:col-span-1 flex items-end">
                      <button 
                        onClick={handleStartAnalysis}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 w-full h-14 rounded-xl shadow-lg shadow-primary/20 text-lg font-bold transition-all hover:scale-105"
                      >
                        Lancer l'analyse
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ethical Warning */}
            <div className="mt-24 max-w-4xl mx-auto p-8 rounded-3xl bg-destructive/5 border border-destructive/20 flex flex-col md:flex-row items-center gap-8">
              <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                <TriangleAlert className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Utilisation Éthique</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ce service est destiné à des fins de sensibilisation et de protection des données personnelles. 
                  Toute utilisation malveillante ou illégale est strictement interdite. 
                  En utilisant zSearcher, vous vous engagez à respecter les lois en vigueur.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/30 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-1">
              <Link to="/" className="flex items-center gap-2 mb-6">
                <span className="text-xl font-bold tracking-tight">z<span className="text-primary">Searcher</span></span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Explorez l'invisible. La plus grande archive de fuites publiques à votre portée. 
                Interrogez des milliards de données avec précision.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-6">Produit</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><Link to="/" className="hover:text-primary transition-colors">Recherche</Link></li>
                <li><Link to="/" className="hover:text-primary transition-colors">Tarifs</Link></li>
                <li><Link to="/" className="hover:text-primary transition-colors">Statistiques</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-6">Légal</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><Link to="/" className="hover:text-primary transition-colors">CGU</Link></li>
                <li><Link to="/" className="hover:text-primary transition-colors">Vie privée</Link></li>
                <li><Link to="/" className="hover:text-primary transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-6">Communauté</h4>
              <div className="flex gap-4">
                <Link to="/" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <Send className="w-5 h-5" />
                </Link>
                <Link to="/" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <Globe className="w-5 h-5" />
                </Link>
                <Link to="/" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <Mail className="w-5 h-5" />
                </Link>
              </div>
              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="text-primary w-3.5 h-3.5" />
                <span>Certifié Sécurisé</span>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-border/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
            <p>© 2026 zSearcher Clone. Tous droits réservés.</p>
            <p>Fait avec passion pour la sécurité des données.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
