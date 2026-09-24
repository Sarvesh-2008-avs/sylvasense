from deepforest import main
import pandas as pd
import numpy as np

model = main.deepforest.load_from_checkpoint(
    r"ai\tree_training\trained_tree_model.ckpt"
)

img = r"ai\tree_training\images\forest_3 (3).jpg"

pred = model.predict_image(path=img)

gt = pd.read_csv(
    r"ai\tree_training\annotations\validation.csv"
)

gt = gt[["xmin", "ymin", "xmax", "ymax"]].values.astype(float)

pred = pred[
    ["xmin", "ymin", "xmax", "ymax", "score"]
].values.astype(float)

print("GROUND TRUTH:", len(gt))
print("PREDICTIONS:", len(pred))
print()
print("THRESHOLD RESULTS:")

for threshold in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]:

    p = pred[pred[:, 4] >= threshold]

    used = set()
    tp = 0

    for b in p:

        best_iou = 0
        best_index = -1

        for i, g in enumerate(gt):

            if i in used:
                continue

            ix1 = max(b[0], g[0])
            iy1 = max(b[1], g[1])
            ix2 = min(b[2], g[2])
            iy2 = min(b[3], g[3])

            intersection = max(0, ix2 - ix1) * max(0, iy2 - iy1)

            area_pred = (b[2] - b[0]) * (b[3] - b[1])
            area_gt = (g[2] - g[0]) * (g[3] - g[1])

            union = area_pred + area_gt - intersection

            iou = intersection / union if union > 0 else 0

            if iou > best_iou:
                best_iou = iou
                best_index = i

        if best_iou >= 0.5:
            tp += 1
            used.add(best_index)

    fp = len(p) - tp
    fn = len(gt) - tp

    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0

    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall
        else 0
    )

    print(
        f"confidence {threshold:.1f}: "
        f"detections={len(p)}, "
        f"TP={tp}, "
        f"FP={fp}, "
        f"FN={fn}, "
        f"precision={precision:.2%}, "
        f"recall={recall:.2%}, "
        f"F1={f1:.2%}"
    )
