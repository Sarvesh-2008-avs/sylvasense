from deepforest import main
import pandas as pd
import os

model = main.deepforest.load_from_checkpoint(
    r"ai\tree_training\trained_tree_model_v2.ckpt"
)

val_csv = r"ai\tree_training\annotations\validation_v2.csv"

gt = pd.read_csv(val_csv)

print("\n==============================")
print("V2 MODEL EVALUATION")
print("==============================")

for image_name in gt["image_path"].unique():

    image_path = os.path.join(
        r"ai\tree_training\images",
        os.path.basename(image_name)
    )

    print("\nIMAGE:", os.path.basename(image_path))

    if not os.path.exists(image_path):
        print("ERROR: IMAGE NOT FOUND")
        print(image_path)
        continue

    ground_truth = gt[
        gt["image_path"] == image_name
    ].copy()

    prediction = model.predict_image(path=image_path)

    print("GROUND TRUTH:", len(ground_truth))
    print("PREDICTIONS :", len(prediction))

    matched_gt = set()
    tp = 0

    for _, pred in prediction.iterrows():

        best_iou = 0
        best_gt = None

        for gt_index, gt_row in ground_truth.iterrows():

            if gt_index in matched_gt:
                continue

            px1, py1 = pred["xmin"], pred["ymin"]
            px2, py2 = pred["xmax"], pred["ymax"]

            gx1, gy1 = gt_row["xmin"], gt_row["ymin"]
            gx2, gy2 = gt_row["xmax"], gt_row["ymax"]

            ix1 = max(px1, gx1)
            iy1 = max(py1, gy1)
            ix2 = min(px2, gx2)
            iy2 = min(py2, gy2)

            iw = max(0, ix2 - ix1)
            ih = max(0, iy2 - iy1)

            intersection = iw * ih

            pred_area = max(0, px2-px1) * max(0, py2-py1)
            gt_area = max(0, gx2-gx1) * max(0, gy2-gy1)

            union = pred_area + gt_area - intersection

            iou = intersection / union if union > 0 else 0

            if iou > best_iou:
                best_iou = iou
                best_gt = gt_index

        if best_iou >= 0.5 and best_gt is not None:
            tp += 1
            matched_gt.add(best_gt)

    fp = len(prediction) - tp
    fn = len(ground_truth) - tp

    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0

    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall)
        else 0
    )

    print("TP        :", tp)
    print("FP        :", fp)
    print("FN        :", fn)
    print("PRECISION :", round(precision * 100, 2), "%")
    print("RECALL    :", round(recall * 100, 2), "%")
    print("F1 SCORE  :", round(f1 * 100, 2), "%")

print("\n==============================")
print("EVALUATION COMPLETED")
print("==============================")
