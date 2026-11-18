// 负责人：D
// 把 AI 服务返回的人脸结果写进数据库：人脸 → 人物（Person）

import { prisma } from './prisma'
import type { EmbedResult } from './ai'

export async function syncFacesFromAi(ownerId: string, assetId: string, result: EmbedResult | null) {
  if (!result || result.faces.length === 0) return

  for (const face of result.faces) {
    const key = face.personKey
    if (!key) continue

    let person = await prisma.person.findFirst({ where: { ownerId, aiPersonId: key } })
    if (!person) {
      person = await prisma.person.create({
        data: { ownerId, aiPersonId: key, coverAssetId: assetId, faceCount: 0 },
      })
    }

    await prisma.assetPerson.upsert({
      where: { assetId_personId: { assetId, personId: person.id } },
      create: { assetId, personId: person.id },
      update: {},
    })

    const count = await prisma.assetPerson.count({ where: { personId: person.id } })
    await prisma.person.update({ where: { id: person.id }, data: { faceCount: count } })
  }
}