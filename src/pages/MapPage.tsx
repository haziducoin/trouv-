import { useState } from 'react'
import { Map, ArrowLeft } from 'lucide-react'
import CadastreMap from '../components/map/CadastreMap'
import ParcelSidepanel from '../components/map/ParcelSidepanel'

export interface ParcelInfo {
  id:          string
  commune:     string
  section:     string
  numero:      string
  adresse?:    string
  codeInsee?:  string
  contenance?: number   // surface officielle en m² (API Carto IGN)
  lng:         number
  lat:         number
}

interface Props {
  onBack: () => void
}

export default function MapPage({ onBack }: Props) {
  const [selectedParcel, setSelectedParcel] = useState<ParcelInfo | null>(null)

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Topbar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shrink-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition rounded-lg px-2 py-1 hover:bg-slate-100"
        >
          <ArrowLeft size={15} />
          Retour
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2 text-[#1B54FF]">
          <Map size={16} />
          <span className="font-semibold text-sm">Carte Cadastrale</span>
        </div>
        <span className="ml-auto text-xs text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">
          Géoplateforme IGN · DVF Etalab · Gratuit
        </span>
      </header>

      {/* Map + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <CadastreMap onParcelClick={setSelectedParcel} />
        <ParcelSidepanel
          parcel={selectedParcel}
          onClose={() => setSelectedParcel(null)}
        />
      </div>
    </div>
  )
}
