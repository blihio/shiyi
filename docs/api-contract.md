# 接口契约（API Contract）

> **这个文件是全组唯一的接口依据。**
> 要改接口 → **先改这个文件 → 发群里 → 再改代码**。
> 前端同学照这个文件用假数据开发，后端同学照这个文件写实现。
>
> 维护人：**C**（其他同学可以提 PR）

---

## 通用约定

### 统一响应格式

**成功**
```json
{ "data": { }, "meta": { "page": 1, "pageSize": 50, "total": 1234 } }
```
> `meta` 只有列表接口才带。

**失败**
```json
{ "error": { "code": "ASSET_NOT_FOUND", "message": "照片不存在" } }
```

### 通用规则

| 项 | 约定 |
|---|---|
| 基础路径 | `/api` |
| 鉴权 | 除 `/api/auth/login`、`/api/auth/register` 和 `/api/share/:key` 外，都要带 `Authorization: Bearer <token>` |
| 分页 | `?page=1&pageSize=50`，`pageSize` 最大 100 |
| 时间 | **一律 ISO-8601 UTC 字符串**，例：`2026-11-17T10:00:00.000Z`（不要传时间戳数字） |
| ID | 字符串（cuid） |
| 错误码 | `UNAUTHORIZED` `INVALID_PARAMS` `INVALID_FILE_TYPE` `EMAIL_TAKEN` `NOT_FOUND` `FORBIDDEN` `INTERNAL` `AI_SERVICE_ERROR` |

---

## 1. 鉴权

### `POST /api/auth/login`
```json
// 请求
{ "email": "demo@shiyi.local", "password": "demo1234" }
// 返回
{ "data": { "token": "eyJhbGci...", "user": { "id": "u_1", "email": "demo@shiyi.local" } } }
```

### `POST /api/auth/register`
```json
// 请求
{ "email": "new@shiyi.local", "password": "至少8位" }
// 成功 201
{ "data": { "token": "eyJhbGci...", "user": { "id": "u_2", "email": "new@shiyi.local" } } }
// 失败
{ "error": { "code": "EMAIL_TAKEN", "message": "该邮箱已注册" } }   // 409
{ "error": { "code": "INVALID_PARAMS", "message": "邮箱格式不正确" } } // 400
```
> 邮箱统一 `trim().toLowerCase()` 后存储；密码最短 8 位；注册成功直接返回 token，前端可免登录。

### `GET /api/auth/me`
```json
{ "data": { "id": "u_1", "email": "demo@shiyi.local" } }
```

---

## 2. 照片（Asset）

### `POST /api/assets` 上传
```
Content-Type: multipart/form-data
字段名：files（可多张，最多 20 张）
允许类型：JPG / JPEG / PNG / WebP（MIME + 扩展名 + 解码校验）
单张上限：MAX_UPLOAD_MB（默认 20MB）
```
```json
{ "data": [ { "id": "a_1", "originalName": "IMG_001.jpg", "thumbUrl": "/uploads/thumbs/a_1.webp",
              "width": 4032, "height": 3024 } ] }
```
> 后端处理：存原图 → sharp 读原图元数据（宽高 + 解码校验）→ exifr 提拍摄时间/经纬度/相机 → 生成 600px 缩略图 → 调 AI 服务 `/embed` 拿人脸和图片向量 → 落库。
> `width` / `height` 是**原图显示尺寸**（不是缩略图尺寸）；EXIF orientation 5~8 会交换宽高。
> AI 服务不可用时**不要报错**，照片照常保存，只是没有人物和搜索数据。
> 非白名单类型、伪造 MIME、无法解码的文件返回 `400 INVALID_FILE_TYPE`，并删除已落盘的文件。

### `GET /api/assets` 列表（时间轴就用这个）
```
?page=1&pageSize=50&month=2026-11&personId=p_1&albumId=al_1
```
```json
{
  "data": [
    { "id": "a_1", "thumbUrl": "/uploads/thumbs/a_1.webp", "takenAt": "2026-11-17T10:00:00.000Z",
      "lat": 30.27, "lng": 120.15, "cameraModel": "iPhone 15", "isFavorite": false }
  ],
  "meta": { "page": 1, "pageSize": 50, "total": 132 }
}
```

### `GET /api/assets/:id` 详情
```json
{ "data": { "id": "a_1", "fileUrl": "/uploads/a_1.jpg", "takenAt": "...", "lat": 30.27, "lng": 120.15,
            "cameraModel": "iPhone 15", "width": 4032, "height": 3024, "persons": [ { "id": "p_1", "name": "张三" } ] } }
```

### `PATCH /api/assets/:id` 收藏
```json
{ "isFavorite": true }
```

### `DELETE /api/assets/:id`
```json
{ "data": { "ok": true } }
```

---

## 3. 人物（People）

### `GET /api/people`
```json
{ "data": [ { "id": "p_1", "name": "张三", "coverAssetId": "a_9", "faceCount": 23 } ] }
```
> `name` 为 `null` 时前端显示"未命名人物"。

### `PATCH /api/people/:id` 命名
```json
{ "name": "张三" }
```

### `POST /api/people/merge` 合并两个人物（归类错了时用）
```json
{ "keepId": "p_1", "mergeId": "p_2" }
```

### `POST /api/people/:id/split` 把某张照片里的人拆出去
```json
{ "assetId": "a_5" }
```

---

## 4. 地图（Map）

### `GET /api/map/points`
```json
{ "data": [ { "lat": 30.27, "lng": 120.15, "count": 12, "city": "杭州", "sampleAssetId": "a_1" } ] }
```
> 没有 GPS 的照片不返回。`count` 是这个坐标附近的照片数，前端用它决定标记点大小。

---

## 5. 搜索（Search）

### `GET /api/search?q=海边日落&topK=20`
```json
{ "data": [ { "assetId": "a_3", "score": 0.82, "asset": { "id": "a_3", "thumbUrl": "..." } } ] }
```
> 后端把 `q` 转发给 AI 服务 `POST /search`，拿回 assetId 列表再查库。

---

## 6. 相册（Albums）

### `POST /api/albums`
```json
{ "name": "毕业旅行" }
```

### `GET /api/albums`
```json
{ "data": [ { "id": "al_1", "name": "毕业旅行", "coverAssetId": "a_1", "count": 18 } ] }
```

### `POST /api/albums/:id/assets`
```json
{ "assetIds": ["a_1", "a_2"] }
```

### `GET /api/albums/:id` 相册详情（返回照片列表）

---

## 7. 分享（Share）

### `POST /api/albums/:id/share`
```json
// 请求（可选）
{ "expiresInDays": 30 }
// 返回
{ "data": { "key": "Xk3p9Qm2Ld8aBv4Rt7Yz", "url": "/s/Xk3p9Qm2Ld8aBv4Rt7Yz" } }
```

### `GET /api/share/:key` **免登录**
```json
{ "data": { "album": { "id": "al_1", "name": "毕业旅行" }, "assets": [ { "id": "a_1", "thumbUrl": "..." } ] } }
```

---

## 8. AI 服务内部接口（Node 后端 ↔ Python 服务）

> 这些接口**前端不直接调用**，只在 `ai/` 服务和 Node 后端之间用。

### `POST /embed`
```json
// 请求
{ "assetId": "a_1", "imagePath": "C:/.../data/uploads/a_1.jpg" }
// 返回
{ "assetId": "a_1",
  "faces": [ { "bbox": [x, y, w, h], "vec": [0.12, ...512 个数], "personKey": "p_1" } ],
  "clipVec": [0.05, ...512 个数] }
```

### `POST /search`
```json
// 请求
{ "query": "海边日落", "topK": 20 }
// 返回
{ "results": [ { "assetId": "a_3", "score": 0.82 } ] }
```

### `GET /health`
```json
{ "status": "ok", "mode": "mock" }
```

---

## 附：前端假数据在哪

`web/src/mocks/assets.ts` —— 24 张假照片、3 个假人物，字段结构完全按上面写的。
后端没通之前，前端全部用这份假数据开发。