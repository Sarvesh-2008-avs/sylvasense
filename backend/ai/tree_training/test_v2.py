from deepforest import main
from deepforest.visualize import plot_results
import os

model = main.deepforest.load_from_checkpoint(
    r"ai\tree_training\trained_tree_model_v2.ckpt"
)

images = [
    r"ai\tree_training\images\Mitraon_Forest_-_Aerial_View_-_Delhi_2016-08-04_5774.JPG",
    r"ai\tree_training\images\forest_3 (3).jpg"
]

for img in images:
    print()
    print("TESTING:", os.path.basename(img))

    result = model.predict_image(path=img)

    print("TREES DETECTED:", len(result))

    name = os.path.splitext(os.path.basename(img))[0]
    safe_name = name.replace(" ", "_").replace("(", "").replace(")", "")

    plot_results(
        result,
        savedir=r"ai\tree_training",
        basename="v2_" + safe_name,
        show=False
    )

    print("RESULT SAVED:", "ai\\tree_training\\v2_" + safe_name + ".png")

print()
print("V2 VALIDATION TEST COMPLETED")
