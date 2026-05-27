import React, { useState } from 'react'
import { 
  Search, 
  Shield, 
  Database, 
  Globe, 
  Users, 
  ArrowRight, 
  TriangleAlert,
  Mail,
  Lock,
  User,
  Phone,
  Home,
  MapPin,
  Globe2,
  Key,
  Calendar,
  Link2,
  Send,
  CheckCircle2,
  LogOut,
  Crown
} from 'lucide-react'
import { Button, Input, Tabs, TabsList, TabsTrigger, Badge, Avatar, AvatarImage, AvatarFallback, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@blinkdotnew/ui'
import { useAuth } from '@/hooks/useAuth'

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState('multi')
  const { user, isLoading, isFounder, login, logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30 selection:text-primary-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
              <Search className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">z<span className="text-primary">Searcher</span></span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors text-primary font-semibold">Rechercher</a>
            <a href="#" className="hover:text-foreground transition-colors">Tarifs</a>
            <a href="#" className="hover:text-foreground transition-colors">OSINT</a>
            <a href="#" className="hover:text-foreground transition-colors">API</a>
          </div>

          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            ) : user ? (
              <div className="flex items-center gap-3">
                {isFounder && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 pr-3 py-1">
                    <Crown size={12} className="fill-amber-500" />
                    Fondateur
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded-full overflow-hidden border border-border/60 hover:border-primary/50 transition-colors">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={user.avatarUrl} />
                        <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0)}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span>{user.displayName || 'Mon compte'}</span>
                        <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer">Paramètres</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer">Historique</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Déconnexion</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button onClick={login} variant="primary" className="rounded-full px-6 shadow-lg shadow-primary/20 h-9">
                Connexion
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <div className="pt-24 pb-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
                <Shield size={16} />
                <span>+5,8 milliards d'enregistrements indexés</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
                Explorez l'<span className="text-primary italic">invisible</span>.
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
                Interrogez la plus grande archive de fuites publiques via plus de 25 critères de recherche ultra-précis. 
                Protégez votre identité en sachant ce que les autres savent.
              </p>
              
              <div className="flex flex-wrap justify-center gap-4">
                <Button variant="primary" className="rounded-full px-8 h-14 text-lg shadow-xl shadow-primary/30 group">
                  Commencer une recherche
                  <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                </Button>
                <Button variant="outline" className="rounded-full px-8 h-14 text-lg border-primary/20 hover:bg-primary/5">
                  Voir les tarifs
                </Button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto mb-24">
              {[
                { icon: <Database />, value: '5.8B+', label: 'Enregistrements' },
                { icon: <Globe />, value: '25+', label: 'Critères' },
                { icon: <Users />, value: '150k+', label: 'Utilisateurs' },
                { icon: <CheckCircle2 />, value: '99.9%', label: 'Précision' }
              ].map((stat, i) => (
                <div key={i} className="p-6 rounded-2xl bg-card border border-border/50 text-center hover:border-primary/30 transition-all hover:translate-y-[-4px] shadow-sm">
                  <div className="text-primary mb-4 flex justify-center">
                    {React.cloneElement(stat.icon as React.ReactElement, { size: 24 })}
                  </div>
                  <div className="text-2xl font-bold mb-1">{stat.value}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Search Tool */}
            <div className="max-w-6xl mx-auto">
              <div className="bg-card border border-border rounded-[2rem] overflow-hidden shadow-2xl">
                <div className="flex border-b border-border">
                  <button 
                    onClick={() => setActiveTab('multi')}
                    className={`flex-1 py-6 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'multi' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
                  >
                    Recherche Multi-critères
                  </button>
                  <button 
                    onClick={() => setActiveTab('omni')}
                    className={`flex-1 py-6 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === 'omni' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
                  >
                    Omni-search
                  </button>
                </div>
                
                <div className="p-8 md:p-12">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {[
                      { icon: <User />, label: 'Nom', placeholder: '...' },
                      { icon: <User />, label: 'Prénom', placeholder: '...' },
                      { icon: <Mail />, label: 'Email', placeholder: '...' },
                      { icon: <Phone />, label: 'Téléphone', placeholder: '...' },
                      { icon: <Home />, label: 'Adresse', placeholder: '...' },
                      { icon: <MapPin />, label: 'Ville', placeholder: '...' },
                      { icon: <MapPin />, label: 'Code postal', placeholder: '...' },
                      { icon: <Globe2 />, label: 'Adresse IP', placeholder: '...' },
                      { icon: <Lock />, label: 'Mot de passe', placeholder: '...' },
                      { icon: <Calendar />, label: 'Date de naissance', placeholder: '...' },
                      { icon: <User />, label: 'Pseudo', placeholder: '...' },
                      { icon: <Globe />, label: 'Pays', placeholder: '...' },
                      { icon: <Link2 />, label: 'Lien profil', placeholder: '...' }
                    ].map((field, i) => (
                      <div key={i} className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                          {React.cloneElement(field.icon as React.ReactElement, { size: 14 })}
                          {field.label}
                        </label>
                        <Input 
                          className="bg-transparent border-none border-b border-border/50 focus-visible:ring-0 focus-visible:border-primary rounded-none p-0 text-lg h-10 placeholder:text-muted-foreground/30 shadow-none" 
                          placeholder={field.placeholder} 
                        />
                      </div>
                    ))}
                    <div className="lg:col-span-1 flex items-end">
                      <Button className="w-full h-14 rounded-xl shadow-lg shadow-primary/20 text-lg font-bold">
                        Lancer l'analyse
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ethical Disclaimer */}
            <div className="mt-24 max-w-4xl mx-auto p-8 rounded-3xl bg-destructive/5 border border-destructive/20 flex flex-col md:flex-row items-center gap-8 animate-slide-up">
              <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                <TriangleAlert size={40} />
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

      <footer className="border-t border-border/40 bg-card/30 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xl font-bold tracking-tight">z<span className="text-primary">Searcher</span></span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Explorez l'invisible. La plus grande archive de fuites publiques à votre portée. 
                Interrogez des milliards de données avec précision.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-6">Produit</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Recherche</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Tarifs</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Statistiques</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Mises à jour</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-6">Légal</h4>
              <ul className="space-y-4 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">CGU</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Vie privée</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-6">Communauté</h4>
              <div className="flex gap-4">
                <a href="#" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"><Send size={20} /></a>
                <a href="#" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"><Globe size={20} /></a>
                <a href="#" className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"><Mail size={20} /></a>
              </div>
              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <Shield size={14} className="text-primary" />
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
