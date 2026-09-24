from pathlib import Path
import subprocess
import json
import tempfile

start = '@app.get("/api/tree-detection/status")'
text = Path("main.py").read_text(encoding="utf-8")
start_index = text.find(start)

if start_index == -1:
    raise SystemExit("Tree detection endpoint not found.")

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

TREE_HELPER = (
    Path(__file__).resolve().parent
    / "ai"
    / "tree_training"
    / "run_uploaded_tree_detection.py"
)


@app.get("/api/tree-detection/status")
def tree_detection_status():
    available = (
        TREE_MODEL_PATH.exists()
        and DEEPFOREST_PYTHON.exists()
        and TREE_HELPER.exists()
    )

    return {
        "available": available,
        "status": "ready" if available else "model_missing",
        "model": "DeepForest V2",
        "model_file": TREE_MODEL_PATH.name,
        "message": (
            "Experimental AI tree detection is ready."
            if available
            else "DeepForest V2 files are missing."
        ),
    }


@app.post("/api/tree-detection")
async def tree_detection(image: UploadFile = File(...)):

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
            detail="Please upload a JPG, PNG, TIFF, or WEBP image.",
        )

    if not TREE_MODEL_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="DeepForest V2 model is missing.",
        )

    temp_path = None

    try:
        data = await image.read()

        if not data:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty.",
            )

        suffix = Path(image.filename or "forest.jpg").suffix or ".jpg"

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as tmp:
            tmp.write(data)
            temp_path = tmp.name

        process = subprocess.run(
            [
                str(DEEPFOREST_PYTHON),
                str(TREE_HELPER),
                temp_path,
                str(TREE_MODEL_PATH),
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )

        if process.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail="Tree detection process failed: " + process.stderr[-1000:],
            )

        output = process.stdout.strip()

        # Find the JSON result even if another line appears.
        tree_count = None

        for line in output.splitlines():
            line = line.strip()

            if line.startswith("{") and line.endswith("}"):
                try:
                    parsed = json.loads(line)

                    if "tree_count" in parsed:
                        tree_count = int(parsed["tree_count"])
                        break

                except Exception:
                    pass

        if tree_count is None:
            raise HTTPException(
                status_code=500,
                detail="Tree detector returned no tree count.",
            )

        return {
            "success": True,
            "model": "DeepForest V2",
            "model_file": TREE_MODEL_PATH.name,
            "tree_count": tree_count,
            "experimental": True,
            "message": (
                "Experimental AI tree detection completed successfully."
            ),
        }

    except HTTPException:
        raise

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="Tree detection timed out after 180 seconds.",
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Tree detection error: {str(exc)}",
        )

    finally:
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except Exception:
                pass
'''

Path("main.py").write_text(
    text[:start_index] + new_section + "\n",
    encoding="utf-8"
)

print("TREE API FIXED")
