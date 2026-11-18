# 负责人：D
# 向量与人物分组的存放处。
# 不引向量数据库：所有数据放在内存 dict 里，落盘成一个 JSON。
# 5000 张图的图片向量约 10MB，暴力算余弦只要几毫秒。

import json
import os
import threading

import numpy as np

from person_match import _cosine_distance, assign_person

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


class Store:
    def __init__(self, index_name: str = "index.json") -> None:
        self.index_file = os.path.join(DATA_DIR, index_name)
        self.lock = threading.RLock()
        # assetId -> 图片向量（list[float]）
        self.clip_vectors: dict[str, list[float]] = {}
        # assetId -> 人脸向量列表
        self.face_vectors: dict[str, list[list[float]]] = {}
        self.face_boxes: dict[str, list[list[int]]] = {}
        self.face_people: dict[str, list[str | None]] = {}
        # personKey -> {"centroid": list[float], "count": int, "assets": [assetId]}
        self.persons: dict[str, dict] = {}
        self._load()

    # ---------- 持久化 ----------

    def _load(self) -> None:
        if not os.path.exists(self.index_file):
            return
        try:
            with open(self.index_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
            self.clip_vectors = raw.get("clip_vectors", {})
            self.face_vectors = raw.get("face_vectors", {})
            self.face_boxes = raw.get("face_boxes", {})
            self.persons = raw.get("persons", {})
            legacy_people: dict[str, list[str]] = {}
            for person_id, person in self.persons.items():
                for asset_id in person.get("assets", []):
                    legacy_people.setdefault(asset_id, []).append(person_id)
            self.face_people = raw.get("face_people", {})
            for asset_id, vectors in self.face_vectors.items():
                if asset_id in self.face_people:
                    continue
                candidates = legacy_people.get(asset_id, [])
                self.face_people[asset_id] = [
                    min(candidates, key=lambda key: _cosine_distance(vec, self.persons[key]["centroid"]), default=None)
                    for vec in vectors
                ]
        except Exception as exc:  # 索引坏了不能让服务起不来
            print(f"[store] 索引读取失败，忽略：{exc}")

    def save(self) -> None:
        os.makedirs(DATA_DIR, exist_ok=True)
        with self.lock:
            temp_file = self.index_file + ".tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "clip_vectors": self.clip_vectors,
                        "face_vectors": self.face_vectors,
                        "face_boxes": self.face_boxes,
                        "face_people": self.face_people,
                        "persons": self.persons,
                    },
                    f,
                )
            os.replace(temp_file, self.index_file)

    # ---------- 写入 ----------

    def index_image(
        self, asset_id: str, clip_vec: list[float], faces: list[dict], owner_id: str | None, legacy_ids: set[str]
    ) -> None:
        with self.lock:
            previous_keys = self.face_people.get(asset_id)
            # 同一张已有照片重试时保留人工拆分和归组。
            if previous_keys is not None and len(previous_keys) == len(faces):
                keys = previous_keys
            else:
                self.face_people.pop(asset_id, None)
                for key in set(previous_keys or []) - {None}:
                    self._refresh_person(key)
                keys = [assign_person(self, asset_id, face["vec"], owner_id, legacy_ids) for face in faces]

            for face, key in zip(faces, keys):
                face["personKey"] = key
            self.clip_vectors[asset_id] = clip_vec
            self.face_vectors[asset_id] = [face["vec"] for face in faces]
            self.face_boxes[asset_id] = [face["bbox"] for face in faces]
            self.face_people[asset_id] = keys
            self.save()

    def delete_image(self, asset_id: str) -> None:
        with self.lock:
            if asset_id not in self.clip_vectors:
                return
            self.clip_vectors.pop(asset_id, None)
            self.face_vectors.pop(asset_id, None)
            self.face_boxes.pop(asset_id, None)
            for key in set(self.face_people.pop(asset_id, [])) - {None}:
                self._refresh_person(key)
            self.save()

    def embedding_summary(self, asset_id: str) -> dict | None:
        with self.lock:
            clip_vec = self.clip_vectors.get(asset_id)
            if clip_vec is None:
                return None
            boxes = self.face_boxes.get(asset_id, [])
            return {
                "clipDim": len(clip_vec),
                "faces": [
                    {"bbox": boxes[i] if i < len(boxes) else None, "dim": len(vec)}
                    for i, vec in enumerate(self.face_vectors.get(asset_id, []))
                ],
            }

    def cover_faces(self, covers: list[tuple[str, str]]) -> list[list[int] | None]:
        with self.lock:
            result = []
            for asset_id, person_key in covers:
                keys = self.face_people.get(asset_id, [])
                boxes = self.face_boxes.get(asset_id, [])
                matches = [box for key, box in zip(keys, boxes) if key == person_key]
                result.append(max(matches, key=lambda box: box[2] * box[3], default=None))
            return result

    # ---------- 检索 ----------

    def search(self, query_vec: list[float], top_k: int, asset_ids: set[str] | None) -> list[tuple[str, float]]:
        with self.lock:
            ids = [asset_id for asset_id in self.clip_vectors if asset_ids is None or asset_id in asset_ids]
            if not ids:
                return []
            mat = np.asarray([self.clip_vectors[i] for i in ids], dtype=np.float32)
        q = np.asarray(query_vec, dtype=np.float32)

        # 余弦相似度 = 点积 / (|a||b|)
        denom = np.linalg.norm(mat, axis=1) * (np.linalg.norm(q) + 1e-8)
        scores = (mat @ q) / (denom + 1e-8)
        order = np.argsort(-scores)[:top_k]
        return [(ids[i], float(scores[i])) for i in order]

    def merge_persons(self, keep_id: str, merge_id: str) -> None:
        with self.lock:
            keep = self.persons.get(keep_id)
            merge = self.persons.get(merge_id)
            if keep_id == merge_id or merge is None:
                return
            # 若保留人物来自另一种运行模式，该人物在当前索引中尚不存在。
            if keep is None:
                self.persons[keep_id] = merge.copy()
            elif keep.get("ownerId") is None:
                keep["ownerId"] = merge.get("ownerId")
            for asset_id, keys in self.face_people.items():
                self.face_people[asset_id] = [keep_id if key == merge_id else key for key in keys]
            self.persons.pop(merge_id)
            self._refresh_person(keep_id)
            self.save()

    def split_person(self, person_id: str, asset_id: str) -> None:
        with self.lock:
            keys = self.face_people.get(asset_id, [])
            if person_id not in keys:
                return
            self.face_people[asset_id] = [None if key == person_id else key for key in keys]
            self._refresh_person(person_id)
            self.save()

    def _refresh_person(self, person_id: str) -> None:
        person = self.persons.get(person_id)
        if person is None:
            return
        assets = []
        vectors = []
        for asset_id, keys in self.face_people.items():
            if person_id in keys:
                assets.append(asset_id)
                vectors.extend(vec for vec, key in zip(self.face_vectors[asset_id], keys) if key == person_id)
        if vectors:
            person.update(assets=assets, count=len(vectors), centroid=np.mean(vectors, axis=0).tolist())
        else:
            self.persons.pop(person_id)
