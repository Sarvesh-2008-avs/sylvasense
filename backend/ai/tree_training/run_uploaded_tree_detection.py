import sys
import json
import contextlib
import io

image_path = sys.argv[1]
model_path = sys.argv[2]

# Capture ALL DeepForest/PyTorch startup output.
captured = io.StringIO()

with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
    from deepforest import main

    model = main.deepforest.load_from_checkpoint(model_path)
    prediction = model.predict_image(path=image_path)

# Only JSON goes to stdout.
print(json.dumps({
    "tree_count": int(len(prediction))
}))
