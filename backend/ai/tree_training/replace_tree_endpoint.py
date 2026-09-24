from pathlib import Path
import subprocess
import sys
import tempfile

# Replace the existing tree-detection endpoint with the trained
# DeepForest V2 prototype.

start = '@app.get("/api/tree-detection/status")'
text = Path("main.py").read_text(encoding="utf-8")

start_index = text.find(start)

if start_index == -1:
    raise SystemExit("Could not find tree detection section.")

new_section = r'''TREE_MODEL_PATH = (
    Path(__file__).resolve().parent
    / "ai"
    / "tree_training"
    / "trained_tree_model_v2.ckpt"
)

DEEPFOREST_PYTHON = (
    Path(__file__).resolve().parent
    / ".venv-deepforest"
    / "Scripts"
    / "python.exe"
)


@app.get("/api/tree-detection/status")
def tree_detection_status():
    """Report whether the experimental DeepForest tree model is installed."""

    available = TREE_MODEL_PATH.exists() and DEEPFOREST_PYTHON.exists()

    if available:
        return {
            "available": True,
            "status": "ready",
            "model": "DeepForest V2",
            "model_file": TREE_MODEL_PATH.name,
            "message": (
                "Experimental tree detection model is installed and ready."
            ),
        }

    return {
        "available": False,
        "status": "model_missing",
        "model": "DeepForest V2",
        "message": "DeepForest V2 model is not available.",
    }


@app.post("/api/tree-detection")
async def tree_detection(image: UploadFile = File(...)):
    """Run experimental DeepForest V2 tree detection."""

    if not TREE_MODEL_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="DeepForest V2 model file is missing."
        )

    if not DEEPFOREST_PYTHON.exists():
        raise HTTPException(
            status_code=503,
            detail="DeepForest environment is missing."
        )

    allowed = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/tiff",
        "image/webp",
    }

    if image.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Please upload a JPG, PNG, TIFF, or WEBP forest image.",
        )

    suffix = Path(image.filename or "forest.jpg").suffix or ".jpg"
    temp_path = None

    try:
        data = await image.read()

        if not data:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as tmp:
            tmp.write(data)
            temp_path = tmp.name

        helper_script = (
            Path(__file__).resolve().parent
            / "ai"
            / "tree_training"
            / "run_uploaded_tree_detection.py"
        )

        command = [
            str(DEEPFOREST_PYTHON),
            str(helper_script),
            temp_path,
            str(TREE_MODEL_PATH),
        ]

        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=180,
        )

        if process.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=(
                    "DeepForest detection failed: "
                    + process.stderr[-2000:]
                ),
            )

        output = process.stdout.strip()

        try:
            import json
            result = json.loads(output)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="DeepForest returned an invalid result."
            )

        return {
            "success": True,
            "model": "DeepForest V2",
            "model_file": TREE_MODEL_PATH.name,
            "tree_count": int(result.get("tree_count", 0)),
            "message": (
                "Experimental AI tree detection completed. "
                "Results are prototype-level and should not be treated "
                "as production-accurate tree counts."
            ),
            "experimental": True,
        }

    finally:
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except Exception:
                pass
'''

# Keep anything that comes before the tree section.
text = text[:start_index] + new_section + "\n"

Path("main.py").write_text(text, encoding="utf-8")

print("TREE DETECTION ENDPOINT UPDATED")
