// 负责人：C
// 登录成功 / 登录失败 / 重复邮箱注册

import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { app } from '../app'

const PASSWORD = 'password123'

function register(email: string) {
  return request(app).post('/api/auth/register').send({ email, password: PASSWORD })
}

describe('auth', () => {
  it('登录成功返回 token', async () => {
    const email = 'login-ok@test.local'
    const registered = await register(email)
    expect(registered.status).toBe(201)
    expect(registered.body.data.token).toBeTypeOf('string')

    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.data.token).toBeTypeOf('string')
    expect(res.body.data.user.email).toBe(email)
  })

  it('密码错误返回 401', async () => {
    const email = 'login-bad@test.local'
    await register(email)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('重复邮箱注册返回 409', async () => {
    const email = 'duplicate@test.local'
    expect((await register(email)).status).toBe(201)

    const res = await register(email)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })
})