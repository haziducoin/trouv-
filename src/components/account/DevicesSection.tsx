import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Laptop,
  LogOut,
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { getDeviceId } from '@/lib/deviceId'

interface Device {
  id: string
  device_id: string
  device_name: string
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  operating_system: string
  browser: string
  last_ip: string
  country: string
  region: string
  city: string
  first_seen_at: string
  last_seen_at: string
  status: 'active' | 'revoked'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'À l\'instant'
  if (m < 60) return `Il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hier'
  return `Il y a ${d} j`
}

function DeviceIcon({ type }: { type: string }) {
  const cls = 'text-[#1B54FF]'
  if (type === 'mobile') return <Smartphone size={20} className={cls} />
  if (type === 'tablet') return <Tablet size={20} className={cls} />
  return <Monitor size={20} className={cls} />
}

async function getAuthHeader(): Promise<string | null> {
  const { data } = await getSupabaseClient().auth.getSession()
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : null
}

export default function DevicesSection() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  const currentDeviceId = getDeviceId()

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getAuthHeader()
      if (!token) { setError('Session expirée'); return }
      const res = await fetch('/api/devices', { headers: { Authorization: token } })
      const json = await res.json() as { devices?: Device[]; error?: string }
      if (!res.ok) { setError(json.error ?? 'Erreur'); return }
      setDevices(json.devices ?? [])
    } catch {
      setError('Impossible de charger les appareils')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const revokeDevice = async (deviceRowId: string) => {
    setRevoking(deviceRowId)
    try {
      const token = await getAuthHeader()
      if (!token) return
      await fetch(`/api/devices?id=${deviceRowId}`, {
        method: 'DELETE',
        headers: { Authorization: token, 'X-Device-Id': currentDeviceId },
      })
      await load()
    } finally {
      setRevoking(null)
    }
  }

  const revokeAll = async () => {
    setRevoking('all')
    try {
      const token = await getAuthHeader()
      if (!token) return
      await fetch('/api/devices?all=1', {
        method: 'DELETE',
        headers: { Authorization: token, 'X-Device-Id': currentDeviceId },
      })
      setConfirmAll(false)
      await load()
    } finally {
      setRevoking(null)
    }
  }

  const active  = devices.filter(d => d.status === 'active')
  const revoked = devices.filter(d => d.status === 'revoked')
  const others  = active.filter(d => d.device_id !== currentDeviceId)

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Info limite */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
        <Laptop size={16} className="mt-0.5 shrink-0 text-blue-600" />
        <p className="text-xs leading-5 text-blue-700 dark:text-blue-400">
          Votre compte est utilisable sur <strong>2 appareils maximum</strong> simultanément.
          {active.length >= 2 && <span className="ml-1 font-semibold">Limite atteinte.</span>}
        </p>
      </div>

      {/* Appareils actifs */}
      <div>
        <p className="mb-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Appareils connectés ({active.length} / 2)
        </p>
        {active.length === 0 && (
          <p className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-500">
            Aucun appareil enregistré.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {active.map(device => {
            const isCurrent = device.device_id === currentDeviceId
            return (
              <div key={device.id}
                className={`rounded-2xl border p-4 transition ${
                  isCurrent
                    ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 p-2">
                      <DeviceIcon type={device.device_type} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {device.device_name || `${device.browser} · ${device.operating_system}`}
                        </p>
                        {isCurrent && (
                          <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            Appareil actuel
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {[device.city, device.country].filter(Boolean).join(', ') || device.last_ip || '—'}
                        {' · '}
                        {timeAgo(device.last_seen_at)}
                      </p>
                      {device.last_ip && (
                        <p className="text-[10px] text-slate-300 dark:text-slate-500 font-mono">IP : {device.last_ip}</p>
                      )}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      disabled={revoking === device.id}
                      onClick={() => void revokeDevice(device.id)}
                      className="shrink-0 rounded-lg border border-red-200 dark:border-red-800/50 bg-white dark:bg-slate-800 p-2 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      title="Déconnecter cet appareil"
                    >
                      {revoking === device.id ? (
                        <span className="block h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Déconnecter tous les autres */}
      {others.length > 0 && (
        <div>
          {!confirmAll ? (
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
            >
              <LogOut size={15} />
              Déconnecter tous les autres appareils
            </button>
          ) : (
            <div className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-xs text-red-700 dark:text-red-400">
                  Tous les autres appareils seront immédiatement déconnectés.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={revoking === 'all'}
                  onClick={() => void revokeAll()}
                  className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {revoking === 'all' ? 'En cours...' : 'Confirmer'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAll(false)}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historique révoqués */}
      {revoked.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Appareils révoqués
          </p>
          <div className="flex flex-col gap-1.5">
            {revoked.slice(0, 5).map(device => (
              <div key={device.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/30 px-3 py-2.5 opacity-60"
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 size={13} className="text-slate-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{device.device_name || '—'}</p>
                    <p className="text-[10px] text-slate-400">{timeAgo(device.last_seen_at)}</p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] text-slate-500 dark:text-slate-400">Révoqué</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
