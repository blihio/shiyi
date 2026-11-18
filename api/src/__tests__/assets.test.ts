// 负责人：C
// 上传原图宽高 / 伪造图片类型 / 越权访问 404

import sharp from 'sharp'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from '../app'

const PASSWORD = 'password123'
const ORIGINAL_WIDTH = 1200
const ORIGINAL_HEIGHT = 900

async function register(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD })
  expect(res.status).toBe(201)
  return res.body.data.token as string
}

async function makeJpeg(width = ORIGINAL_WIDTH, height = ORIGINAL_HEIGHT): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer()
}

describe('assets', () => {
  it('上传后返回原图宽高，而不是缩略图尺寸', async () => {
    const token = await register('upload@test.local')
    const buffer = await makeJpeg()

    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(200)
    const asset = res.body.data[0]
    // 1200x900 原图；如果错误地用了 600px 缩略图，这里会是 600x450
    expect(asset.width).toBe(ORIGINAL_WIDTH)
    expect(asset.height).toBe(ORIGINAL_HEIGHT)

    const detail = await request(app)
      .get(`/api/assets/${asset.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.width).toBe(ORIGINAL_WIDTH)
    expect(detail.body.data.height).toBe(ORIGINAL_HEIGHT)
  })

  it('伪造图片类型返回 400 INVALID_FILE_TYPE', async () => {
    const token = await register('fake@test.local')

    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${token}`)
      .attach('files', Buffer.from('this is not an image'), {
        filename: 'evil.jpg',
        contentType: 'image/jpeg',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE')
  })

  it('访问别人的照片返回 404', async () => {
    const owner = await register('owner@test.local')
    const other = await register('other@test.local')
    const buffer = await makeJpeg()

    const uploaded = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${owner}`)
      .attach('files', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' })
    expect(uploaded.status).toBe(200)

    const res = await request(app)
      .get(`/api/assets/${uploaded.body.data[0].id}`)
      .set('Authorization', `Bearer ${other}`)

    expect(res.status).toBe(404)
  })
})