import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, ArrowRight, BadgeCheck } from "lucide-react"
import trouveLogo from '@/assets/trouve-logo.png'
import type { Account } from '@/lib/accountStore'

const NAV_LINKS = [
  { label: 'Démo',           href: '/?demo=1', isDemo: true },
  { label: 'Fonctionnalités',href: '#criteres', isDemo: false },
  { label: 'Tarifs',         href: '#tarifs',   isDemo: false },
  { label: 'Sécurité',       href: '#securite', isDemo: false },
]

interface NavbarTrouveProps {
  currentAccount:  Account | null
  onLogin:         () => void
  onRegister:      () => void
  onWorkspace:     () => void
  onDemoClick:     (e: React.MouseEvent<HTMLAnchorElement>) => void
}

export function NavbarTrouve({
  currentAccount, onLogin, onRegister, onWorkspace, onDemoClick,
}: NavbarTrouveProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 py-4">
      {/* Pill navbar */}
      <motion.div
        className="flex w-full max-w-4xl items-center justify-between rounded-full bg-white/90 px-5 py-2.5 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80 backdrop-blur-md"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <motion.a
          href="#produit"
          aria-label="trouvé! accueil"
          whileHover={{ scale: 1.04 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <img src={trouveLogo} alt="trouvé!" className="h-8 w-auto" />
        </motion.a>

        {/* Desktop links */}
        {!currentAccount && (
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((item, i) => (
              <motion.a
                key={item.href}
                href={item.href}
                onClick={item.isDemo ? onDemoClick : undefined}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                whileHover={{ scale: 1.05 }}
                className="relative text-sm font-semibold text-slate-600 transition-colors hover:text-[#124bd2] after:absolute after:bottom-[-3px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-[#124bd2] after:transition-all hover:after:w-full"
              >
                {item.label}
              </motion.a>
            ))}
          </nav>
        )}

        {/* Desktop CTAs */}
        {currentAccount ? (
          <motion.button
            type="button"
            onClick={onWorkspace}
            whileHover={{ scale: 1.03 }}
            className="flex items-center gap-2 rounded-full bg-[#124bd2] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]"
          >
            <BadgeCheck size={14} />
            {currentAccount.firstName} · {currentAccount.role === 'admin' ? 'Admin' : currentAccount.role === 'agence' ? 'Agence' : 'Agent'}
          </motion.button>
        ) : (
          <div className="hidden items-center gap-2 md:flex">
            <motion.button
              type="button"
              onClick={onLogin}
              whileHover={{ scale: 1.04 }}
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:text-[#124bd2]"
            >
              Connexion
            </motion.button>
            <motion.button
              type="button"
              onClick={onRegister}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              whileHover={{ scale: 1.04, y: -1 }}
              className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-[#124bd2] via-[#1558ef] to-[#0b43c9] px-5 py-2 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(18,75,210,0.7)]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <span className="relative">S'inscrire</span>
              <ArrowRight size={13} className="relative transition-transform duration-200 group-hover:translate-x-0.5" />
            </motion.button>
          </div>
        )}

        {/* Mobile burger */}
        <motion.button
          type="button"
          className="flex items-center rounded-full p-2 text-slate-700 md:hidden"
          onClick={() => setIsOpen(o => !o)}
          whileTap={{ scale: 0.9 }}
        >
          <Menu size={20} />
        </motion.button>
      </motion.div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-white px-6 pt-24 pb-10 md:hidden"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
          >
            <motion.button
              type="button"
              className="absolute right-5 top-5 rounded-full border border-slate-200 p-2 text-slate-500"
              onClick={() => setIsOpen(false)}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <X size={18} />
            </motion.button>

            <img src={trouveLogo} alt="trouvé!" className="mb-10 h-8 w-auto" />

            <div className="flex flex-col gap-5">
              {NAV_LINKS.map((item, i) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={e => { item.isDemo && onDemoClick(e as React.MouseEvent<HTMLAnchorElement>); setIsOpen(false) }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: i * 0.07 + 0.1 }}
                  className="text-lg font-semibold text-slate-800"
                >
                  {item.label}
                </motion.a>
              ))}

              <motion.div
                className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ delay: 0.35 }}
              >
                <button
                  type="button"
                  onClick={() => { onLogin(); setIsOpen(false) }}
                  className="h-12 w-full rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-[#124bd2]"
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() => { onRegister(); setIsOpen(false) }}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#124bd2] text-sm font-bold text-white shadow-lg"
                >
                  S'inscrire <ArrowRight size={14} />
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
