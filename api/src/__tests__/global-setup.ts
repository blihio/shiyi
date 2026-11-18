// 负责人：C
// Vitest 全局初始化：建一个独立的 SQLite 测试库，跑完删除。
// 注意：DATABASE_URL 的相对路径由 Prisma 按 schema.prisma 所在目录解析，
// 所以 file:./test.db 实际是 api/prisma/test.db。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export default function setup() {
  const apiDir = path.resolve(__dirname, '../..')
  const dbPath = path.join(apiDir, 'prisma', 'test.db')

  for (const file of [dbPath, `${dbPath}-journal`]) {
    fs.rmSync(file, { force: true })
  }

  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: apiDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    shell: true,
  })

  return () => {
    for (const file of [dbPath, `${dbPath}-journal`]) {
      fs.rmSync(file, { force: true })
    }
    fs.rmSync(path.join(apiDir, '.test-data'), { recursive: true, force: true })
  }
}