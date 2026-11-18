// 负责人：C
// 每个测试前清空测试库，保证用例互不干扰。
// 表之间有外键，按“先关联表、后主表”的顺序删。

import { afterAll, beforeEach } from 'vitest'

import { prisma } from '../lib/prisma'

beforeEach(async () => {
  await prisma.share.deleteMany()
  await prisma.albumAsset.deleteMany()
  await prisma.assetPerson.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.person.deleteMany()
  await prisma.album.deleteMany()
  await prisma.user.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})