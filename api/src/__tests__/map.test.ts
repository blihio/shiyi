// 负责人：B
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from '../app'
import { prisma } from '../lib/prisma'
import { signToken } from '../middleware/auth'

async function makeOwner(email: string) {
  const user = await prisma.user.create({ data: { email, passwordHash: 'unused' } })
  return { id: user.id, authorization: 'Bearer ' + signToken(user.id, email) }
}

describe('地图地点照片', () => {
  it('按城市分页返回较早的 GPS 照片，并排除其他用户的照片', async () => {
    const owner = await makeOwner('map-owner@test.local')
    const other = await makeOwner('map-other@test.local')
    await prisma.asset.createMany({
      data: Array.from({ length: 61 }, (_, index) => ({
        id: 'hangzhou-' + index,
        ownerId: owner.id,
        filePath: '/uploads/test.jpg',
        lat: 30.2741,
        lng: 120.1551,
        takenAt: new Date(Date.UTC(2025, 0, index + 1)),
      })),
    })
    await prisma.asset.create({ data: { ownerId: other.id, filePath: '/uploads/other.jpg', lat: 30.2741, lng: 120.1551 } })
    const first = await request(app).get('/api/map/assets').query({ city: '杭州', pageSize: 60 })
      .set('Authorization', owner.authorization).expect(200)
    const second = await request(app).get('/api/map/assets').query({ city: '杭州', page: 2, pageSize: 60 })
      .set('Authorization', owner.authorization).expect(200)

    expect(first.body.data).toHaveLength(60)
    expect(first.body.meta).toEqual({ page: 1, pageSize: 60, total: 61 })
    expect(second.body.data).toEqual([expect.objectContaining({ id: 'hangzhou-0' })])
    expect(second.body.meta.total).toBe(61)
  })

  it('使用与标记匹配的坐标网格，拒绝不完整和冲突的筛选', async () => {
    const owner = await makeOwner('map-bucket@test.local')
    await prisma.asset.createMany({ data: [
      { id: 'same-1', ownerId: owner.id, filePath: '/uploads/same-1.jpg', lat: 30.121, lng: 110.871 },
      { id: 'same-2', ownerId: owner.id, filePath: '/uploads/same-2.jpg', lat: 30.122, lng: 110.872 },
      { id: 'next', ownerId: owner.id, filePath: '/uploads/next.jpg', lat: 30.132, lng: 110.872 },
      { id: 'without-gps', ownerId: owner.id, filePath: '/uploads/unknown.jpg' },
    ] })
    const points = await request(app).get('/api/map/points').set('Authorization', owner.authorization).expect(200)
    expect(points.body.data).toHaveLength(2)
    expect(points.body.data).toContainEqual(expect.objectContaining({ count: 2 }))
    const result = await request(app).get('/api/map/assets').query({ lat: 30.122, lng: 110.872 })
      .set('Authorization', owner.authorization).expect(200)
    expect(result.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'same-1' }), expect.objectContaining({ id: 'same-2' }),
    ]))
    expect(result.body.meta.total).toBe(2)

    for (const query of [{ lat: 30.12 }, { lat: 91, lng: 110.87 }, { city: '杭州', lat: 30.12, lng: 110.87 }]) {
      await request(app).get('/api/map/assets').query(query).set('Authorization', owner.authorization).expect(400)
    }
  })
})
