import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { sanitizeProspectForClient } from '../privacy/sanitize.js'

const router = Router()

const ProspectSearchSchema = z.object({
  query: z.string().max(200).default(''),
  department: z.string().max(10).optional().default(''),
  activityCode: z.string().max(20).optional().default(''),
  zipCode: z.string().max(20).optional().default(''),
  employeeRange: z.string().max(20).optional().default(''),
  legalForm: z.string().max(20).optional().default(''),
  page: z.number().int().positive().max(500).default(1),
  perPage: z.number().int().positive().max(100).default(20),
})

router.post('/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = ProspectSearchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.flatten() })
    return
  }

  const params = parsed.data

  try {
    const { data, error } = await supabase.rpc('search_prospects', {
      p_query: params.query.trim(),
      p_department: params.department,
      p_activity_code: params.activityCode,
      p_zip_code: params.zipCode,
      p_employee_range: params.employeeRange,
      p_legal_form: params.legalForm,
      p_page: params.page,
      p_per_page: params.perPage,
    })

    if (error) {
      if (error.message?.includes('Could not find') || error.code === 'PGRST202') {
        res.json({ results: [], total: 0, page: params.page, perPage: params.perPage, totalPages: 0 })
        return
      }

      res.status(500).json({ error: 'Recherche impossible' })
      return
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0

    res.json({
      results: rows.map(sanitizeProspectForClient),
      total,
      page: params.page,
      perPage: params.perPage,
      totalPages: Math.ceil(total / params.perPage),
    })
  } catch (err: any) {
    console.error('[prospects/search]', err.message)
    res.status(500).json({ error: 'Erreur de recherche' })
  }
})

export default router
