import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

interface LogoutDialogProps {
  onConfirm: () => void
  children: React.ReactNode
}

export function LogoutDialog({ onConfirm, children }: LogoutDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>

      <AlertDialog.Portal>
        <AnimatePresence>
          {open && (
            <>
              <AlertDialog.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-[9998] bg-slate-950/60 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                />
              </AlertDialog.Overlay>

              <AlertDialog.Content asChild forceMount>
                <motion.div
                  style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  className="z-[9999] w-[calc(100vw-2rem)] max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {/* Icône */}
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/40">
                    <LogOut size={24} className="text-red-500" />
                  </div>

                  {/* Titre */}
                  <AlertDialog.Title className="text-center text-base font-bold text-slate-800 dark:text-slate-100">
                    Se déconnecter ?
                  </AlertDialog.Title>

                  {/* Description */}
                  <AlertDialog.Description className="mt-2 text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Vous devrez vous reconnecter pour accéder à votre espace professionnel.
                  </AlertDialog.Description>

                  {/* Actions */}
                  <div className="mt-6 flex gap-3">
                    <AlertDialog.Cancel asChild>
                      <button className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        Annuler
                      </button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button
                        onClick={onConfirm}
                        className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 active:scale-95"
                      >
                        Se déconnecter
                      </button>
                    </AlertDialog.Action>
                  </div>
                </motion.div>
              </AlertDialog.Content>
            </>
          )}
        </AnimatePresence>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
