"""
FastAPI backend:
- /upload: Gemini vision extraction (structured or plain text), no bogus RAG on full file
- /ask: User question + uploaded file context (structured + plain extracts) are combined for
  RAG and for the LLM; recent chat turns are appended separately for memory.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from search import search_rag
from ca_agent import process_query
from file_handler import extract_financial_data_with_gemini, extract_text
from metrics import evaluate_retrieval, judge_answer

app = FastAPI(title="CA AI Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "temp"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Cap sizes so HyDE / embeddings stay usable while file + question stay together.
MAX_DOCUMENT_CONTEXT_CHARS = 3200
MAX_COMBINED_QUERY_CHARS = 4000
MAX_FINAL_QUERY_CHARS = 5500


class HistoryTurn(BaseModel):
    user: str
    assistant: str


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    history: list[HistoryTurn] = Field(default_factory=list)
    plain_file_texts: list[str] = Field(default_factory=list)
    doc_data: Optional[dict[str, Any]] = None


def build_memory(history: list[HistoryTurn]) -> str:
    """Last few chat turns only — file text lives in build_document_context."""
    return "\n".join(
        f"User: {t.user}\nAI: {t.assistant}" for t in history[-3:]
    ).strip()


def build_document_context(
    doc_data: Optional[dict[str, Any]],
    plain_file_texts: list[str],
) -> str:
    """
    Single blob combining everything extracted from uploaded file(s).
    Used together with the user's question for RAG and for the LLM prompt.
    """
    parts: list[str] = []
    if doc_data:
        parts.append(
            "[Uploaded document — structured]\n"
            + format_structured_doc_summary(doc_data)
        )
    if plain_file_texts:
        blob = "\n\n".join(t.strip() for t in plain_file_texts if t and str(t).strip())
        if blob:
            parts.append("[Uploaded document — extracted text]\n" + blob)
    joined = "\n\n".join(parts).strip()
    return joined[:MAX_DOCUMENT_CONTEXT_CHARS] if joined else ""


def combine_question_and_uploads(user_text: str, doc_blob: str) -> str:
    if not doc_blob:
        return user_text.strip()
    return (user_text.strip() + "\n\n" + doc_blob).strip()[:MAX_COMBINED_QUERY_CHARS]


def chunks_to_preview_records(chunks: pd.DataFrame, text_limit: int = 300) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for _, row in chunks.iterrows():
        cid = row.get("chunk_id", 0)
        try:
            cid = int(cid)
        except (TypeError, ValueError):
            cid = 0
        txt = row.get("text", "") or ""
        out.append({
            "level": str(row.get("level", "") or ""),
            "book": str(row.get("book", "") or ""),
            "chunk_id": cid,
            "text": txt[:text_limit],
        })
    return out


def format_structured_doc_summary(doc_data: dict[str, Any]) -> str:
    dt = str(doc_data.get("document_type", "document") or "document").replace("_", " ").title()
    lines: list[str] = [
        f"### {dt}",
        "",
        f"- **Person/Entity:** {doc_data.get('person_name', 'N/A')}",
        f"- **Period:** {doc_data.get('period', 'N/A')}",
        f"- **Summary:** {doc_data.get('raw_text_summary', 'N/A')}",
        "",
    ]
    income = doc_data.get("income") or {}
    if isinstance(income, dict):
        income_items = {k: v for k, v in income.items() if isinstance(v, (int, float)) and v > 0}
        if income_items:
            lines.append("**Income**")
            for k, v in income_items.items():
                lines.append(f"- {str(k).replace('_', ' ').title()}: ₹{v:,.2f}")
            lines.append("")
    deductions = doc_data.get("deductions") or {}
    if isinstance(deductions, dict):
        ded_items = {k: v for k, v in deductions.items() if isinstance(v, (int, float)) and v > 0}
        if ded_items:
            lines.append("**Deductions**")
            for k, v in ded_items.items():
                lines.append(f"- {str(k).upper()}: ₹{v:,.2f}")
            lines.append("")
    gst = doc_data.get("gst") or {}
    if isinstance(gst, dict):
        if gst.get("output_tax", 0) > 0 or gst.get("input_tax", 0) > 0:
            lines.extend([
                "**GST**",
                f"- Output tax: ₹{gst.get('output_tax', 0):,.2f}",
                f"- Input tax: ₹{gst.get('input_tax', 0):,.2f}",
                f"- Net payable: ₹{gst.get('net_payable', 0):,.2f}",
                "",
            ])
    bank = doc_data.get("bank") or {}
    if isinstance(bank, dict):
        if bank.get("total_credits", 0) > 0 or bank.get("total_debits", 0) > 0:
            lines.extend([
                "**Bank summary**",
                f"- Opening balance: ₹{bank.get('opening_balance', 0):,.2f}",
                f"- Total credits: ₹{bank.get('total_credits', 0):,.2f}",
                f"- Total debits: ₹{bank.get('total_debits', 0):,.2f}",
                "",
            ])
    return "\n".join(lines).strip()


@app.post("/ask")
async def ask(body: AskRequest):
    user_text = body.question.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Empty question")

    doc_blob = build_document_context(body.doc_data, body.plain_file_texts)
    combined_query = combine_question_and_uploads(user_text, doc_blob)
    memory_context = build_memory(body.history)
    final_query = (combined_query + ("\n\n" + memory_context if memory_context else "")).strip()
    final_query = final_query[:MAX_FINAL_QUERY_CHARS]

    try:
        chunks = search_rag(combined_query, top_k=8)

        level_order = {"final": 0, "intermediate": 1, "foundation": 2}
        if "level" in chunks.columns:
            chunks = chunks.copy()
            chunks["level_rank"] = chunks["level"].map(level_order)
            chunks = chunks.sort_values(
                by=["level_rank", "rerank_score"],
                ascending=[True, False],
            )

        retrieved_context = chunks.to_json(orient="records")
        answer = process_query(
            final_query,
            retrieved_context,
            doc_data=body.doc_data,
        )

        retrieval = evaluate_retrieval(user_text, chunks, k=4)
        judge = judge_answer(user_text, answer)

        metrics = {
            "precision_at_4": retrieval["precision_at_k"],
            "recall_at_4": retrieval["recall_at_k"],
            "crag_status": retrieval["crag_status"],
            "crag_score": retrieval["crag_score"],
            "crag_action": retrieval["crag_action"],
            "chunk_scores": retrieval["chunk_scores"],
            "judge_score": judge["score"],
            "judge_reason": judge["reason"],
        }

        return {
            "answer": answer,
            "metrics": metrics,
            "retrieved_chunks": chunks_to_preview_records(chunks),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower() or ".bin"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_FOLDER, safe_name)

    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        display_name = Path(file.filename or "document").name

        ext_l = ext.lstrip(".").lower()
        if ext_l not in ("pdf", "png", "jpg", "jpeg", "webp"):
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Use pdf, png, jpg, jpeg, or webp.",
            )

        doc_data = extract_financial_data_with_gemini(file_path)

        if doc_data:
            summary = format_structured_doc_summary(doc_data)
            return {
                "doc_item": {"filename": display_name, "doc_data": doc_data},
                "doc_data": doc_data,
                "plain_text_append": None,
                "warning": None,
                "summary_message": summary,
            }

        text = extract_text(file_path)
        if text.strip():
            preview = text[:3000]
            summary = (
                "Structured extraction was not available for this document. "
                "Plain text was captured for context in chat.\n\n"
                f"```\n{preview}\n```"
            )
            return {
                "doc_item": {"filename": display_name, "plain_text": preview},
                "doc_data": None,
                "plain_text_append": text,
                "warning": f"Could not extract structured data from {display_name}.",
                "summary_message": summary,
            }

        raise HTTPException(
            status_code=422,
            detail=f"Could not read any content from {display_name}.",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        try:
            os.remove(file_path)
        except OSError:
            pass
