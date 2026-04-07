"""
metrics.py
──────────
Key fix: chunks are scored ONCE and reused across
Precision@K, Recall@K, and CRAG — so results are consistent.
"""

import json
import re
import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")


# ═══════════════════════════════════════════════════════════════════
# CORE — Score ALL chunks in one Gemini call
# ═══════════════════════════════════════════════════════════════════

def score_chunks(question, chunks_df):
    """
    Scores all chunks in a SINGLE Gemini call.
    Returns a list of scores [2, 1, 0, ...] in same order as chunks_df.

    Called once — reused by precision, recall, and CRAG.
    This ensures all 3 metrics are consistent with each other.
    """

    chunks_text = ""
    for i, (_, row) in enumerate(chunks_df.iterrows()):
        chunks_text += f"\nChunk {i+1}:\n{row['text'][:300]}\n"

    prompt = f"""
You are evaluating a retrieval system for CA (Chartered Accountancy) exams.

Question: {question}

Retrieved Chunks:
{chunks_text}

Score EACH chunk for relevance to the question.
Reply ONLY with a valid JSON array, one score per chunk:
[2, 1, 0, 1]

Scoring:
2 = directly relevant — chunk directly answers or is essential to the question
1 = partially relevant — chunk is related but doesn't directly answer
0 = not relevant — chunk is unrelated to the question

Rules:
- Return ONLY the JSON array
- Array length must match number of chunks exactly
- No explanation, no markdown
"""

    response = None
    try:
        response = model.generate_content(prompt)
        text     = response.text.strip()
        text     = re.sub(r"```json|```", "", text).strip()

        scores = json.loads(text)

        # Validate — must be list of ints, same length as chunks
        if not isinstance(scores, list):
            raise ValueError("Not a list")

        scores = [int(s) if s in [0, 1, 2] else 0 for s in scores]

        # Pad or trim to match chunk count
        n = len(chunks_df)
        if len(scores) < n:
            scores += [0] * (n - len(scores))
        scores = scores[:n]

        return scores

    except Exception as e:
        print(f"[metrics] score_chunks failed: {e}")
        if response and getattr(response, "text", None):
            print(f"[metrics] raw response: {response.text[:200]}")
        # Fallback — return 0 for all
        return [0] * len(chunks_df)


# ═══════════════════════════════════════════════════════════════════
# MAIN ENTRY — Compute all retrieval metrics at once
# ═══════════════════════════════════════════════════════════════════

def evaluate_retrieval(question, chunks_df, k=4):
    """
    Single function that computes Precision@K, Recall@K, and CRAG
    using ONE Gemini call for chunk scoring.

    Returns a dict with all metrics.
    """
    scores = score_chunks(question, chunks_df)

    top_scores = scores[:k]
    relevant   = sum(1 for s in top_scores if s >= 1)
    high       = sum(1 for s in top_scores if s == 2)
    partial    = sum(1 for s in top_scores if s == 1)

    # Precision@K
    precision = relevant / k if k > 0 else 0.0

    # Recall@K — estimate total relevant as relevant_found * 1.5
    total_relevant = max(relevant, int(relevant * 1.5)) if relevant > 0 else 1
    recall         = relevant / total_relevant

    # CRAG
    if high >= 1:
        crag_status = "CORRECT"
        crag_action = "Good context found — answer should be reliable"
    elif partial >= 1:
        crag_status = "AMBIGUOUS"
        crag_action = "Partial context — answer may be incomplete"
    else:
        crag_status = "INCORRECT"
        crag_action = "No relevant chunks found — answer may be unreliable"

    crag_numeric = (high * 2 + partial) / (k * 2) if k > 0 else 0.0

    return {
        "precision_at_k": round(precision, 3),
        "recall_at_k":    round(recall, 3),
        "crag_status":    crag_status,
        "crag_score":     round(crag_numeric, 3),
        "crag_action":    crag_action,
        "chunk_scores":   scores,
        "high":           high,
        "partial":        partial,
        "irrelevant":     sum(1 for s in top_scores if s == 0),
    }


# ═══════════════════════════════════════════════════════════════════
# Kept for compatibility — internally use evaluate_retrieval
# ═══════════════════════════════════════════════════════════════════

def precision_at_k(question, chunks_df, k=4, **kwargs):
    result = evaluate_retrieval(question, chunks_df, k=k)
    return {"precision_at_k": result["precision_at_k"], "k": k}

def recall_at_k(question, chunks_df, k=4, **kwargs):
    result = evaluate_retrieval(question, chunks_df, k=k)
    return {"recall_at_k": result["recall_at_k"], "k": k}

def crag_score(question, chunks_df, **kwargs):
    result = evaluate_retrieval(question, chunks_df)
    return {
        "crag_status": result["crag_status"],
        "crag_score":  result["crag_score"],
        "action":      result["crag_action"],
    }


# ═══════════════════════════════════════════════════════════════════
# LLM JUDGE — Answer quality
# ═══════════════════════════════════════════════════════════════════

def judge_answer(question, answer):
    prompt = f"""
You are a senior CA examiner evaluating a student's answer.

Question: {question}

Answer:
{answer[:1500]}

Rate this answer from 1 to 5.
Reply ONLY with this exact JSON format:
{{"score": 4, "reason": "brief one line reason"}}

Scoring guide:
5 = Complete, accurate, proper section references
4 = Mostly correct with minor gaps
3 = Partially correct, key points present
2 = Mostly incomplete or incorrect
1 = Wrong or irrelevant
"""
    response = None
    try:
        response = model.generate_content(prompt)
        text     = response.text.strip()
        text     = re.sub(r"```json|```", "", text).strip()

        # Handle case where Gemini wraps in extra text
        # Find the JSON object within the response
        match = re.search(r'\{.*?\}', text, re.DOTALL)
        if match:
            text = match.group(0)

        parsed = json.loads(text)
        score  = int(parsed.get("score", 1))
        reason = str(parsed.get("reason", ""))
        score  = max(1, min(5, score))

        return {"score": score, "reason": reason}

    except Exception as e:
        print(f"[metrics] judge_answer failed: {e}")
        # Last resort fallback — scan for digit 1-5
        try:
            if response and getattr(response, "text", None):
                for ch in response.text:
                    if ch in ["1", "2", "3", "4", "5"]:
                        return {"score": int(ch), "reason": "score extracted from response"}
        except Exception:
            pass
        return {"score": 1, "reason": "Could not parse judge response"}