import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import clsx from 'clsx'
import { UploadCloud, File as FileIcon, Trash2, Loader, CheckCircle, X, AlertCircle, ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ParsedFile {
  id: string
  name: string
  size: number
  progress: number
  content: string | null
  error: string | null
}

interface CsvUploadModalProps {
  open: boolean
  onClose: () => void
  onImport: (csvText: string, fileName: string) => void
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function CsvUploadModal({ open, onClose, onImport }: CsvUploadModalProps) {
  const [file, setFile]         = useState<ParsedFile | null>(null)
  const [isDragging, setDrag]   = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)

  const reset = () => { setFile(null); setDrag(false) }

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv' && !f.name.endsWith('.txt')) {
      setFile({ id: f.name, name: f.name, size: f.size, progress: 0, content: null, error: 'Format invalide — veuillez importer un fichier .csv' })
      return
    }

    const entry: ParsedFile = { id: f.name + Date.now(), name: f.name, size: f.size, progress: 0, content: null, error: null }
    setFile(entry)

    // Simule la progression puis lit le fichier
    let prog = 0
    const interval = setInterval(() => {
      prog += Math.random() * 20 + 10
      setFile(prev => prev ? { ...prev, progress: Math.min(prog, 95) } : prev)
      if (prog >= 95) clearInterval(interval)
    }, 120)

    const reader = new FileReader()
    reader.onload = ev => {
      clearInterval(interval)
      const text = ev.target?.result as string
      setFile(prev => prev ? { ...prev, progress: 100, content: text } : prev)
    }
    reader.onerror = () => {
      clearInterval(interval)
      setFile(prev => prev ? { ...prev, progress: 0, error: 'Erreur de lecture du fichier' } : prev)
    }
    reader.readAsText(f, 'UTF-8')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  const handleConfirm = () => {
    if (file?.content) {
      onImport(file.content, file.name)
      reset()
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-[520px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <UploadCloud className="h-5 w-5 text-[#124bd2]" />
            Importer un fichier CSV
          </DialogTitle>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Colonnes attendues : <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">nom</code>, <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">prenom</code>, <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">telephone</code>, <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">ville</code> — séparateur <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">;</code> ou <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs">,</code>
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          {/* Zone drag & drop */}
          {!file && (
            <motion.div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              initial={false}
              animate={{ borderColor: isDragging ? '#3b82f6' : '#e2e8f0', scale: isDragging ? 1.02 : 1 }}
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.2 }}
              className={clsx(
                'relative rounded-2xl p-10 text-center cursor-pointer border-2 border-dashed transition-colors group',
                isDragging ? 'bg-blue-50 dark:bg-blue-950/20 ring-4 ring-blue-400/20' : 'bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              )}
            >
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{ y: isDragging ? [-4, 0, -4] : 0 }}
                  transition={{ duration: 1.4, repeat: isDragging ? Infinity : 0, ease: 'easeInOut' }}
                  className="relative"
                >
                  <AnimatePresence>
                    {isDragging && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute -inset-5 bg-blue-400/15 rounded-full blur-lg"
                      />
                    )}
                  </AnimatePresence>
                  <UploadCloud className={clsx(
                    'w-14 h-14 transition-colors duration-300',
                    isDragging ? 'text-blue-500' : 'text-zinc-400 group-hover:text-[#124bd2]'
                  )} />
                </motion.div>

                <div className="space-y-1">
                  <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
                    {isDragging ? 'Relâchez le fichier ici' : 'Glissez votre CSV ici'}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    ou{' '}
                    <span className="text-[#124bd2] font-medium underline underline-offset-2">parcourez vos fichiers</span>
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Fichiers .csv uniquement</p>
                </div>
              </div>

              <input ref={inputRef} type="file" accept=".csv,text/csv,.txt" hidden onChange={onSelect} />
            </motion.div>
          )}

          {/* Fichier chargé */}
          <AnimatePresence>
            {file && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                className={clsx(
                  'rounded-xl border p-4 flex items-start gap-4',
                  file.error
                    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70'
                )}
              >
                {/* Icône */}
                <div className="relative flex-shrink-0 mt-1">
                  <FileIcon className={clsx('w-10 h-10', file.error ? 'text-red-400' : 'text-[#124bd2]')} />
                  <AnimatePresence>
                    {file.progress === 100 && !file.error && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute -right-1.5 -bottom-1.5 bg-white dark:bg-zinc-800 rounded-full"
                      >
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">{file.name}</p>
                      <p className="text-xs text-zinc-400">{formatSize(file.size)}</p>
                    </div>
                    <button onClick={reset} className="p-1 rounded text-zinc-400 hover:text-red-500 transition shrink-0">
                      <X size={14} />
                    </button>
                  </div>

                  {file.error ? (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <AlertCircle size={12} />{file.error}
                    </div>
                  ) : (
                    <>
                      {/* Barre de progression */}
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${file.progress}%` }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                          className={clsx('h-full rounded-full', file.progress < 100 ? 'bg-[#124bd2]' : 'bg-emerald-500')}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>{file.progress < 100 ? <Loader className="w-3 h-3 inline animate-spin mr-1" /> : null}{Math.round(file.progress)}%</span>
                        {file.progress === 100 && <span className="text-emerald-600 font-medium">Prêt à importer</span>}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Changer de fichier si erreur */}
          {file?.error && (
            <button onClick={() => { reset(); setTimeout(() => inputRef.current?.click(), 50) }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
              <UploadCloud size={15} /> Choisir un autre fichier
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60">
          <button onClick={() => { reset(); onClose() }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!file?.content}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#124bd2] text-sm font-bold text-white hover:bg-[#0b3fbc] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Importer les données <ArrowRight size={15} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
