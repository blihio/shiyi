// 负责人：C
// 环境变量读取，集中在这里，别处不要直接读 process.env

import path from 'node:path'

// data 目录固定在仓库根：shiyi/data
// __dirname 是 api/src，退两级才是仓库根（退三级会跑到仓库外）
export const ROOT_DIR = path.resolve(__dirname, '../..')
// 测试时用 DATA_DIR 指到临时目录，避免把测试图片写进真实 data/
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const THUMB_DIR = path.join(DATA_DIR, 'thumbs')

export const PORT = Number(process.env.PORT ?? 3000)
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me-in-production'
export const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000'
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 20)