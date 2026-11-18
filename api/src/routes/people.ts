// 负责人：D
// 人物：列表 / 命名 / 合并 / 拆分
// 接口定义见 docs/api-contract.md 第 3 节

import { Router } from 'express'

import { mergePersons, splitPerson } from '../lib/ai'
import { personCoverFaces, refreshPerson, runPhotoJob } from '../lib/faces'
import { ApiError } from '../lib/errors'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'

export const peopleRouter = Router()

/** GET /api/people */
peopleRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const ownerId = req.userId!
    const people = await prisma.person.findMany({
      where: { ownerId },
      orderBy: { faceCount: 'desc' },
    })
    const coverFaces = await personCoverFaces(ownerId, people)
    res.json({
      data: people.map((p) => ({
        id: p.id, name: p.name, coverAssetId: p.coverAssetId, coverFace: coverFaces.get(p.id), faceCount: p.faceCount,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** PATCH /api/people/:id —— 命名 */
peopleRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { name } = (req.body ?? {}) as { name?: unknown }
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '名字不能为空' } })
      return
    }
    const updated = await prisma.person.updateMany({
      where: { id: req.params.id, ownerId: req.userId! },
      data: { name: name.trim() },
    })
    if (updated.count === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '人物不存在' } })
      return
    }
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/people/merge —— 把 mergeId 合并进 keepId */
peopleRouter.post('/merge', requireAuth, async (req, res, next) => {
  try {
    const { keepId, mergeId } = (req.body ?? {}) as { keepId?: string; mergeId?: string }
    if (!keepId || !mergeId) {
      throw new ApiError(400, 'INVALID_PARAMS', '缺少 keepId 或 mergeId')
    }
    const ownerId = req.userId!
    await runPhotoJob(async () => {
      const ids = await prisma.$transaction(async (tx) => {
        const keep = await tx.person.findFirst({ where: { id: keepId, ownerId } })
        const merge = await tx.person.findFirst({ where: { id: mergeId, ownerId } })
        if (!keep || !merge) throw new ApiError(404, 'NOT_FOUND', '人物不存在')
        if (keep.id === merge.id) return

        const links = await tx.assetPerson.findMany({ where: { personId: merge.id, asset: { ownerId } } })
        for (const { assetId } of links) {
          await tx.assetPerson.upsert({
            where: { assetId_personId: { assetId, personId: keep.id } },
            create: { assetId, personId: keep.id },
            update: {},
          })
        }
        await tx.person.delete({ where: { id: merge.id } })
        await refreshPerson(tx, keep.id, ownerId)
        return { keep: keep.aiPersonId, merge: merge.aiPersonId }
      })
      if (ids && !(await mergePersons(ids.keep, ids.merge))?.ok) {
        console.warn('[ai] 合并已保存到数据库，AI 索引同步失败', keepId, mergeId)
      }
    })
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/people/:id/split —— 把某张照片从这个人物里拆出去 */
peopleRouter.post('/:id/split', requireAuth, async (req, res, next) => {
  try {
    const { assetId } = (req.body ?? {}) as { assetId?: string }
    if (!assetId) {
      throw new ApiError(400, 'INVALID_PARAMS', '缺少 assetId')
    }
    const ownerId = req.userId!
    await runPhotoJob(async () => {
      const aiPersonId = await prisma.$transaction(async (tx) => {
        const person = await tx.person.findFirst({ where: { id: req.params.id, ownerId } })
        if (!person) throw new ApiError(404, 'NOT_FOUND', '人物不存在')
        const deleted = await tx.assetPerson.deleteMany({ where: { personId: person.id, assetId, asset: { ownerId } } })
        if (!deleted.count) return
        await refreshPerson(tx, person.id, ownerId)
        return person.aiPersonId
      })
      if (aiPersonId && !(await splitPerson(aiPersonId, assetId))?.ok) {
        console.warn('[ai] 拆分已保存到数据库，AI 索引同步失败', req.params.id, assetId)
      }
    })
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})
