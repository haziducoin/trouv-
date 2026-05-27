import { Request, Response, NextFunction } from 'express'
import { supabase } from '../config/supabase.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
      userEmail?: string
      organizationId?: string
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.slice(7)
  if (!token) { res.status(401).json({ error: 'Token manquant' }); return }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) { res.status(401).json({ error: 'Token invalide' }); return }

  // Récupère l'organization_id depuis le profil
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  req.userId         = user.id
  req.userEmail      = user.email
  req.organizationId = profile?.organization_id ?? undefined
  next()
}
