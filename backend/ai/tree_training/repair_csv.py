from pathlib import Path
import csv

src = Path(r"ai\tree_training\annotations\tree_annotations.csv")

lines = src.read_text(encoding="utf-8").splitlines()

rows = []

for line in lines[1:]:
    parts = line.split(",")

    if len(parts) == 9:
        label = parts[0]
        bbox_x = parts[1]
        bbox_y = parts[2]
        bbox_width = parts[3]
        bbox_height = parts[4]
        image_name = parts[5] + "," + parts[6]
        image_width = parts[7]
        image_height = parts[8]

    elif len(parts) == 8:
        label = parts[0]
        bbox_x = parts[1]
        bbox_y = parts[2]
        bbox_width = parts[3]
        bbox_height = parts[4]
        image_name = parts[5]
        image_width = parts[6]
        image_height = parts[7]

    else:
        print("BAD ROW:", line)
        continue

    rows.append([
        label,
        bbox_x,
        bbox_y,
        bbox_width,
        bbox_height,
        image_name,
        image_width,
        image_height
    ])

with src.open("w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow([
        "label_name",
        "bbox_x",
        "bbox_y",
        "bbox_width",
        "bbox_height",
        "image_name",
        "image_width",
        "image_height"
    ])
    writer.writerows(rows)

print("REPAIRED ROWS:", len(rows))
print("SAVED:", src)
