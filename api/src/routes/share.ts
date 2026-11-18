// 负责人：D
// 公开分享页数据：/api/share/:key —— 不需要登录
// 接口定义见 docs/api-contract.md 第 7 节

import { Router } from 'express'

import { prisma } from '../lib/prisma'

export const shareRouter = Router()

shareRouter.get('/:key', async (req, res, next) => {
  try {
    const share = await prisma.share.findUnique({
      where: { key: req.params.key },
      include: { album: { include: { assets: { include: { asset: true } } } } },
    })

    if (!share || !share.album) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '分享不存在或已失效' } })
      return
    }
    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '分享链接已过期' } })
      return
    }

    await prisma.share.update({ where: { key: share.key }, data: { viewCount: { increment: 1 } } })

    const { album } = share
    res.set('Cache-Control', 'no-store').json({
      data: {
        album: { id: album.id, name: album.name },
        assets: album.assets.filter(({ asset }) => asset.ownerId === album.ownerId).map(({ asset }) => ({
          id: asset.id,
          thumbUrl: asset.thumbPath ?? undefined,
          fileUrl: asset.filePath,
          originalName: asset.originalName ?? undefined,
          takenAt: asset.takenAt?.toISOString(),
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})
