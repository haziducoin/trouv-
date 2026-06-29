import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, MapPin, Loader2, X } from 'lucide-react'

interface BanFeature {
  geometry:   { coordinates: [number, number] }
  properties: {
    label:      string
    postcode:   string
    city:       string
    type:       string
    score:      number
    housenumber?: string
    street?:    string
  }
}

interface Props {
  onFlyTo: (center: [number, number], zoom: number) => void
}

const BAN_SEARCH = 'https://api-adresse.data.gouv.fr/search/'

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export default function MapSearchBar({ onFlyTo }: Props) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<BanFeature[]>([])
  const [loading,  setLoading]  = useState(false)
  const [open,     setOpen]     = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  const search = useCallback(
    debounce(async (q: string) => {
      if (q.length < 3) { setResults([]); setOpen(false); return }

      abortRef.current?.abort()
      abortRef.current = new AbortController()
      setLoading(true)

      try {
        const url = `${BAN_SEARCH}?q=${encodeURIComponent(q)}&limit=6&autocomplete=1`
        const res = await fetch(url, { signal: abortRef.current.signal })
        const data = await res.json() as { features: BanFeature[] }
        setResults(data.features ?? [])
        setOpen(true)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 280),
    [],
  )

  useEffect(() => { search(query) }, [query, search])

  function handleSelect(f: BanFeature) {
    const [lng, lat] = f.geometry.coordinates
    const zoom = f.properties.type === 'municipality' ? 14
               : f.properties.type === 'street'       ? 16
               : 18
    onFlyTo([lng, lat], zoom)
    setQuery(f.properties.label)
    setOpen(false)
    inputRef.current?.blur()
  }

  function clear() {
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  // Fermer au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-map-search]')) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div
      data-map-search=""
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[360px] max-w-[calc(100%-2rem)]"
    >
      {/* Input */}
      <div className="flex items-center gap-2 bg-white rounded-xl shadow-lg border border-slate-200 px-3 py-2.5">
        {loading
          ? <Loader2 size={16} className="text-[#1B54FF] animate-spin shrink-0" />
          : <Search   size={16} className="text-slate-400 shrink-0" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Rechercher une adresse, une ville…"
          className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400 min-w-0"
        />
        {query && (
          <button onClick={clear} className="text-slate-300 hover:text-slate-500 transition shrink-0">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Dropdown résultats BAN */}
      {open && results.length > 0 && (
        <div className="mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden">
          {results.map((f, i) => (
            <button
              key={i}
              onClick={() => handleSelect(f)}
              className="flex items-start gap-2.5 w-full px-3 py-2.5 hover:bg-slate-50 text-left transition border-b border-slate-50 last:border-0"
            >
              <MapPin size={14} className="text-[#1B54FF] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {f.properties.housenumber
                    ? `${f.properties.housenumber} ${f.properties.street}`
                    : f.properties.label.split(',')[0]}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {f.properties.postcode} {f.properties.city}
                </p>
              </div>
              <span className="ml-auto text-[10px] text-slate-300 uppercase tracking-wide shrink-0 mt-0.5">
                {f.properties.type === 'housenumber' ? 'Adresse'
                 : f.properties.type === 'street'    ? 'Voie'
                 : 'Commune'}
              </span>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-slate-300 border-t border-slate-50">
            Source : Base Adresse Nationale (data.gouv.fr)
          </div>
        </div>
      )}
    </div>
  )
}
