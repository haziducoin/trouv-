import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import keyBlueImg from '@/assets/key-blue.png'

const PACKS_MIN      = 1
const PACKS_MAX      = 8
const KEYS_PER_PACK  = 100
const PRICE_PER_PACK = 15

interface BuyKeysModalProps {
  open:    boolean
  onClose: () => void
}

export function BuyKeysModal({ open, onClose }: BuyKeysModalProps) {
  const [packs, setPacks] = useState(1)

  useEffect(() => { if (open) setPacks(1) }, [open])

  if (!open) return null

  const totalKeys = packs * KEYS_PER_PACK
  const price     = packs * PRICE_PER_PACK

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="relative pt-8 pb-4 px-6 text-center">
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={17} />
          </button>
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Recharger des clés</h2>
          <p className="text-sm text-gray-400 mt-1.5">Sélectionnez le volume adapté à vos besoins.</p>
        </div>

        {/* Corps */}
        <div className="px-8 pt-3 pb-7 flex flex-col items-center">

          {/* Total massif */}
          <div className="flex items-baseline gap-2 mb-5">
            <span className="text-6xl font-bold text-gray-900 tracking-tighter">{totalKeys}</span>
            <span className="text-2xl text-gray-400 font-medium">clés</span>
          </div>

          {/* Pill clé bleue */}
          <div className="flex items-center justify-center gap-3 mb-9">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-2xl text-sm font-medium border border-blue-100 whitespace-nowrap">
              <img src={keyBlueImg} alt="" style={{ height: '36px', width: 'auto', flexShrink: 0 }} />
              <span>{totalKeys} Clés</span>
            </div>
          </div>

          {/* Slider natif */}
          <div className="w-full px-1">
            <input
              type="range"
              min={PACKS_MIN}
              max={PACKS_MAX}
              step={1}
              value={packs}
              onChange={e => setPacks(Number(e.target.value))}
              className="w-full cursor-pointer accent-[#124bd2] focus:outline-none"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2.5 font-medium px-0.5">
              <span>1 Pack</span>
              <span>8 Packs</span>
            </div>
          </div>
        </div>

        {/* Footer paiement */}
        <div className="bg-gray-50 border-t border-gray-100 px-6 py-5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
              Total à payer
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-gray-900 tracking-tight">{price}&nbsp;€</span>
              <span className="text-sm text-gray-400 font-medium">HT</span>
            </div>
          </div>

          <button
            onClick={() => {
              alert(`Paiement de ${price} € — intégration Stripe à venir`)
              onClose()
            }}
            className="px-6 py-3 bg-[#124bd2] hover:bg-[#0b3fbc] active:scale-95 text-white rounded-xl text-sm font-semibold shadow-sm transition-all duration-200"
          >
            Confirmer l'achat
          </button>
        </div>
      </div>
    </div>
  )
}
