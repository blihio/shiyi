// 负责人：D
// 相册：创建 / 列表 / 详情 / 加照片 / 生成分享链接
// 接口定义见 docs/api-contract.md 第 6、7 节

import { randomBytes } from 'node:crypto'

import { Router } from 'express'

import { assetDto } from '../lib/asset-dto'
import { ApiError } from '../lib/errors'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const albumsRouter = Router()

/** POST /api/albums */
albumsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name } = (req.body ?? {}) as { name?: unknown }
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '相册名不能为空' } })
      return
    }
    const album = await prisma.album.create({ data: { ownerId: req.userId!, name: name.trim() } })
    res.json({ data: { id: album.id, name: album.name, count: 0 } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/albums */
albumsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const ownerId = req.userId!
    const albums = await prisma.album.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: { assets: { where: { asset: { ownerId } }, select: { assetId: true } } },
    })
    res.json({
      data: albums.map((album) => ({
        id: album.id, name: album.name, count: album.assets.length,
        coverAssetId: album.assets.find(({ assetId }) => assetId === album.coverAssetId)?.assetId ?? album.assets[0]?.assetId ?? null,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/albums/:id/assets */
albumsRouter.post('/:id/assets', requireAuth, async (req, res, next) => {
  try {
    const { assetIds } = (req.body ?? {}) as { assetIds?: unknown }
    if (!Array.isArray(assetIds)) throw new ApiError(400, 'INVALID_PARAMS', 'assetIds 必须是数组')
    const ids = [...new Set(assetIds.filter((id): id is string => typeof id === 'string'))]
    const ownerId = req.userId!
    const count = await prisma.$transaction(async (tx) => {
      const album = await tx.album.findFirst({ where: { id: req.params.id, ownerId } })
      if (!album) throw new ApiError(404, 'NOT_FOUND', '相册不存在')
      const owned = await tx.asset.count({ where: { ownerId, id: { in: ids } } })
      if (owned !== ids.length) throw new ApiError(404, 'NOT_FOUND', '照片不存在')

      const links = await tx.albumAsset.findMany({
        where: { albumId: album.id, asset: { ownerId } }, select: { assetId: true },
      })
      const current = new Set(links.map(({ assetId }) => assetId))
      const additions = ids.filter((assetId) => !current.has(assetId))
      if (additions.length) {
        await tx.albumAsset.createMany({ data: additions.map((assetId) => ({ albumId: album.id, assetId })) })
      }
      if (!album.coverAssetId || !current.has(album.coverAssetId)) {
        const coverAssetId = links[0]?.assetId ?? additions[0] ?? null
        await tx.album.update({ where: { id: album.id }, data: { coverAssetId } })
      }
      return current.size + additions.length
    })
    res.json({ data: { ok: true, count } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/albums/:id */
albumsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const ownerId = req.userId!
    const album = await prisma.album.findFirst({
      where: { id: req.params.id, ownerId },
      include: { assets: { where: { asset: { ownerId } }, include: { asset: true }, orderBy: { asset: { takenAt: 'desc' } } } },
    })
    if (!album) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '相册不存在' } })
      return
    }
    res.json({
      data: {
        id: album.id,
        name: album.name,
        coverAssetId: album.assets.find(({ assetId }) => assetId === album.coverAssetId)?.assetId ?? album.assets[0]?.assetId ?? null,
        count: album.assets.length,
        assets: album.assets.map(({ asset }) => assetDto(asset)),
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/albums/:id/share */
albumsRouter.post('/:id/share', requireAuth, async (req, res, next) => {
  try {
    const album = await prisma.album.findFirst({ where: { id: req.params.id, ownerId: req.userId! } })
    if (!album) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '相册不存在' } })
      return
    }
    const { expiresInDays } = (req.body ?? {}) as { expiresInDays?: unknown }
    const expiresAt = typeof expiresInDays === 'number' ? new Date(Date.now() + expiresInDays * 86400000) : null

    const key = randomBytes(15).toString('base64url')
    await prisma.share.create({ data: { key, albumId: album.id, expiresAt } })
    res.json({ data: { key, url: `/s/${key}` } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/albums/:id —— 删除相册（照片本身不删，只解除关联；分享链接一起失效） */
albumsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const album = await prisma.album.findFirst({ where: { id: req.params.id, ownerId: req.userId! } })
    if (!album) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '相册不存在' } })
      return
    }
    // AlbumAsset / Share 关系在 schema 里配了 onDelete: Cascade，删相册会自动清理
    await prisma.album.delete({ where: { id: album.id } })
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})
