// 负责人：D
// 在当前账号的照片范围内搜索，AI 无结果时匹配文件名和城市。

import { Router } from 'express'

import { semanticSearch } from '../lib/ai'
import { assetDto } from '../lib/asset-dto'
import { ApiError } from '../lib/errors'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const searchRouter = Router()

searchRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!query) throw new ApiError(400, 'INVALID_PARAMS', '搜索词不能为空')
    const topK = Math.min(50, Number(req.query.topK ?? 20))
    const assets = await prisma.asset.findMany({
      where: { ownerId: req.userId! }, orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
    })
    if (!assets.length) {
      res.json({ data: [] })
      return
    }

    const ai = await semanticSearch(query, topK, assets.map((asset) => asset.id))
    const byId = new Map(assets.map((asset) => [asset.id, asset]))
    const results = (ai?.results ?? []).flatMap(({ assetId, score }) => {
      const asset = byId.get(assetId)
      return asset ? [{ assetId, score, asset: assetDto(asset) }] : []
    })
    if (results.length) {
      res.json({ data: results })
      return
    }

    const term = query.toLowerCase()
    const matches = assets.map(assetDto).filter((asset) =>
      asset.originalName?.toLowerCase().includes(term) || asset.city?.includes(query),
    )
    res.json({ data: matches.slice(0, topK).map((asset) => ({ assetId: asset.id, score: 0, asset })) })
  } catch (err) {
    next(err)
  }
})
