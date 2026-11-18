# 数据库怎么用

> 维护人：**C**（`api/prisma/schema.prisma` 只有他能改）

---

## 1. 用的是什么

**SQLite**——一个文件，不需要装数据库服务。

```
shiyi/data/app.db        ← 整个数据库就是这一个文件（几十 KB ~ 几十 MB）
```

为什么不用 MySQL / PostgreSQL：课程项目四个人、几千张照片，SQLite 完全够用，而且
**新人 clone 下来不用装任何数据库就能跑**。答辩时按这个口径讲（见 `dev-rules.md` §6）。

配套工具是 **Prisma**（ORM + 迁移工具），所有数据库操作都通过它，不用手写 SQL。

## 2. 数据存在哪（三个地方）

| 内容 | 位置 | 说明 |
|---|---|---|
| 结构化数据（用户/照片记录/人物/相册/分享） | `data/app.db` | 一个 SQLite 文件 |
| 原图 | `data/uploads/` | 文件名是随机 UUID |
| 缩略图 | `data/uploads/thumbs/` | 600px webp，由 sharp 生成；对外 URL `/uploads/thumbs/...` |
| AI 向量（人脸 / 图片向量） | `ai/data/index.json` | AI 服务自己维护，不进数据库 |

> `data/` 和 `ai/data/` 都在 `.gitignore` 里，**不会被提交到仓库**。
> 所以每个人 clone 下来都是空库，自己上传自己的照片。

## 3. 七张表

| 表 | 存什么 |
|---|---|
| `User` | 账号（邮箱 + bcrypt 密码哈希） |
| `Asset` | 一张照片：文件路径、缩略图路径、拍摄时间、经纬度、相机型号、宽高、是否收藏 |
| `Person` | 一个人物：名字、封面、出现次数、对应的 AI 分组 id |
| `AssetPerson` | 照片 ↔ 人物 的多对多关系（一张合影里有多个人） |
| `Album` | 相册：名字、封面 |
| `AlbumAsset` | 相册 ↔ 照片 的多对多关系 |
| `Share` | 分享链接：随机 key、关联相册、过期时间、访问次数 |

完整定义看 `api/prisma/schema.prisma`（每个字段都有注释）。

## 4. 常用命令（项目根目录执行）

```powershell
# 按 schema.prisma 把表同步到数据库（开发期最常用，改完 schema 就执行它）
npm run db:push

# 打开可视化管理界面，在浏览器里直接看/改数据（推荐新手用）
npm run db:studio
```

`npm run db:studio` 会打开 <http://localhost:5555>，左边选表，右边看数据，
可以直接改字段、删行——**排查"上传后数据到底进没进库"最直观的工具**。

## 5. 怎么查数据（四种方式，按推荐顺序）

### 方式一：Prisma Studio（最推荐）

```powershell
npm run db:studio
```
浏览器里点开 `Asset` 表，就能看到每张照片的 `takenAt` / `lat` / `lng` / `cameraModel`
有没有正确写入。**C 的验收标准就是看这张表。**

### 方式二：sqlite3 命令行（最轻）

Git 自带 sqlite3 的话可以直接用：

```powershell
sqlite3 data\app.db
sqlite> .tables                      -- 看所有表
sqlite> .schema Asset                -- 看表结构
sqlite> select id, originalName, takenAt, lat, lng from Asset limit 5;
sqlite> .quit
```

### 方式三：DB Browser for SQLite（图形界面）

下载 <https://sqlitebrowser.org/>，打开 `data/app.db` 即可，功能比 Studio 更全（能执行任意 SQL）。

### 方式四：写一次性脚本

```powershell
cd api
npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.asset.findMany().then(r=>{console.log(r.length); p.$disconnect()})"
```

## 6. 常见操作

### 想清空所有数据重来

```powershell
# 1. 停掉服务（Ctrl+C）
# 2. 删数据库 + 上传的文件
Remove-Item data\app.db, data\uploads, data\thumbs -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ai\data -Recurse -Force -ErrorAction SilentlyContinue   # AI 向量也清掉
# 3. 重建空库
npm run db:push
# 4. 重新 npm run dev，演示账号 demo@shiyi.local / demo1234 会自动重建
```

> 演示账号是后端启动时自动创建的，所以删库不会丢登录能力。

### 想改表结构（加字段/加表）

**只有 C 能改** `api/prisma/schema.prisma`，流程：

1. 改 `schema.prisma`
2. `npm run db:push`（会自动同步，数据不丢）
3. 后端代码跟着改（`toDto`、接口返回字段）
4. 如果接口返回变了 → 同步更新 `docs/api-contract.md`，群里说一声

> 开发期用 `db push` 就够了。**不要用 `prisma migrate`**——那会生成一堆 migration 文件，
> 四个人分别改容易分叉，反而添乱。

### 备份

```powershell
Copy-Item data\app.db "data\app-$(Get-Date -Format 'yyyyMMdd-HHmm').db"
```

每周五集成日前备份一次，出问题能 30 秒回滚。

### 恢复

把备份文件复制回 `data\app.db` 覆盖即可（先停服务）。

## 7. 常见的坑

| 现象 | 原因 / 解法 |
|---|---|
| 启动报 `no such table: User` | 没执行 `npm run db:push` |
| 报 `Error: P1003` / 找不到文件 | `data/` 目录不存在，`npm run db:push` 前先建目录（仓库里有 `data/.gitkeep`，正常不会缺） |
| 修改了 schema 但代码报类型错误 | 忘记 `npm run db:push`（它会顺带 `prisma generate` 更新类型） |
| 数据库文件在 `api/prisma/data/app.db` | 不对，说明 `api/.env` 里的 `DATABASE_URL` 被改了，正确值是 `file:../../data/app.db` |
| 照片删除后文件还在磁盘 | 软删除还没实现，现在 `DELETE` 只删数据库记录（P1 再处理） |
| 两个人改同一个 schema 冲突 | 约定只有 C 改，别人提需求 |

## 8. 一句话总结

> **数据库 = `data/app.db` 一个文件；改表结构改 `schema.prisma` 然后 `npm run db:push`；
> 想看数据就 `npm run db:studio`；想重来就删文件重新 push。**