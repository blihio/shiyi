# 负责人：D
# 人脸归组：不做 HDBSCAN 聚类，改成"增量最近邻匹配"。
#
# 思路（30 行）：
#   来了一个新的人脸向量 v
#   和所有已有人物的质心算余弦距离
#   最近的距离 < 阈值 → 归入那个人物，并更新质心
#   否则 → 新建一个"未命名人物"
#
# 比聚类的好处：不需要 sklearn、不用调参、边传边分组、结果可解释。
# 缺点：早期分错了会一直错 → 所以后端提供了"合并 / 拆分"接口做人工纠错。

import uuid

import numpy as np

THRESHOLD = float(__import__("os").getenv("FACE_MATCH_THRESHOLD", "0.5"))


def _cosine_distance(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    sim = float(va @ vb / (np.linalg.norm(va) * np.linalg.norm(vb) + 1e-8))
    return 1.0 - sim


def assign_person(store, asset_id: str, vec: list[float], owner_id: str | None, legacy_ids: set[str]) -> str:
    """返回这个人脸所属的 personKey"""
    best_key = None
    best_dist = 1.0

    for key, person in store.persons.items():
        owner = person.get("ownerId")
        if owner != owner_id and not (owner is None and key in legacy_ids):
            continue
        dist = _cosine_distance(vec, person["centroid"])
        if dist < best_dist:
            best_dist = dist
            best_key = key

    if best_key is not None and best_dist <= THRESHOLD:
        person = store.persons[best_key]
        person["ownerId"] = owner_id
        n = person["count"]
        centroid = (np.asarray(person["centroid"]) * n + np.asarray(vec)) / (n + 1)
        person["centroid"] = centroid.tolist()
        person["count"] = n + 1
        person["assets"] = list(set(person.get("assets", [])) | {asset_id})
        return best_key

    new_key = f"ai_p_{uuid.uuid4().hex[:8]}"
    store.persons[new_key] = {
        "ownerId": owner_id,
        "centroid": list(vec),
        "count": 1,
        "assets": [asset_id],
    }
    return new_key
