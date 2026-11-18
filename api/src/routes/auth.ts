// 负责人：C
import bcrypt from 'bcryptjs'
import { Router } from 'express'

import { ApiError } from '../lib/errors'
import { prisma } from '../lib/prisma'
import { requireAuth, signToken } from '../middleware/auth'

export const authRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

/** POST /api/auth/register —— 注册并直接签发 token */
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }

    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new ApiError(400, 'INVALID_PARAMS', '邮箱和密码不能为空')
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_RE.test(normalizedEmail)) {
      throw new ApiError(400, 'INVALID_PARAMS', '邮箱格式不正确')
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiError(400, 'INVALID_PARAMS', `密码至少 ${MIN_PASSWORD_LENGTH} 位`)
    }

    const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (exists) {
      throw new ApiError(409, 'EMAIL_TAKEN', '该邮箱已注册')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user
      .create({ data: { email: normalizedEmail, passwordHash } })
      .catch((err: unknown) => {
        // 并发注册时 findUnique 可能都没查到，靠数据库唯一约束兜底
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
          throw new ApiError(409, 'EMAIL_TAKEN', '该邮箱已注册')
        }
        throw err
      })

    res.status(201).json({
      data: {
        token: signToken(user.id, user.email),
        user: { id: user.id, email: user.email },
      },
    })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: { code: 'INVALID_PARAMS', message: '邮箱和密码不能为空' } })
      return
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !passwordOk) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '邮箱或密码错误' } })
      return
    }

    res.json({ data: { token: signToken(user.id, user.email), user: { id: user.id, email: user.email } } })
  } catch (err) {
    next(err)
  }
})

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } })
    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '用户不存在' } })
      return
    }
    res.json({ data: { id: user.id, email: user.email } })
  } catch (err) {
    next(err)
  }
})