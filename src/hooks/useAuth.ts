import { useState, useEffect } from 'react'
import { blink } from '@/blink/client'
import { BlinkUser } from '@blinkdotnew/sdk'

export function useAuth() {
  const [user, setUser] = useState<BlinkUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFounder, setIsFounder] = useState(false)

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user)
      if (!state.isLoading) setIsLoading(false)
      
      // logic for founder account tier
      // assuming the first user or a user with specific metadata is a founder
      if (state.user) {
        const founderStatus = state.user.metadata?.isFounder || state.user.role === 'admin'
        setIsFounder(!!founderStatus)
      } else {
        setIsFounder(false)
      }
    })

    return unsubscribe
  }, [])

  const login = () => blink.auth.login()
  const logout = () => blink.auth.signOut()

  return { user, isLoading, isFounder, login, logout }
}
