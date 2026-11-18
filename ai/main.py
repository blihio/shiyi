# 负责人：D
# 拾忆 AI 服务：人脸分组 + 中文语义检索
#
# 启动：python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
# 默认 MOCK_AI=1，不需要下载任何模型；设 MOCK_AI=0 用真实模型。

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from clip import encode_image, encode_text
from clip import load_real_model as load_clip_model
from face import detect_faces
from face import load_real_model as load_face_model
from store import Store

MOCK = os.getenv("MOCK_AI", "1") == "1"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not MOCK:
        load_face_model()
        load_clip_model()
    yield


app = FastAPI(title="拾忆 AI 服务", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = Store(index_name="index.json" if MOCK else "index.real.json")


class EmbedRequest(BaseModel):
    assetId: str
    imagePath: str
    ownerId: str | None = None
    legacyPersonIds: list[str] = Field(default_factory=list)


class SearchRequest(BaseModel):
    query: str
    topK: int = 20
    assetIds: list[str] | None = None


class MergeRequest(BaseModel):
    keepId: str
    mergeId: str


class SplitRequest(BaseModel):
    personId: str
    assetId: str


class CoverFace(BaseModel):
    personKey: str
    assetId: str


class CoverFacesRequest(BaseModel):
    covers: list[CoverFace]


@app.get("/health")
def health():
    return {"status": "ok", "mode": "mock" if MOCK else "real"}


@app.post("/embed")
def embed(req: EmbedRequest):
    """对一张图做人脸检测 + 图片向量编码，返回人物分组 key"""
    try:
        faces = detect_faces(req.imagePath)
        clip_vec = encode_image(req.imagePath)
    except (FileNotFoundError, IsADirectoryError):
        raise HTTPException(status_code=422, detail="imagePath must reference an existing image file") from None
    store.index_image(req.assetId, clip_vec, faces, req.ownerId, set(req.legacyPersonIds))

    return {
        "assetId": req.assetId,
        "faces": faces,
        "clipVec": clip_vec,
        "mode": "mock" if MOCK else "real",
    }


@app.get("/embeddings/{asset_id}")
def embedding_summary(asset_id: str):
    summary = store.embedding_summary(asset_id)
    if summary is None:
        return None
    return {**summary, "mode": "mock" if MOCK else "real"}


@app.delete("/embeddings/{asset_id}")
def delete_embedding(asset_id: str):
    store.delete_image(asset_id)
    return {"ok": True}


@app.post("/search")
def search(req: SearchRequest):
    """中文描述 → 相似照片 id 列表"""
    asset_ids = None if req.assetIds is None else set(req.assetIds)
    hits = [] if asset_ids == set() else store.search(encode_text(req.query), req.topK, asset_ids)
    return {"results": [{"assetId": a, "score": s} for a, s in hits], "mode": "mock" if MOCK else "real"}


@app.post("/persons/merge")
def persons_merge(req: MergeRequest):
    store.merge_persons(req.keepId, req.mergeId)
    return {"ok": True}


@app.post("/persons/cover-faces")
def cover_faces(req: CoverFacesRequest):
    covers = [(cover.assetId, cover.personKey) for cover in req.covers]
    return {"boxes": [None] * len(covers) if MOCK else store.cover_faces(covers)}


@app.post("/persons/split")
def persons_split(req: SplitRequest):
    store.split_person(req.personId, req.assetId)
    return {"ok": True}


@app.get("/stats")
def stats():
    return {
        "assets": len(store.clip_vectors),
        "persons": len(store.persons),
        "faces": sum(len(v) for v in store.face_vectors.values()),
        "mode": "mock" if MOCK else "real",
    }
