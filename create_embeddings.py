import os
import json
import requests
import pandas as pd
import joblib

BASE_FOLDER = "json_chunks/Final"
OUTPUT_FILE = "embeddings_Final.joblib"

rows = []

def embed(text):
    r = requests.post("http://localhost:11434/api/embeddings", json={
        "model": "bge-m3",
        "prompt": text
    })
    data = r.json()

    if "embedding" not in data:
        raise Exception("Embedding failed: " + str(data))

    return data["embedding"]

print("Building Embeddings...")

for file in os.listdir(BASE_FOLDER):
    if not file.endswith(".json"):
        continue

    path = os.path.join(BASE_FOLDER, file)
    print("Processing:", file)

    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    
    total = len(data)

    for i, c in enumerate(data, 1):
        print(f"Embedding {i}/{total} from {file}", flush=True)
        vector = embed(c["text"]) 

        rows.append({
            "level": "Intermediate",
            "paper": c.get("paper", file.replace(".json", "")),
            "book": c["book"],
            "chunk_id": c["chunk_id"],
            "text": c["text"],
            "embedding": vector
        })

df = pd.DataFrame(rows)
joblib.dump(df, OUTPUT_FILE)

print("\nSaved vector database as:", OUTPUT_FILE)
print("Total chunks:", len(df))
