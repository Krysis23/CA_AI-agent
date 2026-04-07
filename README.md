# CA AI Assistant (React + FastAPI) - End-to-End Guide

This project is a CA-focused AI assistant that combines:
- A React + TypeScript chat UI
- A FastAPI backend
- Gemini for reasoning and document extraction
- Ollama (`bge-m3`) for embeddings
- A hybrid RAG pipeline over ICAI chunk embeddings

This README explains the complete flow from user input to final output.

---

## 1) What this app does

- Lets users ask CA theory and tax/GST questions.
- Lets users upload financial documents (`pdf`, `png`, `jpg`, `jpeg`, `webp`).
- Uses uploaded document context + user question together for retrieval and answering.
- Returns:
  - Final answer
  - Retrieval metrics (Precision@4, Recall@4, CRAG, Judge score)
  - Retrieved chunk previews

---

## 2) Tech stack

### Frontend
- React + TypeScript + Vite
- Tailwind + shadcn UI
- Markdown rendering with `react-markdown` + `remark-gfm` (for proper table rendering)

### Backend
- FastAPI (`api.py`)
- Core CA logic (`ca_agent.py`)
- Retrieval (`search.py`)
- Metrics (`metrics.py`)
- File extraction (`file_handler.py`)

### Models / services
- Gemini (`gemini-2.5-flash`) for:
  - answer generation
  - query/data extraction
  - HyDE generation
  - evaluation metrics
- Ollama on `http://localhost:11434` with model `bge-m3` for embeddings
- Local `CrossEncoder` reranker: `cross-encoder/ms-marco-MiniLM-L-6-v2`

---

## 3) Required files and dependencies

### Python dependencies
Install from:
- `requirements.txt`

### Node dependencies
Install from:
- `package.json`

### Required embedding files (must exist in project root)
- `embeddings_foundation.joblib`
- `embeddings_Intermediate.joblib`
- `embeddings_Final.joblib`

`search.py` loads these on startup.

---

## 4) Environment variables

Create `.env` in project root:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Optional frontend env (if API host differs):

```env
VITE_API_URL=http://127.0.0.1:8000
```

If `VITE_API_URL` is not set, frontend defaults to `http://localhost:8000`.

---

## 5) Run setup (A to Z)

Open terminal in project root:

```powershell
cd "d:\college projects\CA-project-versions\final-agent-working-no-ui"
```

### Step A - Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Step B - Node dependencies

```powershell
npm install
```

### Step C - Start Ollama and pull embedding model

```powershell
ollama serve
```

In another terminal (once):

```powershell
ollama pull bge-m3
```

### Step D - Start API server

```powershell
npm run api
```

Equivalent:

```powershell
uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

### Step E - Start frontend

```powershell
npm run dev
```

Open:
- UI: `http://localhost:8080`
- API docs: `http://127.0.0.1:8000/docs`

---

## 6) Project structure (important files)

- `api.py`  
  FastAPI endpoints `/upload` and `/ask`, request orchestration.

- `ca_agent.py`  
  Query classification, extraction, tax/GST computation, final prompt rules.

- `search.py`  
  HyDE + embeddings + similarity + reranking retrieval.

- `file_handler.py`  
  Gemini Vision extraction from uploaded files.

- `metrics.py`  
  Retrieval and answer quality scoring.

- `src/contexts/ChatContext.tsx`  
  Frontend API calls and session state (`docData`, `plainFileTexts`, `history`).

- `src/components/ChatMessage.tsx`  
  AI/user message rendering (including markdown tables and metrics display).

---

## 7) End-to-end flow: user input -> output

## A) Upload flow (`POST /upload`)

1. User uploads a file in chat input.
2. Frontend sends multipart request to `/upload`.
3. Backend writes file temporarily into `temp/`.
4. Backend tries structured extraction:
   - `extract_financial_data_with_gemini(...)`
5. If structured extraction succeeds:
   - returns `doc_data`
   - returns `summary_message`
6. If structured extraction fails:
   - backend falls back to `extract_text(...)`
   - returns plain text preview + `plain_text_append`
7. Frontend saves returned data into conversation state:
   - `docData` (latest structured)
   - `plainFileTexts` (append list)
   - `uploadedDocs`
8. Backend deletes temporary file.

Result: Uploaded document context is now memory for all future question answers in that conversation.

---

## B) Ask flow (`POST /ask`)

1. User sends question text.
2. Frontend builds payload with:
   - `question`
   - `history` (last user-assistant pairs)
   - `plain_file_texts`
   - `doc_data`
3. Backend builds:
   - `doc_blob` from `doc_data` + `plain_file_texts`
   - `combined_query = question + doc_blob`
   - `memory_context` from recent chat turns
   - `final_query = combined_query + memory_context`
4. Retrieval:
   - `search_rag(combined_query, top_k=8)`
   - level sorting preference: Final -> Intermediate -> Foundation
5. Answer generation:
   - `process_query(final_query, retrieved_context, doc_data=...)`
6. Metrics:
   - `evaluate_retrieval(question, chunks, k=4)`
   - `judge_answer(question, answer)`
7. API response:
   - `answer`
   - `metrics`
   - `retrieved_chunks`
8. Frontend shows AI answer + collapsible metrics + retrieved chunks.

---

## 8) How retrieval works (`search.py`)

1. Generate HyDE paragraph from query using Gemini.
2. Embed:
   - raw query
   - HyDE paragraph
3. Hybrid query vector:
   - numeric-style query: more raw weight
   - theory-style query: more HyDE weight
4. Cosine similarity search over preloaded embedding matrix.
5. Rerank candidate chunks using cross-encoder.
6. Return top reranked chunks.

---

## 9) How answer logic works (`ca_agent.py`)

1. Detect query type (`income_tax`, `gst`, `theory`).
2. Detect calculation intent (keywords like `calculate`, `compute`, `tax payable`, etc.).
3. Extract financial data:
   - from uploaded `doc_data`, or
   - from query text if needed.
4. Important rule:
   - No tax/GST calculations unless user explicitly asks for calculation intent.
5. If calculation intent exists:
   - compute tax/GST
   - generate structured computed answer
6. If theory/concept:
   - provide conceptual response
   - avoid zero-value/irrelevant calculation blocks.
7. Markdown table formatting instructions are enforced in prompt.

---

## 10) API contracts

### `POST /upload`
Request:
- `multipart/form-data` with key: `file`

Response (success):

```json
{
  "doc_item": { "filename": "file.pdf", "doc_data": {} },
  "doc_data": {},
  "plain_text_append": null,
  "warning": null,
  "summary_message": "..."
}
```

or (plain text fallback):

```json
{
  "doc_item": { "filename": "file.pdf", "plain_text": "..." },
  "doc_data": null,
  "plain_text_append": "...",
  "warning": "Could not extract structured data from file.pdf.",
  "summary_message": "..."
}
```

### `POST /ask`
Request:

```json
{
  "question": "Compute tax liability...",
  "history": [{ "user": "...", "assistant": "..." }],
  "plain_file_texts": ["..."],
  "doc_data": {}
}
```

Response:

```json
{
  "answer": "...",
  "metrics": {
    "precision_at_4": 0.0,
    "recall_at_4": 0.0,
    "crag_status": "AMBIGUOUS",
    "crag_score": 0.0,
    "crag_action": "...",
    "chunk_scores": [2,1,0,0],
    "judge_score": 4,
    "judge_reason": "..."
  },
  "retrieved_chunks": [
    { "level": "final", "book": "book", "chunk_id": 12, "text": "..." }
  ]
}
```

---

## 11) Troubleshooting

- API not starting:
  - ensure venv active
  - `pip install -r requirements.txt`
  - check `.env` has `GEMINI_API_KEY`

- Retrieval errors:
  - Ollama must be running
  - model `bge-m3` must exist
  - embedding `.joblib` files must exist in root

- Frontend cannot call API:
  - backend must run on `127.0.0.1:8000`
  - set `VITE_API_URL` if needed

- Table output looks broken:
  - `remark-gfm` is installed
  - restart `npm run dev` after dependency changes

- Wrong / off-topic theory chunks:
  - retrieval quality depends on embedding corpus and query wording
  - check returned `retrieved_chunks` and metrics panel for diagnosis

---

## 12) Useful commands

### Frontend

```powershell
npm run dev
npm run build
npm run test
```

### Backend

```powershell
npm run api
python -m py_compile api.py
python -m py_compile ca_agent.py
```

### Embeddings

```powershell
python create_embeddings.py
```

---

## 13) Notes

- Chat/document state is stored per user in browser localStorage via `ChatContext`.
- Uploaded file bytes are temporary; extracted structured/plain context is persisted in conversation state.
- CORS is currently open (`allow_origins=["*"]`) for local development.

---

If you want, I can also add:
- a deployment README (Windows/Linux server steps),
- a one-click `run_all` script to start API + UI together,
- and sample test payloads for `/ask` and `/upload`.
