// 负责人：C
// 只创建 Express app，不监听端口。
// index.ts 负责启动；测试用 supertest(app) 直接调用，不需要真的占 3000 端口。

import 'dotenv/config'

import cors from 'cors'
import express from 'express'
import path from 'node:path'

import { CORS_ORIGIN, DATA_DIR } from './env'
import { aiHealth } from './lib/ai'
import { ensureDirs } from './lib/storage'
import { errorHandler, notFound } from './middleware/error'
import { albumsRouter } from './routes/albums'
import { assetsRouter } from './routes/assets'
import { authRouter } from './routes/auth'
import { mapRouter } from './routes/map'
import { peopleRouter } from './routes/people'
import { searchRouter } from './routes/search'
import { shareRouter } from './routes/share'

export function createApp() {
  // 上传目录不存在时 multer 会直接报错；启动/测试时都先建好
  ensureDirs()

  const app = express()

  app.use(cors({ origin: CORS_ORIGIN }))
  app.use(express.json())

  // 照片和缩略图的静态访问（缩略图在新路径 /uploads/thumbs/ 下）
  app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')))
  // 兼容旧数据的 /thumbs/<id>.webp；新上传一律返回 /uploads/thumbs/<id>.webp
  app.use('/thumbs', express.static(path.join(DATA_DIR, 'thumbs')))

  app.get('/api/health', async (_req, res) => {
    const ai = await aiHealth()
    res.json({ data: { status: 'ok', ai: ai ?? { status: 'down', mode: 'unknown' } } })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/assets', assetsRouter)
  app.use('/api/people', peopleRouter)
  app.use('/api/map', mapRouter)
  app.use('/api/search', searchRouter)
  app.use('/api/albums', albumsRouter)
  app.use('/api/share', shareRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}

export const app = createApp()