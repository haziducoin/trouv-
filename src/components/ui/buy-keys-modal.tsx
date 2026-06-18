import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { ShoppingCart } from 'lucide-react'
import keyBlueImg from '@/assets/key-blue.png'
import keyGreenImg from '@/assets/key-green.png'

const STEP = 25
const MIN  = 25
const MAX  = 200
const PRICE_PER_PACK = 15

interface BuyKeysModalProps {
  open: boolean
  onClose: () => void
}

export function BuyKeysModal({ open, onClose }: BuyKeysModalProps) {
  const [quantity, setQuantity] = useState([25])

  const qty   = quantity[0]
  const packs = qty / STEP
  const total = packs * PRICE_PER_PACK

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="flex items-center gap-2 text-[1.6rem] font-bold text-slate-900 dark:text-white">
            <ShoppingCart className="h-5 w-5 text-[#124bd2]" />
            Recharger mes clés
          </DialogTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400 pt-1 text-center">
            Rechargez avec des Packs de 50 clés trouvé&nbsp;!
          </p>
        </DialogHeader>

        {/* Aperçu clés */}
        <div className="flex items-center justify-center gap-10 py-2">
          <div className="flex flex-col items-center gap-1">
            <img src={keyBlueImg} alt="clé téléphone" style={{ height: '80px', width: 'auto' }} />
            <span className="text-2xl font-black" style={{ color: '#1a569f' }}>+{qty}</span>
            <span className="text-[11px] text-slate-400">Téléphones</span>
          </div>
          <div className="text-xl font-light text-slate-300 dark:text-slate-600">+</div>
          <div className="flex flex-col items-center gap-1">
            <img src={keyGreenImg} alt="clé email" style={{ height: '80px', width: 'auto' }} />
            <span className="text-2xl font-black" style={{ color: '#1d6a40' }}>+{qty}</span>
            <span className="text-[11px] text-slate-400">Emails Directs</span>
          </div>
        </div>

        {/* Slider Radix */}
        <div className="px-1 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>25</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {qty} clés sélectionnées
            </span>
            <span>200</span>
          </div>
          <Slider
            min={MIN}
            max={MAX}
            step={STEP}
            value={quantity}
            onValueChange={setQuantity}
            showTooltip
            tooltipContent={v => `${v} clés`}
            className="[--primary:#124bd2]"
          />
          {/* Repères */}
          <div className="flex justify-between px-0.5">
            {Array.from({ length: (MAX - MIN) / STEP + 1 }, (_, i) => MIN + i * STEP).map(v => (
              <span
                key={v}
                className={`text-[10px] transition-colors ${
                  v === qty
                    ? 'text-[#124bd2] font-bold'
                    : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Prix + bouton */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Total à payer</p>
            <p className="text-3xl font-black text-slate-900 dark:text-white">{total}&nbsp;€</p>
            <p className="text-[11px] text-slate-400">
              {packs} pack{packs > 1 ? 's' : ''} × 15&nbsp;€
            </p>
          </div>
          <button
            onClick={() => {
              alert(`Paiement de ${total} € — intégration Stripe à venir`)
              onClose()
            }}
            className="flex items-center gap-2 rounded-xl bg-[#124bd2] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0b3fbc] active:scale-95"
          >
            <ShoppingCart className="h-4 w-4" />
            Acheter
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
