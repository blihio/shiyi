# 负责人：D
# 中文语义检索效果评测：算 Recall@10
#
# 用法：
#   1. 先用真实照片跑一遍上传（让 ai/data/index.real.json 里有向量）
#   2. 把每张照片和一个主题对应起来，写进 labels.json（格式见下）
#   3. python eval/run_eval.py
#
# labels.json 格式：
#   { "queries": [ { "q": "海边日落", "expect": ["a_1", "a_7"] } ] }

import json
import os
import sys

import urllib.request

AI = os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8000")
HERE = os.path.dirname(__file__)


def post(path: str, payload: dict):
    req = urllib.request.Request(
        f"{AI}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    labels_path = os.getenv("EVAL_LABELS_PATH", os.path.join(HERE, "labels.json"))
    if not os.path.exists(labels_path):
        print("缺少 eval/labels.json —— 先按 README 的格式标注一批照片再跑")
        sys.exit(1)

    with open(labels_path, "r", encoding="utf-8") as f:
        cases = json.load(f)["queries"]

    recalls = []
    for case in cases:
        expected = set(case["expect"])
        if not expected:
            continue
        result = post("/search", {"query": case["q"], "topK": 10})
        got = {r["assetId"] for r in result["results"]}
        matched = len(got & expected)
        recalls.append(matched / len(expected))
        print(f"[{'命中' if matched else '未命中'}] {case['q']} → {matched}/{len(expected)}")

    if not recalls:
        sys.exit("评测集没有包含相关照片的查询")
    recall = sum(recalls) / len(recalls)
    print(f"\nRecall@10 = {recall:.1%}（{len(recalls)} 条查询的平均召回率）")


if __name__ == "__main__":
    main()
