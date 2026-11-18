// 负责人：C
// 上传 / 列表 / 详情 / 收藏 / 删除
// 接口定义见 docs/api-contract.md 第 2 节

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import type { Prisma } from '@prisma/client'

import { MAX_UPLOAD_MB, UPLOAD_DIR } from '../env'
import { embedImage } from '../lib/ai'
import { ApiError, InvalidFileTypeError } from '../lib/errors'
import { guessCity, readExif } from '../lib/exif'
import { syncFacesFromAi } from '../lib/faces'
import { prisma } from '../lib/prisma'
import { publicUrl } from '../lib/storage'
import { makeThumb } from '../lib/thumb'
import { requireAuth } from '../middleware/auth'

export const assetsRouter = Router()

// 只允许这三种图片。MIME/扩展名是客户端可伪造的第一道门，
// 真正的校验是下面 sharp.metadata() 能不能解码。
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp'])

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      cb(new InvalidFileTypeError())
      return
    }
    cb(null, true)
  },
})

/**
 * multer 给的 file.originalname 是按 latin1 解码的 UTF-8 字节，
 * 直接存会让中文文件名变成 "æ´»å¨ä¸ - ..." 这种乱码。
 * 这里按 latin1 → utf8 转回来；转不出来（本来就不是 UTF-8）就保留原样。
 */
function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? name : decoded
}

type ImageMeta = { width: number | null; height: number | null }

/** 读原图元数据：既校验“真的是图片”，又拿到原图宽高（不是缩略图宽高） */
async function inspectImage(absPath: string): Promise<ImageMeta> {
  const meta = await sharp(absPath)
    .metadata()
    .catch(() => null)

  if (!meta?.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new InvalidFileTypeError()
  }

  // EXIF orientation 5~8 表示图片被旋转了 90/270 度：
  // 原始像素宽高和用户看到的宽高是反的，这里统一存“显示尺寸”。
  const swap = meta.orientation !== undefined && meta.orientation >= 5 && meta.orientation <= 8
  return {
    width: (swap ? meta.height : meta.width) ?? null,
    height: (swap ? meta.width : meta.height) ?? null,
  }
}

async function removeFiles(files: Express.Multer.File[]) {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => undefined)))
}

function toDto(a: {
  id: string
  thumbPath: string | null
  filePath: string
  originalName: string | null
  takenAt: Date | null
  lat: number | null
  lng: number | null
  cameraModel: string | null
  width: number | null
  height: number | null
  isFavorite: boolean
}) {
  return {
    id: a.id,
    thumbUrl: a.thumbPath ?? undefined,
    fileUrl: a.filePath,
    originalName: a.originalName ?? undefined,
    takenAt: a.takenAt?.toISOString(),
    lat: a.lat ?? undefined,
    lng: a.lng ?? undefined,
    city: guessCity(a.lat, a.lng) ?? undefined,
    cameraModel: a.cameraModel ?? undefined,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    isFavorite: a.isFavorite,
  }
}

/** POST /api/assets —— 上传（可多张） */
assetsRouter.post('/', requireAuth, upload.array('files', 20), async (req, res, next) => {
  const files = (req.files ?? []) as Express.Multer.File[]
  let processed = 0

  try {
    if (files.length === 0) {
      throw new ApiError(400, 'INVALID_PARAMS', '没有收到文件')
    }

    // 先整批校验：一张坏图就整批拒绝，避免“前几张入库、后一张报错”的半批数据
    const metas: ImageMeta[] = []
    for (const file of files) {
      try {
        metas.push(await inspectImage(file.path))
      } catch (err) {
        await removeFiles(files)
        processed = files.length
        throw err instanceof InvalidFileTypeError ? err : new InvalidFileTypeError()
      }
    }

    const created = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const meta = metas[i]!
      const exif = await readExif(file.path)

      const asset = await prisma.asset.create({
        data: {
          ownerId: req.userId!,
          filePath: publicUrl(file.path),
          originalName: decodeOriginalName(file.originalname),
          mimeType: file.mimetype,
          takenAt: exif.takenAt ?? new Date(),
          lat: exif.lat,
          lng: exif.lng,
          cameraModel: exif.cameraModel,
          // 用原图元数据，不用缩略图尺寸兜底
          width: meta.width,
          height: meta.height,
        },
      })
      // 从这之后文件已被数据库引用，出错也不能删
      processed = i + 1

      const thumb = await makeThumb(file.path, asset.id).catch(() => null)
      const updated = await prisma.asset.update({
        where: { id: asset.id },
        data: { thumbPath: thumb ? publicUrl(thumb.thumbAbsPath) : null },
      })
      created.push(toDto(updated))

      // AI 处理放在后台，不要阻塞上传响应（AI 服务没起也不影响）
      void (async () => {
        try {
          const result = await embedImage(asset.id, file.path)
          await syncFacesFromAi(req.userId!, asset.id, result)
        } catch (err) {
          console.error('[ai] 后台处理失败', asset.id, err)
        }
      })()
    }

    res.json({ data: created })
  } catch (err) {
    // 只清理还没入库的文件；已入库的原图保留
    await removeFiles(files.slice(processed))
    next(err)
  }
})

/** GET /api/assets?page&pageSize&month&personId&albumId */
assetsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 50)))
    const { month, personId, albumId } = req.query as Record<string, string | undefined>

    const where: Prisma.AssetWhereInput = { ownerId: req.userId! }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const start = new Date(`${month}-01T00:00:00.000Z`)
      const end = new Date(start)
      end.setUTCMonth(end.getUTCMonth() + 1)
      where.takenAt = { gte: start, lt: end }
    }
    if (personId) where.persons = { some: { personId } }
    if (albumId) where.albums = { some: { albumId } }

    const [total, rows] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        orderBy: { takenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({ data: rows.map(toDto), meta: { page, pageSize, total } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/assets/:id */
assetsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const asset = await prisma.asset.findFirst({
      where: { id: req.params.id, ownerId: req.userId! },
      include: { persons: { include: { person: true } } },
    })
    if (!asset) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '照片不存在' } })
      return
    }
    res.json({
      data: {
        ...toDto(asset),
        persons: asset.persons.map((p) => ({ id: p.person.id, name: p.person.name })),
      },
    })
  } catch (err) {
    next(err)
  }
})

/** PATCH /api/assets/:id —— 目前只有收藏 */
assetsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { isFavorite } = (req.body ?? {}) as { isFavorite?: unknown }
    const updated = await prisma.asset.updateMany({
      where: { id: req.params.id, ownerId: req.userId! },
      data: { isFavorite: Boolean(isFavorite) },
    })
    if (updated.count === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '照片不存在' } })
      return
    }
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/assets/:id */
assetsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const deleted = await prisma.asset.deleteMany({ where: { id: req.params.id, ownerId: req.userId! } })
    if (deleted.count === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '照片不存在' } })
      return
    }
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})