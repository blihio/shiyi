// 负责人：C
// 服务入口：建目录、建演示账号、起服务。
// Express app 本身在 app.ts，测试可以直接 import，不会触发 listen。

import 'dotenv/config'

import { app } from './app'
import { PORT } from './env'
import { ensureDirs } from './lib/storage'
import { ensureDemoUser } from './seed'

async function main() {
  ensureDirs()
  await ensureDemoUser()
  app.listen(PORT, () => {
    console.log(`[api] http://localhost:${PORT}`)
  })
}

main().catch((err) => {
  console.error('[api] 启动失败', err)
  process.exit(1)
})