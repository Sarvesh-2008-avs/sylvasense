from pathlib import Path

p = Path("main.py")
text = p.read_text(encoding="utf-8")

marker = 'TREE_MODEL_PATH = ('

if marker not in text:
    raise SystemExit("TREE_MODEL_PATH not found")

insert = '''TREE_MODEL_PATH = (
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
'''

start = text.find(marker)

# Find the existing TREE_MODEL_PATH/TREE_HELPER block
end_marker = '@app.get("/api/tree-detection/status")'
end = text.find(end_marker, start)

if end == -1:
    raise SystemExit("Tree detection status endpoint not found")

text = text[:start] + insert + "\n\n" + text[end:]

p.write_text(text, encoding="utf-8")

print("DEEPFOREST PYTHON PATH FIXED")
