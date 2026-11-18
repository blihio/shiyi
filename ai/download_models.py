"""负责人：D

预下载 AI 模型到 ai/models/，让答辩现场断网也能跑。

用法：
    python download_models.py               # 两个都下
    python download_models.py --face-only   # 只下人脸模型（约 280MB）
    python download_models.py --clip-only   # 只下中文 CLIP（约 600MB）

国内下载慢时先设镜像：
    $env:HF_ENDPOINT = "https://hf-mirror.com"
"""

from __future__ import annotations

import argparse
import os
import sys

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
CLIP_REPO = "OFA-Sys/chinese-clip-vit-base-patch16"
CLIP_DIR = os.path.join(MODELS_DIR, "chinese-clip")


def _hr(title: str) -> None:
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def check_import(module: str, pip_name: str) -> bool:
    try:
        __import__(module)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ❌ 缺少依赖 {pip_name}：{exc}")
        print(f"     安装： python -m pip install {pip_name}")
        return False


def download_face() -> bool:
    _hr("下载人脸模型 insightface buffalo_l（约 280MB）")
    if not check_import("insightface", "insightface onnxruntime pillow"):
        return False
    if not check_import("onnxruntime", "onnxruntime"):
        return False

    os.makedirs(MODELS_DIR, exist_ok=True)

    # 已经下过就不重复下
    existing = os.path.join(MODELS_DIR, "models", "buffalo_l")
    if os.path.isdir(existing) and os.listdir(existing):
        print(f"  ✅ 已存在，跳过：{existing}")
        return True

    try:
        from insightface.app import FaceAnalysis  # type: ignore

        print(f"  模型将下载到：{MODELS_DIR}")
        print("  首次运行会从 GitHub 拉取，可能需要几分钟…")
        app = FaceAnalysis(name="buffalo_l", root=MODELS_DIR, providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        print("  ✅ 人脸模型就绪")

        # 立刻跑一次，确认真的能用
        import numpy as np  # type: ignore

        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        app.get(dummy)
        print("  ✅ 推理自检通过（对空图跑了一次）")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ❌ 下载/加载失败：{exc}")
        print("     手动方案：下载 https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip")
        print(f"     解压到：{os.path.join(MODELS_DIR, 'models')} 下（应得到 buffalo_l/ 目录）")
        return False


def download_clip() -> bool:
    _hr("下载中文 CLIP：OFA-Sys/chinese-clip-vit-base-patch16（约 600MB）")
    if not check_import("huggingface_hub", "huggingface_hub"):
        return False

    if os.path.isdir(CLIP_DIR) and os.path.exists(os.path.join(CLIP_DIR, "config.json")):
        print(f"  ✅ 已存在，跳过：{CLIP_DIR}")
        return True

    endpoint = os.environ.get("HF_ENDPOINT")
    print(f"  HF_ENDPOINT = {endpoint or '(默认 huggingface.co，国内可能很慢)'}")
    print(f"  模型将下载到：{CLIP_DIR}")

    try:
        from huggingface_hub import snapshot_download  # type: ignore

        snapshot_download(
            repo_id=CLIP_REPO,
            local_dir=CLIP_DIR,
            ignore_patterns=["*.bin", "*.h5", "*.msgpack", "*.ot", "*.onnx"],
            # 只保留 pytorch 权重和配置文件
        )
        print("  ✅ 中文 CLIP 就绪")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ❌ 下载失败：{exc}")
        print("     国内镜像重试：$env:HF_ENDPOINT='https://hf-mirror.com' 然后重跑本脚本")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="预下载拾忆 AI 服务所需的模型")
    parser.add_argument("--face-only", action="store_true", help="只下载人脸模型")
    parser.add_argument("--clip-only", action="store_true", help="只下载中文 CLIP")
    args = parser.parse_args()

    os.makedirs(MODELS_DIR, exist_ok=True)
    print(f"模型目录：{MODELS_DIR}")

    results: list[tuple[str, bool]] = []
    if not args.clip_only:
        results.append(("人脸模型 buffalo_l", download_face()))
    if not args.face_only:
        results.append(("中文 CLIP", download_clip()))

    _hr("结果")
    for name, ok in results:
        print(f"  {'✅' if ok else '❌'} {name}")

    if all(ok for _, ok in results):
        print("\n全部就绪。下一步：")
        print("  1. python check_env.py        # 环境检查")
        print("  2. $env:MOCK_AI='0'; python -m uvicorn main:app --port 8000 --reload")
    else:
        print("\n有模型没下成功，看上面的提示，或参考 ai/SETUP.md 的「常见报错」")
        sys.exit(1)


if __name__ == "__main__":
    main()