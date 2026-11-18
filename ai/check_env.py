"""负责人：D

AI 服务环境自检。跑一遍就知道差什么。

用法：
    python check_env.py
"""

from __future__ import annotations

import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(HERE, "models")
FACE_MODEL_DIR = os.path.join(MODELS_DIR, "models", "buffalo_l")
CLIP_DIR = os.path.join(MODELS_DIR, "chinese-clip")
AI_URL = os.environ.get("AI_SERVICE_URL", "http://127.0.0.1:8000")

ok_count = 0
warn_count = 0
bad_count = 0


def line(status: str, title: str, detail: str = "") -> None:
    global ok_count, warn_count, bad_count
    if status == "ok":
        ok_count += 1
        mark = "✅"
    elif status == "warn":
        warn_count += 1
        mark = "⚠️ "
    else:
        bad_count += 1
        mark = "❌"
    print(f"  {mark} {title}" + (f"\n       {detail}" if detail else ""))


def check_python() -> None:
    print("\n[1] Python 环境")
    import sys

    v = sys.version_info
    if v.major == 3 and v.minor >= 10:
        line("ok", f"Python {v.major}.{v.minor}.{v.micro}")
    else:
        line("bad", f"Python {v.major}.{v.minor} 版本过低", "需要 3.10+，建议 3.11/3.12")


def check_modules() -> None:
    print("\n[2] Python 依赖")
    mods = [
        ("fastapi", "fastapi", True),
        ("uvicorn", "uvicorn[standard]", True),
        ("numpy", "numpy", True),
        ("onnxruntime", "onnxruntime", False),
        ("insightface", "insightface", False),
        ("torch", "torch（CPU 版）", False),
        ("transformers", "transformers", False),
        ("huggingface_hub", "huggingface_hub", False),
        ("PIL", "pillow", False),
    ]
    for module, pip_name, required in mods:
        try:
            m = __import__(module)
            ver = getattr(m, "__version__", "")
            line("ok", f"{pip_name} {ver}".strip())
        except Exception:  # noqa: BLE001
            if required:
                line("bad", f"{pip_name} 未安装（mock 模式必需）", f"python -m pip install {pip_name}")
            else:
                line("warn", f"{pip_name} 未安装（真实模型需要）", f"python -m pip install {pip_name}")


def check_models() -> None:
    print("\n[3] 模型文件")
    if os.path.isdir(FACE_MODEL_DIR) and os.listdir(FACE_MODEL_DIR):
        size = sum(
            os.path.getsize(os.path.join(FACE_MODEL_DIR, f))
            for f in os.listdir(FACE_MODEL_DIR)
            if os.path.isfile(os.path.join(FACE_MODEL_DIR, f))
        )
        line("ok", f"人脸模型 buffalo_l（{size / 1024 / 1024:.0f} MB）")
    else:
        line("warn", "人脸模型 buffalo_l 未下载", "cd ai && python download_models.py --face-only")

    cfg = os.path.join(CLIP_DIR, "config.json")
    if os.path.exists(cfg):
        size = sum(
            os.path.getsize(os.path.join(CLIP_DIR, f))
            for f in os.listdir(CLIP_DIR)
            if os.path.isfile(os.path.join(CLIP_DIR, f))
        )
        line("ok", f"中文 CLIP（{size / 1024 / 1024:.0f} MB）")
    else:
        line("warn", "中文 CLIP 未下载", "cd ai && python download_models.py --clip-only")


def check_service() -> None:
    print("\n[4] AI 服务（需要先启动）")
    try:
        with urllib.request.urlopen(f"{AI_URL}/health", timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        mode = data.get("mode", "?")
        if mode == "real":
            line("ok", f"服务在跑，模式 = real（真实模型）")
        else:
            line("ok", f"服务在跑，模式 = {mode}（假向量，用于联调）")
        try:
            with urllib.request.urlopen(f"{AI_URL}/stats", timeout=3) as resp:
                stats = json.loads(resp.read().decode("utf-8"))
            print(f"       已索引照片 {stats.get('assets', 0)} 张，人物 {stats.get('persons', 0)} 个")
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        line("warn", f"AI 服务没在跑（{AI_URL}）", "cd ai && python -m uvicorn main:app --port 8000 --reload")


def check_index() -> None:
    print("\n[5] 向量索引")
    idx = os.path.join(HERE, "data", "index.json")
    if os.path.exists(idx):
        size_kb = os.path.getsize(idx) / 1024
        try:
            with open(idx, "r", encoding="utf-8") as f:
                data = json.load(f)
            n = len(data.get("clip_vectors", {}))
            line("ok", f"索引文件存在（{size_kb:.0f} KB，{n} 张照片）")
        except Exception as exc:  # noqa: BLE001
            line("bad", "索引文件损坏", str(exc))
    else:
        line("warn", "还没有索引", "上传几张照片后会自动生成")


def main() -> None:
    print("=" * 60)
    print("拾忆 AI 服务 环境自检")
    print("=" * 60)
    check_python()
    check_modules()
    check_models()
    check_service()
    check_index()

    print("\n" + "=" * 60)
    print(f"结果：✅ {ok_count} 项正常   ⚠️ {warn_count} 项待处理   ❌ {bad_count} 项缺失")
    print("=" * 60)

    if bad_count > 0:
        print("\n先解决 ❌ 的项目（这些是 mock 模式就必须的）")
    elif ok_count and warn_count > 0:
        print("\n建议按顺序：")
        print("  1. 依赖缺失 → 按上面的 pip 命令装")
        print("  2. 模型缺失 → cd ai && python download_models.py")
        print("  3. 模型齐了 → $env:MOCK_AI='0'; python -m uvicorn main:app --port 8000 --reload")
    else:
        print("\n全部就绪，可以切真实模式了。详细步骤见 ai/SETUP.md")


if __name__ == "__main__":
    main()