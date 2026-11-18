# 负责人：D
# 人脸检测 + 512 维特征向量
#
# mock 模式：不装任何模型，返回一个由文件名决定的假向量（整站能跑通演示）
# real 模式：insightface + onnxruntime（CPU），不装 PyTorch

import hashlib
import os

import numpy as np

MOCK = os.getenv("MOCK_AI", "1") == "1"
DIM = 512
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

_analyzer = None


def _load_real_model():
    global _analyzer
    if _analyzer is not None:
        return _analyzer
    from insightface.app import FaceAnalysis  # type: ignore

    # root 指向 ai/models，配合 download_models.py 预下载的模型，断网也能启动
    app = FaceAnalysis(name="buffalo_l", root=MODELS_DIR, providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    _analyzer = app
    return _analyzer


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

    try:
        from PIL import Image  # type: ignore
        import numpy as np  # 已导入

        app = _load_real_model()
        img = np.asarray(Image.open(image_path).convert("RGB"))[:, :, ::-1]  # RGB -> BGR
        detected = app.get(img)
        faces = []
        for face in detected:
            bbox = face.bbox.astype(int).tolist()  # [x1, y1, x2, y2]
            x1, y1, x2, y2 = bbox
            faces.append(
                {
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                    "vec": face.embedding.astype(float).tolist(),
                }
            )
        return faces
    except Exception as exc:
        print(f"[face] 真实模型不可用，返回空结果：{exc}")
        return []