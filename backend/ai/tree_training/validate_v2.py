import pandas as pd
import os

files = [
    r"ai\tree_training\annotations\train_v2.csv",
    r"ai\tree_training\annotations\validation_v2.csv"
]

print("--- DATASET CHECK ---")

for f in files:
    df = pd.read_csv(f)

    missing = 0
    for image in df["image_path"].unique():
        path = os.path.join(r"ai\tree_training\images", image)
        if not os.path.exists(path):
            missing += 1

    invalid = (
        (df["xmin"] < 0) |
        (df["ymin"] < 0) |
        (df["xmax"] <= df["xmin"]) |
        (df["ymax"] <= df["ymin"])
    ).sum()

    print()
    print(f)
    print("ROWS:", len(df))
    print("IMAGES:", df["image_path"].nunique())
    print("MISSING:", missing)
    print("INVALID:", invalid)
