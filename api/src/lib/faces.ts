// 负责人：D
// 把 AI 服务返回的人脸结果写进数据库：人脸 → 人物（Person）

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { embedImage, getCoverFaces, type EmbedResult, type FaceBox } from './ai'

function normalizeAvatar(box: FaceBox, width: number, height: number): FaceBox | undefined {
  const [x, y, faceWidth, faceHeight] = box
  if (faceWidth <= 0 || faceHeight <= 0 || x >= width || y >= height || x + faceWidth <= 0 || y + faceHeight <= 0) return
  const size = Math.min(Math.max(faceWidth, faceHeight) * 1.35, width, height)
  const left = Math.min(width - size, Math.max(0, x + (faceWidth - size) / 2))
  const top = Math.min(height - size, Math.max(0, y + (faceHeight - size) / 2))
  return [left / width, top / height, size / width, size / height]
}

export async function personCoverFaces(ownerId: string, people: { id: string; aiPersonId: string; coverAssetId: string | null }[]) {
  const ids = [...new Set(people.flatMap(({ coverAssetId }) => coverAssetId ? [coverAssetId] : []))]
  const assets = await prisma.asset.findMany({ where: { id: { in: ids }, ownerId }, select: { id: true, width: true, height: true } })
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const covers = people.flatMap((person) => {
    const asset = person.coverAssetId && assetById.get(person.coverAssetId)
    if (!asset || !asset.width || !asset.height) return []
    return [{ id: person.id, personKey: person.aiPersonId, assetId: asset.id, width: asset.width, height: asset.height }]
  })
  const boxes = await getCoverFaces(covers.map(({ personKey, assetId }) => ({ personKey, assetId })))
  const result = new Map<string, FaceBox>()
  covers.forEach(({ id, width, height }, index) => {
    const box = boxes[index]
    const crop = box && normalizeAvatar(box, width, height)
    if (crop) result.set(id, crop)
  })
  return result
}

let pending = Promise.resolve()

export function runPhotoJob<T>(job: () => Promise<T>): Promise<T> {
  const result = pending.then(job)
  pending = result.then(() => undefined, () => undefined)
  return result
}

export function queuePhotoJob(assetId: string, job: () => Promise<void>) {
  void runPhotoJob(job).catch((err) => console.error(`[photo] 后台处理照片 ${assetId} 失败`, err))
}

export function queueFaceAnalysis(ownerId: string, assetId: string, imagePath: string) {
  queuePhotoJob(assetId, async () => {
    if (!await prisma.asset.findFirst({ where: { id: assetId, ownerId }, select: { id: true } })) return
    const people = await prisma.person.findMany({ where: { ownerId }, select: { aiPersonId: true } })
    await syncFacesFromAi(ownerId, assetId, await embedImage(assetId, imagePath, ownerId, people.map((p) => p.aiPersonId)))
  })
}

export async function refreshPerson(tx: Prisma.TransactionClient, personId: string, ownerId: string) {
  const person = await tx.person.findFirst({ where: { id: personId, ownerId } })
  if (!person) return
  const photos = await tx.assetPerson.findMany({
    where: { personId, asset: { ownerId } }, orderBy: { asset: { takenAt: 'desc' } }, select: { assetId: true },
  })
  const coverAssetId = photos.find(({ assetId }) => assetId === person.coverAssetId)?.assetId ?? photos[0]?.assetId ?? null
  await tx.person.update({ where: { id: person.id }, data: { faceCount: photos.length, coverAssetId } })
}

export async function syncFacesFromAi(ownerId: string, assetId: string, result: EmbedResult | null) {
  if (!result || result.faces.length === 0) return

  await prisma.$transaction(async (tx) => {
    if (!await tx.asset.findFirst({ where: { id: assetId, ownerId }, select: { id: true } })) return
    for (const key of new Set(result.faces.map((face) => face.personKey))) {
      if (!key) continue

      const person = await tx.person.upsert({
        where: { ownerId_aiPersonId: { ownerId, aiPersonId: key } },
        create: { ownerId, aiPersonId: key, coverAssetId: assetId },
        update: {},
      })

      await tx.assetPerson.upsert({
        where: { assetId_personId: { assetId, personId: person.id } },
        create: { assetId, personId: person.id },
        update: {},
      })
      await refreshPerson(tx, person.id, ownerId)
    }
  })
}
