import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'zsearcher-founder-clone-b22rdylj',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_tlomGE8Nn8-wSJFi5CQUzktN0Fp5Hizu',
  authRequired: false,
  auth: { mode: 'managed' },
})
