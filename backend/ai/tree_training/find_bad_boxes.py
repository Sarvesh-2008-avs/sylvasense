import pandas as pd

p = r"ai\tree_training\annotations\validation_v2.csv"
df = pd.read_csv(p)

bad = df[
    (df["xmin"] < 0) |
    (df["ymin"] < 0) |
    (df["xmax"] <= df["xmin"]) |
    (df["ymax"] <= df["ymin"])
]

print("INVALID GEOMETRY BOXES:", len(bad))
print()
print(bad.to_string(index=False))
