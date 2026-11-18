# 负责人：D
# Chinese-CLIP：把图片和中文文字编码到同一个 512 维空间
#
# 为什么不用原生 CLIP：OpenAI 的 CLIP 文本塔是英文语料训练的，中文几乎无效。
# Chinese-CLIP（OFA-Sys/chinese-clip-vit-base-patch16）可以直接编码中文。
#
# mock 模式：不装模型，用哈希生成确定性假向量。

import hashlib
import os
from functools import cache
from pathlib import Path

import numpy as np

MOCK = os.getenv("MOCK_AI", "1") == "1"
DIM = 512


@cache
def load_real_model():
    from transformers import ChineseCLIPModel, ChineseCLIPProcessor  # type: ignore

    models_dir = Path(__file__).resolve().parent / "models"
    local_model = models_dir / "chinese-clip"
    if not (local_model / "pytorch_model.bin").is_file():
        local_model = models_dir / "chinese-clip-vit-base-patch16"
    source = str(local_model) if local_model.is_dir() else "OFA-Sys/chinese-clip-vit-base-patch16"
    cache_dir = str(models_dir / "huggingface")
    processor = ChineseCLIPProcessor.from_pretrained(source, cache_dir=cache_dir)
    model = ChineseCLIPModel.from_pretrained(
        source, cache_dir=cache_dir, use_safetensors=False, low_cpu_mem_usage=False,
    )
    model.eval()
    return model, processor


def _unit_vector(features) -> list[float]:
    # Transformers 4 returns a tensor. Transformers 5 puts it in pooler_output.
    embedding = getattr(features, "pooler_output", features)[0]
    return (embedding / embedding.norm()).tolist()


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

    import torch  # type: ignore
    from PIL import Image, ImageOps  # type: ignore

    model, processor = load_real_model()
    with Image.open(image_path) as image:
        rgb = ImageOps.exif_transpose(image).convert("RGB")
    inputs = processor(images=rgb, return_tensors="pt")
    with torch.inference_mode():
        return _unit_vector(model.get_image_features(**inputs))


def encode_text(query: str) -> list[float]:
    if MOCK:
        # mock 模式下没法真的语义匹配，用字符哈希造一个"稳定但不准"的向量，
        # 演示时搜索结果无意义，但接口链路是通的（README 里写清楚）
        return _fake_vector(f"text:{query}")

    import torch  # type: ignore

    model, processor = load_real_model()
    inputs = processor(text=[query], return_tensors="pt", padding=True, truncation=True,
                       max_length=model.config.text_config.max_position_embeddings)
    with torch.inference_mode():
        text = model.text_model(input_ids=inputs["input_ids"], attention_mask=inputs.get("attention_mask"))
        return _unit_vector(model.text_projection(text.last_hidden_state[:, 0, :]))
