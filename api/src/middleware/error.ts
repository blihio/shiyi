// 负责人：C
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

import { MAX_UPLOAD_MB } from '../env'
import { ApiError } from '../lib/errors'

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)
  // 路由里主动抛出的业务错误：按契约返回对应状态码/错误码
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }

  // multer 的错误默认会变成 500，这里翻译成 4xx
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: { code: 'INVALID_PARAMS', message: `单张图片不能超过 ${MAX_UPLOAD_MB}MB` },
      })
      return
    }
    res.status(400).json({
      error: { code: 'INVALID_PARAMS', message: err.code === 'LIMIT_FILE_COUNT' ? '一次最多上传 20 张' : '上传参数不合法' },
    })
    return
  }

  if (err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'JSON 请求体无效' } })
    return
  }
  console.error('[error]', err)
  res.status(500).json({ error: { code: 'INTERNAL', message: '服务器内部错误' } })
}