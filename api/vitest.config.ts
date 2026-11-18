import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // 共用一个 SQLite 测试库，串行跑，避免并发写锁
    fileParallelism: false,
    globalSetup: './src/__tests__/global-setup.ts',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: 'file:./test.db',
      DATA_DIR: './.test-data',
      JWT_SECRET: 'test-secret',
      // 测试不依赖 AI 服务；指到关闭的端口，让 fetch 快速失败
      AI_SERVICE_URL: 'http://127.0.0.1:9',
    },
  },
})