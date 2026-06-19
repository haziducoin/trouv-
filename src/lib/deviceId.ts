/**
 * Identifiant stable de l'appareil, stocké dans localStorage.
 * Envoyé en header X-Device-Id sur chaque requête authentifiée.
 */

const KEY = 'trouve_device_id'

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}
