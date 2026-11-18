// 负责人：C
// 首次启动时自动建一个演示账号：demo@shiyi.local / demo1234
// 独立成文件，index.ts 启动时调用；测试不调用它（测试自己注册用户）。

import bcrypt from 'bcryptjs'

import { prisma } from './lib/prisma'

export async function ensureDemoUser() {
  const count = await prisma.user.count()
  if (count > 0) return

  await prisma.user.create({
    data: {
      email: 'demo@shiyi.local',
      passwordHash: await bcrypt.hash('demo1234', 10),
    },
  })
  console.log('[init] 已创建演示账号 demo@shiyi.local / demo1234')
}