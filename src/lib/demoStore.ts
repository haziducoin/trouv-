const KEY = 'trouve_demo_credits_v1'

export interface DemoCredits {
  phone: number
  email: number
}

const INITIAL: DemoCredits = { phone: 5, email: 2 }

export function getDemoCredits(): DemoCredits {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...INITIAL }
    return JSON.parse(raw) as DemoCredits
  } catch {
    return { ...INITIAL }
  }
}

export function resetDemoCredits() {
  localStorage.setItem(KEY, JSON.stringify(INITIAL))
}

export function consumePhoneCredit(): DemoCredits {
  const c = getDemoCredits()
  const next = { ...c, phone: Math.max(0, c.phone - 1) }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function consumeEmailCredit(): DemoCredits {
  const c = getDemoCredits()
  const next = { ...c, email: Math.max(0, c.email - 1) }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
