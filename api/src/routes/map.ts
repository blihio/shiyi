// 负责人：D
// 地图：有 GPS 的照片按坐标聚合成点
// 接口定义见 docs/api-contract.md 第 4 节

import { Router } from 'express'

import { assetDto } from '../lib/asset-dto'
import { guessCity } from '../lib/exif'
import { pagination } from '../lib/pagination'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const mapRouter = Router()

/** GET /api/map/points */
mapRouter.get('/points', requireAuth, async (req, res, next) => {
  try {
    const assets = await prisma.asset.findMany({
      where: { ownerId: req.userId!, lat: { not: null }, lng: { not: null } },
      select: { id: true, lat: true, lng: true },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
    })

    // 以 0.01 度网格聚合附近的照片，保留实际拍摄点作为代表。
    const buckets = new Map<string, { lat: number; lng: number; count: number; sampleAssetId: string; city?: string }>()
    for (const a of assets) {
      if (a.lat == null || a.lng == null) continue
      const city = guessCity(a.lat, a.lng) ?? undefined
      const key = `${a.lat.toFixed(2)},${a.lng.toFixed(2)},${city ?? ''}`
      const hit = buckets.get(key)
      if (hit) hit.count += 1
      else buckets.set(key, { lat: a.lat, lng: a.lng, count: 1, sampleAssetId: a.id, city })
    }

    res.json({ data: [...buckets.values()] })
  } catch (err) {
    next(err)
  }
})

mapRouter.get('/assets', requireAuth, async (req, res, next) => {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : ''
    const { page, pageSize, skip } = pagination(req.query)
    const photos = await prisma.asset.findMany({
      where: { ownerId: req.userId!, lat: { not: null }, lng: { not: null } },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
    })
    const matches = city ? photos.filter((photo) => guessCity(photo.lat, photo.lng) === city) : photos
    res.json({ data: matches.slice(skip, skip + pageSize).map(assetDto), meta: { page, pageSize, total: matches.length } })
  } catch (err) {
    next(err)
  }
})
