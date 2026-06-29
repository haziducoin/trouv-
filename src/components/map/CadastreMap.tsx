import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ParcelInfo } from '../../pages/MapPage'
import MapSearchBar from './MapSearchBar'

interface Props {
  onParcelClick: (parcel: ParcelInfo) => void
}

const BASE_STYLE     = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json'
const CADASTRE_TILES = 'https://data.geopf.fr/tms/1.0.0/CADASTRALPARCELS.PARCELLAIRE_EXPRESS/{z}/{x}/{y}.pbf'
const API_CARTO      = 'https://apicarto.ign.fr/api/cadastre/parcelle'

type Coord   = [number, number]
// Polygon: Coord[][]  |  MultiPolygon: Coord[][][]
type GeoGeom = { type: string; coordinates: Coord[][] | Coord[][][] }

interface ApiCartoResult {
  parcel:   ParcelInfo
  geometry: GeoGeom
}

/** Appel direct API Carto pour un point exact */
async function fetchParcelExact(lng: number, lat: number): Promise<ApiCartoResult | null> {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lng, lat] })
  const res  = await fetch(
    `${API_CARTO}?geom=${encodeURIComponent(geom)}&_limit=1`,
    { signal: AbortSignal.timeout(6000) },
  )
  if (!res.ok) return null

  const data = await res.json() as {
    features?: Array<{ geometry: GeoGeom; properties: Record<string, string | number | null> }>
  }
  const feat = data.features?.[0]
  if (!feat) return null

  const p         = feat.properties
  const numeroRaw = String(p.numero ?? '')
  return {
    parcel: {
      id:         String(p.idu       ?? `${p.code_dep}${p.code_com}${p.section}${p.numero}`),
      commune:    String(p.nom_com   ?? ''),
      section:    String(p.section   ?? ''),
      numero:     numeroRaw.replace(/^0+/, '') || numeroRaw,
      codeInsee:  String(p.code_insee ?? `${p.code_dep ?? ''}${p.code_com ?? ''}`),
      contenance: p.contenance != null ? Number(p.contenance) : undefined,
      lng,
      lat,
    },
    geometry: feat.geometry,
  }
}

/**
 * Recherche avec vote majoritaire : sonde le point exact + 8 décalages (~8–16 m).
 * Gère le cas où les coords tombent sur une route (API Carto renvoie null).
 * Fonctionne aussi pour les clics entre deux parcelles.
 */
async function fetchParcelNearby(lng: number, lat: number): Promise<ApiCartoResult | null> {
  const d = 0.0001  // ≈ 8 m lon / 11 m lat
  const probes: Coord[] = [
    [lng,       lat      ],
    [lng + d,   lat      ], [lng - d,   lat      ],
    [lng,       lat + d  ], [lng,       lat - d  ],
    [lng + d*2, lat      ], [lng - d*2, lat      ],
    [lng,       lat + d*2], [lng,       lat - d*2],
  ]

  const hits = await Promise.all(
    probes.map(([lo, la]) => fetchParcelExact(lo, la).catch(() => null)),
  )

  // Vote : la parcelle majoritaire = la plus proche du point cliqué
  const votes: Record<string, { count: number; result: ApiCartoResult }> = {}
  for (const r of hits) {
    if (!r) continue
    const key = r.parcel.id
    if (!votes[key]) votes[key] = { count: 0, result: r }
    votes[key].count++
  }

  const best = Object.values(votes).sort((a, b) => b.count - a.count)[0]
  if (!best) return null
  return { ...best.result, parcel: { ...best.result.parcel, lng, lat } }
}

/**
 * Bounding box d'un Polygon ou MultiPolygon GeoJSON.
 * Polygon    : coordinates = Coord[][]   → flat(1)
 * MultiPolygon: coordinates = Coord[][][] → flat(2)
 */
function geomBbox(g: GeoGeom): [[number, number], [number, number]] {
  const coords: Coord[] = g.type === 'Polygon'
    ? (g.coordinates as Coord[][]).flat()
    : (g.coordinates as Coord[][][]).flat(2)
  const lngs = coords.map(c => c[0])
  const lats  = coords.map(c => c[1])
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

export default function CadastreMap({ onParcelClick }: Props) {
  const containerRef     = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<maplibregl.Map | null>(null)
  const onParcelClickRef = useRef(onParcelClick)
  useEffect(() => { onParcelClickRef.current = onParcelClick }, [onParcelClick])

  /** Met à jour le highlight GeoJSON + ouvre le sidepanel */
  const selectParcel = useCallback((result: ApiCartoResult) => {
    const map = mapRef.current
    if (!map) return
    try {
      const src = map.getSource('selected-parcel') as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type:     'FeatureCollection',
        features: [{ type: 'Feature', geometry: result.geometry as never, properties: {} }],
      })
    } catch (e) {
      console.warn('[cadastre] setData error:', e)
    }
    onParcelClickRef.current(result.parcel)
  }, [])

  /** Barre de recherche : fly + sélection avec vote majoritaire */
  const handleFlyTo = useCallback(async (center: Coord, zoom: number) => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({ center, zoom, duration: 800, essential: true })

    try {
      const result = await fetchParcelNearby(center[0], center[1])
      if (!result) return
      selectParcel(result)
      const bbox = geomBbox(result.geometry)
      map.fitBounds(bbox, { padding: 60, maxZoom: 19, duration: 700 })
    } catch (e) {
      console.warn('[cadastre] handleFlyTo error:', e)
    }
  }, [selectParcel])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     BASE_STYLE,
      center:    [2.3522, 48.8566],
      zoom:      13,
      minZoom:   5,
      maxZoom:   21,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions:    { enableHighAccuracy: true },
        trackUserLocation:  true,
        showAccuracyCircle: true,
      }),
      'top-right',
    )

    map.on('load', () => {

      // ── Tuiles cadastre IGN (affichage des limites parcellaires) ──────────
      map.addSource('cadastre', {
        type:    'vector',
        tiles:   [CADASTRE_TILES],
        minzoom: 13,
        maxzoom: 20,
      })
      map.addLayer({
        id: 'cadastre-line', type: 'line', source: 'cadastre',
        'source-layer': 'BDPARCELLAIRE_UNION', minzoom: 13,
        paint: { 'line-color': '#1B54FF', 'line-width': 0.6, 'line-opacity': 0.35 },
      })
      map.addLayer({
        id: 'cadastre-label', type: 'symbol', source: 'cadastre',
        'source-layer': 'BDPARCELLAIRE_UNION', minzoom: 16,
        layout: {
          'text-field':  ['get', 'numero'],
          'text-font':   ['Noto Sans Regular'],
          'text-size':   10,
          'text-anchor': 'center',
        },
        paint: { 'text-color': '#1B54FF', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      })

      // ── Source GeoJSON : polygone officiel de la parcelle sélectionnée ────
      map.addSource('selected-parcel', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id:   'selected-fill',
        type: 'fill',
        source: 'selected-parcel',
        paint: { 'fill-color': '#1B54FF', 'fill-opacity': 0.18 },
      })
      map.addLayer({
        id:   'selected-line',
        type: 'line',
        source: 'selected-parcel',
        paint: { 'line-color': '#1B54FF', 'line-width': 3, 'line-opacity': 1 },
      })

      // ── Curseur crosshair quand le cadastre est visible (zoom ≥ 13) ───────
      const updateCursor = () => {
        map.getCanvas().style.cursor = map.getZoom() >= 13 ? 'crosshair' : ''
      }
      map.on('zoom', updateCursor)
      updateCursor()

      // ── Clic → API Carto avec vote majoritaire ────────────────────────────
      // (gère les clics entre parcelles, sur routes, limites, etc.)
      map.on('click', async (e) => {
        if (map.getZoom() < 13) return
        const { lng, lat } = e.lngLat
        map.getCanvas().style.cursor = 'wait'
        try {
          const result = await fetchParcelNearby(lng, lat)
          if (result) {
            selectParcel(result)
            const bbox = geomBbox(result.geometry)
            // Petit centrage pour s'assurer que la parcelle est bien visible
            if (map.getZoom() < 15) {
              map.fitBounds(bbox, { padding: 80, maxZoom: 18, duration: 500 })
            }
          }
        } catch (err) {
          console.warn('[cadastre] click error:', err)
        } finally {
          map.getCanvas().style.cursor = map.getZoom() >= 13 ? 'crosshair' : ''
        }
      })
    })

    return () => { map.remove(); mapRef.current = null }
  }, [selectParcel])

  return (
    <div ref={containerRef} className="flex-1 h-full relative">
      <MapSearchBar onFlyTo={handleFlyTo} />
      <div className="absolute bottom-8 left-3 z-10 bg-white/85 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow text-[11px] text-slate-400 pointer-events-none select-none">
        Zoom ≥ 13 · Cliquez sur une parcelle
      </div>
    </div>
  )
}
