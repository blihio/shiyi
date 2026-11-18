# 负责人：D
# 人脸检测 + 512 维特征向量
#
# mock 模式：不装任何模型，返回一个由文件名决定的假向量（整站能跑通演示）
# real 模式：insightface + onnxruntime（CPU），不装 PyTorch

import hashlib
import os
from functools import cache
from pathlib import Path

import numpy as np

MOCK = os.getenv("MOCK_AI", "1") == "1"
DIM = 512


@cache
def load_real_model():
    from insightface.app import FaceAnalysis  # type: ignore

    root = Path(__file__).resolve().parent / "models"
    if not (root / "models" / "buffalo_l").is_dir() and (root / "insightface" / "models" / "buffalo_l").is_dir():
        root /= "insightface"
    analyzer = FaceAnalysis(
        name="buffalo_l",
        root=str(root),
        allowed_modules=["detection", "recognition"],
        providers=["CPUExecutionProvider"],
    )
    if "recognition" not in analyzer.models:
        raise RuntimeError("buffalo_l face recognition model is missing")
    analyzer.prepare(ctx_id=-1, det_size=(640, 640))
    return analyzer


@cache
def load_small_detector():
    """小尺寸检测器：用于「脸占满整张图」的特写照片。

    insightface 的检测框是按 det_size 缩放到固定尺度后推理的，
    一张 2832x4256 的大头照在 640 尺度下人脸会超过检测尺度上限，直接漏检；
    缩到 320 尺度反而能检出来（实测 score 0.877）。
    """
    from insightface.app import FaceAnalysis  # type: ignore

    root = Path(__file__).resolve().parent / "models"
    if not (root / "models" / "buffalo_l").is_dir() and (root / "insightface" / "models" / "buffalo_l").is_dir():
        root /= "insightface"
    analyzer = FaceAnalysis(
        name="buffalo_l",
        root=str(root),
        allowed_modules=["detection", "recognition"],
        providers=["CPUExecutionProvider"],
    )
    analyzer.prepare(ctx_id=-1, det_size=(320, 320))
    return analyzer


def _fake_vector(seed: str, dim: int = DIM) -> list[float]:
    """由字符串确定性地生成一个单位向量（演示用）"""
    h = hashlib.sha256(seed.encode("utf-8")).digest()
    rng = np.random.default_rng(int.from_bytes(h[:8], "big"))
    v = rng.standard_normal(dim).astype(np.float32)
    v /= np.linalg.norm(v) + 1e-8
    return v.tolist()


def detect_faces(image_path: str) -> list[dict]:
    """
    返回 [{"bbox": [x, y, w, h], "vec": [512 个 float]}]
    """
    if MOCK:
        # 用文件名的哈希决定"有几张脸"，让演示数据稳定
        h = int(hashlib.md5(image_path.encode("utf-8")).hexdigest(), 16)
        n = h % 3  # 0~2 张脸
        faces = []
        for i in range(n):
            seed = f"{image_path}#face{i}"
            faces.append(
                {
                    "bbox": [10 + i * 50, 10, 120, 120],
                    "vec": _fake_vector(seed),
                }
            )
        return faces

    from PIL import Image, ImageOps  # type: ignore

    with Image.open(image_path) as image:
        rgb = ImageOps.exif_transpose(image).convert("RGB")
    bgr = np.asarray(rgb)[:, :, ::-1].copy()

    detected = list(load_real_model().get(bgr))
    if not detected:
        # 特写/大头照回退：脸占满画面时 640 尺度会漏检，缩小尺度再试一次
        detected = list(load_small_detector().get(bgr))

    faces = []
    for face in detected:
        x1, y1, x2, y2 = face.bbox.astype(int).tolist()
        faces.append(
            {
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "vec": face.embedding.astype(float).tolist(),
                "score": float(getattr(face, "det_score", 1.0)),
            }
        )
    faces.sort(key=lambda f: f["bbox"][2] * f["bbox"][3], reverse=True)
    return faces
