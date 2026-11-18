# AI 服务环境搭建（负责人：D）

> 目标：把 AI 服务从 **mock 模式**（假向量）切到 **真实模型**（真人脸 + 真中文语义检索）。
>
> ⚠️ **这是全项目技术风险最高的一环**。如果 3 天搞不定，立刻切降级方案（见文末），
> 不要让装环境耗掉一周——整站 mock 模式已经能跑通演示。

---

## 0. 先搞清楚两种模式

| | mock 模式（默认） | 真实模式 |
|---|---|---|
| 启动命令 | `python -m uvicorn main:app --port 8000` | `$env:MOCK_AI=0; python -m uvicorn main:app --port 8000` |
| 依赖 | `requirements.txt`（约 30MB） | `requirements-models.txt`（约 2GB） |
| 人脸 | 假向量（按文件名哈希） | insightface `buffalo_l` 真人脸检测 + 512 维特征 |
| 搜索 | 假向量，结果随机 | Chinese-CLIP 图文向量，语义真的能搜 |
| 用途 | 全站联调、演示流程 | 答辩演示、效果评测 |

**先把 mock 模式跑通，再切真实模式。**

---

## 1. 装依赖

```powershell
cd ai

# 基础依赖（mock 模式就够）
python -m pip install -r requirements.txt

# 真实模型依赖（约 2GB，慢慢下）
python -m pip install -r requirements-models.txt
```

### torch 装 CPU 版（重要，别装成 GPU 版）

`requirements-models.txt` 里写的 `torch` 默认会装带 CUDA 的版本（3GB+）。
我们只需要 CPU 推理，**先单独装 CPU 版 torch**：

```powershell
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
# 然后再装剩下的
python -m pip install -r requirements-models.txt
```

---

## 2. 预下载模型（关键一步）

**答辩现场不能依赖网络**，所以模型必须提前下好。用提供的脚本：

```powershell
cd ai

# 下载人脸模型（insightface buffalo_l，约 280MB）
python download_models.py --face-only

# 下载中文 CLIP（约 600MB）
python download_models.py --clip-only

# 或者两个一起下
python download_models.py
```

模型会存到 `ai/models/`（已在 `.gitignore` 里，不进仓库）。

> **国内下载慢？** 先设镜像再下：
> ```powershell
> $env:HF_ENDPOINT = "https://hf-mirror.com"
> python download_models.py --clip-only
> ```

---

## 3. 检查环境

```powershell
cd ai
python check_env.py
```

它会逐项检查：依赖装了没、模型文件在不在、AI 服务能不能起、当前是什么模式。
**照着它输出的"下一步"做即可。**

---

## 4. 切到真实模式启动

真实模式使用 `ai/data/index.real.json`，mock 模式使用 `ai/data/index.json`。如果演示库曾用 mock 模式上传，先停掉服务，备份 SQLite 和 AI 索引，把旧照片和缩略图移到本地归档目录，再清除旧照片和人物关联。登录账号可以保留。

```powershell
cd ai
$env:MOCK_AI = "0"
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

启动后验证：

```powershell
# 应该返回 {"status":"ok","mode":"real"}
curl http://127.0.0.1:8000/health

# 看索引统计
curl http://127.0.0.1:8000/stats
```

---

## 5. 验证真的生效了

### 人脸

```powershell
# 换成一张真人照片的绝对路径（正斜杠）
curl -X POST http://127.0.0.1:8000/embed -H "Content-Type: application/json" `
  -d '{\"assetId\":\"test1\",\"imagePath\":\"C:/Users/Lenovo/Desktop/photo.jpg\"}'
```

**判断标准**：
- `faces` 数组长度 ≥ 1（有人的照片）
- 每个 face 的 `vec` 是 512 个数
- 反复测 3 张不同人的照片，`personKey` 应该是 3 个不同的值
- 再测 2 张同一个人的照片，`personKey` 应该相同 ← **这是关键，说明归组是对的**

### 语义搜索

先在网页上传 10 张以上不同场景的照片（海边、日落、猫、毕业照、火锅…），然后：

```powershell
curl -X POST http://127.0.0.1:8000/search -H "Content-Type: application/json" `
  -d '{\"query\":\"海边日落\",\"topK\":5}'
```

**判断标准**：返回的 5 个 assetId 里，应该有至少 1 张真的是海边/日落的照片。

### 跑评测集

```powershell
python eval/run_eval.py
```

输出 `Recall@10 = xx%`。这个数字答辩时要用。

---

## 6. 常见报错

| 报错 | 原因 | 解决 |
|---|---|---|
| `Microsoft Visual C++ 14.0 is required` | insightface 需要编译 | 装 [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾"使用 C++ 的桌面开发"）；或先 `pip install insightface --only-binary :all:` |
| `ImportError: DLL load failed` (onnxruntime) | 缺 VC++ 运行库 | 装 [VC++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) |
| `torch` 下载 3GB | 装成 CUDA 版了 | 卸掉重装 CPU 版：`pip uninstall torch -y` 然后按 §1 装 |
| HuggingFace 下载卡住/超时 | 网络 | `$env:HF_ENDPOINT = "https://hf-mirror.com"` |
| `buffalo_l` 下载失败 | insightface 从 GitHub 拉模型 | 手动下 <https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip>，解压到 `ai/models/models/buffalo_l/` |
| 中文文件名/路径报错 | Windows 编码 | 把照片放到纯英文路径下测试 |
| 内存不足 / 进程被杀 | CLIP + 人脸同时加载约 2GB | 关掉其他程序；或先只开人脸（`MOCK_AI` 只影响整体，可分阶段验证） |
| 启动很慢（30 秒+） | 模型加载 | 正常，CPU 加载 torch 模型就是要这么久 |
| `no file named model.safetensors, or pytorch_model.bin, found` | 模型目录里只有 `clip_cn_vit-b-16.pt`（原版格式），缺 transformers 格式的权重 | 删掉 `ai/models/chinese-clip/` 重新 `python download_models.py --clip-only`，确保脚本的 `ignore_patterns` **没有**排除 `*.bin` |
| `linear(): argument 'input' (position 1) must be Tensor, not NoneType` | transformers 5.x 的 API 变更，或直接用 `get_text_features()` | ① `pip install "transformers>=4.45,<5"`；② `clip.py` 里已改成手动走 `text_model` + `text_projection`（取第一个 token），别改回去 |

---

## 附：本机已实测的记录（2026-11-18）

这些是**真的跑通了的**，不是"应该能跑"：

| 项 | 结果 |
|---|---|
| Python | 3.12.3 |
| insightface | **2.1**（一次装成功，无需 VS 编译工具） |
| onnxruntime | 1.32.0 |
| torch | 2.15.0+cpu |
| transformers | **4.57.6**（4.x 才行） |
| buffalo_l | 281MB，下载 16 秒 |
| Chinese-CLIP | 718MB（pytorch_model.bin） |
| 人脸检测 | 样图检出 **6 张脸**，512 维向量，两次检测余弦相似度 **1.000000** |
| 人脸耗时 | 0.2~0.3 秒/张（CPU） |
| 图片编码 | 9~10 秒（首次含模型加载），之后每张约 0.3~0.5 秒 |
| 中文语义检索 | 街景样图：`街拍 人像` +0.3355 / `户外 人群` +0.3360 / `一只橘猫在睡觉` +0.2787 / `风景 山水` +0.2781，**高期望均值比低期望高 0.0399，区分有效** |
| 纯色图验证 | 纯橙色块图对 `一张纯色图片` 相似度 +0.4576（比 `一群人在街上走` 的 +0.2896 高，模型认得出） |

> **结论：环境这条路是通的，D 不需要再花时间摸索装环境，直接按本文档跑即可。**

---

## 7. 降级方案（3 天不通就用这个）

**不是失败，是工程判断。** 切换方式：

### 降级 A：只做人脸检测，不做自动分组
- `ai/face.py` 里 `detect_faces` 正常返回人脸框和向量
- `person_match.py` 的 `assign_person` 改成"每张脸都新建人物"（不做最近邻匹配）
- 前端人物页会变成"每张照片一个人物"，效果差但流程通
- **答辩时说明：聚类效果在小样本下不稳定，因此提供手动合并/拆分**

### 降级 B：搜索改成零样本标签
- 预先定义 200 个中文场景标签（海边/日落/雪山/夜景/毕业照/猫/火锅/樱花…）
- 用 CLIP 对每张图算每个标签的相似度，取 top-3 存进 `ai/data/tags.json`
- 搜索时把 query 和标签做匹配（子串 + 同义词表）
- **不需要向量检索质量，只要标签分类大概对就行，演示很稳**

---

## 8. 时间预期（给自己留缓冲）

| 步骤 | 正常耗时 | 踩坑可能耗时 |
|---|---|---|
| 装依赖 | 20~40 分钟（看网速） | 2~4 小时（编译失败、torch 版本） |
| 下模型 | 10~30 分钟 | 1~2 小时（网络） |
| 切真实模式调通 | 1~2 小时 | 半天（模型加载、路径、内存） |
| 人脸归组调参 | 2~3 小时 | — |
| 搜索效果调优 | 3~5 小时 | — |

**总计：顺利 1~2 天，不顺利 3~5 天。所以必须在 W1 就开始。**

---

## 9. 做完要交付什么

- [ ] `/health` 返回 `mode: "real"`
- [ ] 命令行调 `/embed` 能返回真人脸框 + 512 维向量
- [ ] 同一个人的两张照片归到同一个 `personKey`
- [ ] `/search` 输入"海边日落"能出相关照片
- [ ] 跑通 `eval/run_eval.py`，得到 `Recall@10` 数字
- [ ] 模型文件在 `ai/models/`，**断网也能启动**（这条要专门测一次：拔网线/禁用网卡启动试试）
