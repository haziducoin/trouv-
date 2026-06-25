import { useState, useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'

interface BanFeature {
  properties: {
    label: string
    name: string
    city: string
    postcode: string
  }
}

export interface AddressResult {
  adresse:    string
  codePostal: string
  ville:      string
  label:      string
}

interface AddressAutocompleteProps {
  value:       string
  onSelect:    (result: AddressResult) => void
  placeholder?: string
  label?:      string
}

export function AddressAutocomplete({ value, onSelect, placeholder = '122 Boulevard Murat', label }: AddressAutocompleteProps) {
  const [query, setQuery]           = useState(value)
  const [suggestions, setSuggestions] = useState<AddressResult[]>([])
  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(false)
  const [activeIdx, setActiveIdx]   = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchSuggestions = (q: string) => {
    if (q.trim().length < 3) { setSuggestions([]); setOpen(false); return }
    setLoading(true)
    fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6&autocomplete=1`)
      .then(r => r.json())
      .then(data => {
        const results: AddressResult[] = (data.features as BanFeature[]).map(f => ({
          label:      f.properties.label,
          adresse:    f.properties.name,
          codePostal: f.properties.postcode,
          ville:      f.properties.city,
        }))
        setSuggestions(results)
        setOpen(results.length > 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300)
  }

  const handleSelect = (result: AddressResult) => {
    setQuery(result.label)
    setSuggestions([])
    setOpen(false)
    onSelect(result)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      )}
      <div className="relative">
        <MapPin size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-[#124bd2] focus:ring-2 focus:ring-[#124bd2]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border border-slate-300 border-t-[#124bd2]" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(s)}
              className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition ${
                i === activeIdx
                  ? 'bg-blue-50 dark:bg-blue-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <MapPin size={12} className="mt-0.5 shrink-0 text-[#124bd2]" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{s.adresse}</p>
                <p className="text-[10px] text-slate-400">{s.codePostal} {s.ville}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
