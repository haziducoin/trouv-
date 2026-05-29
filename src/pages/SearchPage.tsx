import { useState, useEffect } from 'react'
import { 
  Search, 
  History, 
  Settings, 
  LogOut, 
  User, 
  Shield, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  ArrowLeft,
  Filter,
  Download
} from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { blink } from '@/blink/client'
import { useAuth } from '@/hooks/useAuth'

export default function SearchPage() {
  const { user, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: '/' })
    }
  }, [user, isLoading, navigate])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setIsSearching(true)
    // Simulate API delay
    setTimeout(() => {
      const mockResults = [
        { id: 1, type: 'Email Leak', source: 'Canva 2019', status: 'High Risk', date: '2019-05-24' },
        { id: 2, type: 'Password Hash', source: 'LinkedIn 2016', status: 'Mitigated', date: '2016-06-12' },
        { id: 3, type: 'IP Address', source: 'Unknown Database', status: 'Low Risk', date: '2023-11-02' },
      ]
      setResults(mockResults)
      setIsSearching(false)
      
      // Save to history in DB
      blink.db.searches.create({
        userId: user?.id,
        searchType: 'omni',
        queryParams: JSON.stringify({ query: searchQuery }),
        results: JSON.stringify(mockResults)
      }).catch(console.error)
    }, 1500)
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/40 hidden md:flex flex-col bg-card/30 backdrop-blur-sm">
        <div className="p-6 border-b border-border/40">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Search className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">z<span className="text-primary">Searcher</span></span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-medium text-sm transition-all">
            <Search className="w-4 h-4" />
            Analyseur
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary/50 font-medium text-sm transition-all">
            <History className="w-4 h-4" />
            Historique
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary/50 font-medium text-sm transition-all">
            <Shield className="w-4 h-4" />
            Protection
          </button>
        </nav>

        <div className="p-4 border-t border-border/40">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-secondary/50 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.displayName || user.email}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Premium</p>
            </div>
          </div>
          <button 
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 font-medium text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border/40 flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate({ to: '/' })}
              className="md:hidden p-2 hover:bg-secondary rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold">Analyseur de Données</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-secondary rounded-lg text-muted-foreground">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-4xl mx-auto">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="mb-12">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Entrez un email, un nom, une adresse IP..."
                  className="w-full h-14 pl-12 pr-4 bg-card border border-border/50 rounded-2xl focus:ring-2 focus:ring-primary/20 transition-all outline-none text-lg"
                />
                <button 
                  type="submit"
                  disabled={isSearching}
                  className="absolute right-2 top-2 bottom-2 bg-primary text-primary-foreground px-6 rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {isSearching ? 'Analyse...' : 'Analyser'}
                </button>
              </div>
            </form>

            {/* Results */}
            {isSearching ? (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-card border border-border/50 rounded-2xl" />
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    Résultats de l'analyse
                    <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                      {results.length} trouvés
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary transition-colors">
                      <Filter className="w-3.5 h-3.5" /> Filtrer
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Exporter
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  {results.map((res) => (
                    <div key={res.id} className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                            res.status === 'High Risk' ? 'bg-destructive/10 text-destructive' : 
                            res.status === 'Mitigated' ? 'bg-green-500/10 text-green-500' : 
                            'bg-blue-500/10 text-blue-500'
                          }`}>
                            {res.status === 'High Risk' ? <AlertTriangle /> : <Shield />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold">{res.type}</h3>
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-0.5 rounded-md bg-secondary">
                                {res.source}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">Une occurrence a été détectée dans une base de données publique.</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-bold mb-1 ${
                            res.status === 'High Risk' ? 'text-destructive' : 
                            res.status === 'Mitigated' ? 'text-green-500' : 
                            'text-blue-500'
                          }`}>
                            {res.status}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3" />
                            {res.date}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : searchQuery && !isSearching ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">Aucune menace détectée</h3>
                <p className="text-muted-foreground">Vos données semblent être en sécurité pour cette recherche.</p>
              </div>
            ) : (
              <div className="text-center py-20 border-2 border-dashed border-border/40 rounded-[2rem]">
                <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground/60">En attente d'analyse</h3>
                <p className="text-sm text-muted-foreground/40">Utilisez la barre de recherche ci-dessus pour commencer.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
