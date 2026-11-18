# 负责人：D
# Chinese-CLIP：把图片和中文文字编码到同一个 512 维空间
#
# 为什么不用原生 CLIP：OpenAI 的 CLIP 文本塔是英文语料训练的，中文几乎无效。
# Chinese-CLIP（OFA-Sys/chinese-clip-vit-base-patch16）可以直接编码中文。
#
# mock 模式：不装模型，用哈希生成确定性假向量。
#
# ⚠️ 两个踩过的坑（改之前先看）：
#   1. HuggingFace 那个仓库同时放了两份权重：
#        clip_cn_vit-b-16.pt   ← 原版格式，transformers 读不了
#        pytorch_model.bin     ← 这份才是 transformers 用的
#      下载时别把 *.bin 忽略掉，否则报 "no file named model.safetensors or pytorch_model.bin"。
#   2. 这个模型的 text_model **没有 pooler_output**（是 None），
#      所以 text 特征要取 last_hidden_state[:, 0, :] 再过 text_projection；
#      直接调 model.get_text_features() 在某些 transformers 版本会报
#      "linear(): argument 'input' must be Tensor, not NoneType"。
#      本文件已显式走 text_model + text_projection，绕开这个坑。

import hashlib
import os

import numpy as np

MOCK = os.getenv("MOCK_AI", "1") == "1"
DIM = 512
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
LOCAL_CLIP_DIR = os.path.join(MODELS_DIR, "chinese-clip")

_model = None
_processor = None


def _load_real_model():
    global _model, _processor
    if _model is not None:
        return _model, _processor
    from transformers import ChineseCLIPModel, ChineseCLIPProcessor  # type: ignore

    # 优先用 download_models.py 预下载到本地的模型（断网也能启动），
    # 本地没有才回退到从 HuggingFace 在线拉取。
    name = (
        LOCAL_CLIP_DIR
        if os.path.exists(os.path.join(LOCAL_CLIP_DIR, "config.json"))
        else "OFA-Sys/chinese-clip-vit-base-patch16"
    )
    print(f"[clip] 加载模型: {name}")
    _model = ChineseCLIPModel.from_pretrained(name)
    _model.eval()
    _processor = ChineseCLIPProcessor.from_pretrained(name)
    return _model, _processor


def _fake_vector(seed: str, dim: int = DIM) -> list[float]:
    h = hashlib.sha256(seed.encode("utf-8")).digest()
    rng = np.random.default_rng(int.from_bytes(h[:8], "big"))
    v = rng.standard_normal(dim).astype(np.float32)
    v /= np.linalg.norm(v) + 1e-8
    return v.tolist()


def encode_image(image_path: str) -> list[float]:
    if MOCK:
        # 同一个文件永远得到同一个向量；不同文件基本不相似
        return _fake_vector(f"image:{os.path.basename(image_path)}")

    try:
        import torch  # type: ignore
        from PIL import Image  # type: ignore

        model, processor = _load_real_model()
        image = Image.open(image_path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")

        with torch.no_grad():
            feats = None
            try:
                candidate = model.get_image_features(**inputs)
                if hasattr(candidate, "norm"):
                    feats = candidate
            except Exception:  # noqa: BLE001
                feats = None

            if feats is None:
                # 兜底：手动走 vision_model + visual_projection
                vision_out = model.vision_model(pixel_values=inputs["pixel_values"])
                pooled = getattr(vision_out, "pooler_output", None)
                if pooled is None:
                    pooled = vision_out.last_hidden_state[:, 0, :]
                feats = model.visual_projection(pooled)

        feats = feats / feats.norm(dim=-1, keepdim=True)
        return feats[0].tolist()
    except Exception as exc:  # noqa: BLE001
        print(f"[clip] 真实模型不可用，用假向量兜底：{exc}")
        return _fake_vector(f"image:{os.path.basename(image_path)}")


def encode_text(query: str) -> list[float]:
    if MOCK:
        # mock 模式下没法真的语义匹配，用字符哈希造一个"稳定但不准"的向量，
        # 演示时搜索结果无意义，但接口链路是通的（README 里写清楚）
        return _fake_vector(f"text:{query}")

    try:
        import torch  # type: ignore

        model, processor = _load_real_model()
        inputs = processor(text=[query], return_tensors="pt", padding=True)

        with torch.no_grad():
            # 见文件头"坑 2"：这个模型没有 pooler_output，取第一个 token 再投影
            text_out = model.text_model(
                input_ids=inputs["input_ids"],
                attention_mask=inputs.get("attention_mask"),
            )
            feats = model.text_projection(text_out.last_hidden_state[:, 0, :])

        feats = feats / feats.norm(dim=-1, keepdim=True)
        return feats[0].tolist()
    except Exception as exc:  # noqa: BLE001
        print(f"[clip] 文本编码失败，用假向量兜底：{exc}")
        return _fake_vector(f"text:{query}")