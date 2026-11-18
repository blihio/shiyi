# AI 服务（负责人：D）

这个服务只做两件事：

1. **人脸分组**：检测照片里的人脸 → 512 维特征 → 和已有人物比距离 → 归组
2. **中文语义检索**：把图片和中文描述编码到同一个向量空间 → 算相似度

> 它**不连数据库**，只做推理。数据库在 Node 后端那边。所以这个目录只有 D 修改。

---

## 两种运行模式

### 默认：mock 模式（不用装模型，1 分钟能跑）

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --port 8000 --reload
```

特点：
- 人脸向量和图片向量都是**假数据**（由文件名哈希生成，确定性但无语义）
- 接口链路完整，整站能跑通、能演示"上传 → 出现人物 → 搜索出结果"的流程
- **搜索结果没有真实语义**，只是随机命中

**先用这个模式把整站联调通，再去装真模型。**

### 真实模式（在 `ai/` 目录下运行）

```powershell
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements-models.txt
python download_models.py
$env:MOCK_AI = '0'
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

推荐使用 Python 3.12 的虚拟环境，详见 [SETUP.md](SETUP.md)。
服务在启动时加载 InsightFace `buffalo_l` 和 `OFA-Sys/chinese-clip-vit-base-patch16`，首次下载模型约 1 GB。缓存位于 `ai/models/`。如果已手动准备模型，可以将 InsightFace 的 `det_10g.onnx` 和 `w600k_r50.onnx` 放入 `ai/models/models/buffalo_l/`，将 Chinese-CLIP 的 `pytorch_model.bin`、`config.json`、`preprocessor_config.json` 和 `vocab.txt` 放入 `ai/models/chinese-clip/`。

两套模型加载完成后，`/health` 返回 `mode: real`。模型加载失败时，启动日志会报告错误。

---

## 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/health` | 健康检查，返回当前模式 |
| POST | `/embed` | `{assetId, imagePath}` → 人脸框 + 人脸向量 + 图片向量 |
| POST | `/search` | `{query, topK}` → `[{assetId, score}]` |
| POST | `/persons/merge` | `{keepId, mergeId}` 合并两个人物 |
| POST | `/persons/split` | `{personId, assetId}` 把照片拆出去 |
| GET | `/stats` | 当前索引了多少张图 / 多少个人 |

详细字段见 `../docs/api-contract.md` 第 8 节。

---

## 数据存在哪

演示模式使用 `ai/data/index.json`，真实模式使用 `ai/data/index.real.json`。两个索引文件均由服务生成。

```json
{
  "clip_vectors": { "assetId": [512 个数] },
  "face_vectors": { "assetId": [[512 个数], ...] },
  "persons": { "ai_p_xxx": { "centroid": [...], "count": 3, "assets": ["a_1"] } }
}
```

**为什么不用向量数据库**：5000 张图 × 512 维，在 numpy 里暴力算余弦只要 5 毫秒。
引入 pgvector / Milvus 的运维成本远大于收益。答辩时按这个口径讲。

---

## W1 验收

启动真实模式后，在同一台电脑的 PowerShell 里运行下列命令。把 `$photo` 改为一张清晰单人照片的绝对路径。

```powershell
$photo = 'C:/path/to/photo.jpg'
$body = @{ assetId = 'w1-test'; imagePath = $photo } | ConvertTo-Json
$result = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/embed' -Method Post `
    -ContentType 'application/json; charset=utf-8' -Body $body

$result.mode
$result.faces.Count
$result.faces[0].bbox -join ', '
$result.faces[0].vec.Count
$result.clipVec.Count
```

验收时应看到 `real`、`1`、四个框坐标，以及两个 `512`。人脸框按 EXIF 转正后的图像计算，格式为 `[x, y, 宽, 高]`。

## 调试命令

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/health'
$body = @{ query = '海边日落'; topK = 10 } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/search' -Method Post `
    -ContentType 'application/json; charset=utf-8' -Body $body
```

---

## 效果评测（W3 必做）

`eval/queries.json` 里有 20 条中文查询 + 期望能命中的照片主题。
跑一遍算 **Recall@10**：

```powershell
python eval/run_eval.py
```

> 这是 D 的交付物之一：答辩时要能说出"我们的中文检索 Recall@10 是 xx%"。
