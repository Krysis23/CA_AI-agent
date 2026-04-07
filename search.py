import joblib
import numpy as np
import requests
import re
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import CrossEncoder
import google.generativeai as genai
import os
from dotenv import load_dotenv
import pandas as pd

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini = genai.GenerativeModel("gemini-2.5-flash")

FOUNDATION_DF = joblib.load("embeddings_foundation.joblib")
INTER_DF      = joblib.load("embeddings_Intermediate.joblib")
FINAL_DF      = joblib.load("embeddings_Final.joblib")

ALL_DF  = pd.concat([FOUNDATION_DF, INTER_DF, FINAL_DF], ignore_index=True)
VECTORS = np.vstack(ALL_DF["embedding"].values)

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")


def clean_text(text):
    """
    Sanitize text before sending to Ollama embedding.
    Removes NaN, None, non-ASCII characters and limits length.
    """
    if not text:
        return ""

    text = str(text)

    # Remove NaN / None string literals that cause JSON crash in Ollama
    text = text.replace("NaN", "")
    text = text.replace("nan", "")
    text = text.replace("None", "")
    text = text.replace("null", "")

    # Remove non-ASCII / garbled OCR characters
    text = re.sub(r"[^\x00-\x7F]+", " ", text)

    # Collapse multiple spaces
    text = re.sub(r"\s+", " ", text).strip()

    # Hard limit for Ollama
    return text[:2000]


def hypothetical_document(query):
    prompt = f"""
You are a CA expert and ICAI textbook author.
Write a 100-word paragraph exactly as it would appear in an ICAI textbook
that directly answers this question:

{query}

Rules:
- Use formal ICAI language
- Use proper section numbers if relevant
- Preserve ALL numerical values exactly
- Do NOT remove numbers
- Write ONLY the paragraph
"""
    return gemini.generate_content(prompt).text.strip()


def embed(text):
    """Embed text using Ollama bge-m3. Always cleans input first."""
    text = clean_text(text)

    if not text:
        raise Exception("embed() received empty text after cleaning")

    r = requests.post("http://localhost:11434/api/embeddings", json={
        "model": "bge-m3",
        "prompt": text
    })

    data = r.json()
    if "embedding" not in data:
        raise Exception(f"Embedding failed: {data}")

    return data["embedding"]


def rerank(query, chunks_df, top_n=4):
    pairs  = [[query, text] for text in chunks_df["text"].values]
    scores = reranker.predict(pairs)

    chunks_df = chunks_df.copy()
    chunks_df["rerank_score"] = scores

    return chunks_df.sort_values("rerank_score", ascending=False).head(top_n)


def is_numeric_query(q):
    return any(k in q.lower() for k in [
        "tax", "80c", "80d", "income", "salary",
        "gst", "compute", "calculate"
    ])


def search_rag(question, top_k=8, top_n=4):
    """
    question — pass ONLY the clean user question here.
               Never pass final_query (which contains memory/OCR text).
               Memory context is only for process_query(), not retrieval.
    """
    print("\n[Hybrid] Starting retrieval...")

    # Step 1 — HyDE
    hypothetical = hypothetical_document(question)
    print(f"[HyDE] {hypothetical[:100]}...")

    # Step 2 — Embed both (clean_text is called inside embed())
    raw_vec  = np.array(embed(question))
    hyde_vec = np.array(embed(hypothetical))

    # Step 3 — Smart hybrid weighting
    if is_numeric_query(question):
        print("[Mode] Numeric Query → RAW priority")
        q_vec = (0.8 * raw_vec) + (0.2 * hyde_vec)
    else:
        print("[Mode] Theory Query → HyDE priority")
        q_vec = (0.4 * raw_vec) + (0.6 * hyde_vec)

    # Step 4 — Cosine similarity
    sims    = cosine_similarity(VECTORS, [q_vec]).flatten()
    top_idx = sims.argsort()[::-1][:top_k]

    candidates               = ALL_DF.iloc[top_idx].copy()
    candidates["similarity"] = sims[top_idx]

    print(f"\n[Retrieval] Top {top_k}:")
    print(candidates[["level", "book", "chunk_id", "similarity"]])

    # Step 5 — Rerank
    reranked = rerank(question, candidates, top_n=top_n)

    print(f"\n[Reranker] Top {top_n}:")
    print(reranked[["level", "book", "chunk_id", "rerank_score"]])

    return reranked