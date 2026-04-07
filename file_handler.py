import base64
import json
import re
import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
vision_model = genai.GenerativeModel("gemini-2.5-flash")


def read_as_base64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def get_mime_type(path):
    ext = path.split(".")[-1].lower()
    return {
        "pdf":  "application/pdf",
        "png":  "image/png",
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
    }.get(ext, "image/jpeg")


def extract_financial_data_with_gemini(path):
    """
    Use Gemini Vision to extract structured financial data
    from ANY document — bank statement, salary slip,
    form 16, invoice, balance sheet, P&L etc.
    """
    data = read_as_base64(path)
    mime = get_mime_type(path)

    prompt = """
You are a Chartered Accountant analyzing a financial document.

Carefully read this document and extract ALL financial data visible.

Return ONLY a valid JSON object with these fields
(use 0 if not found, do NOT leave any field out):

{
  "document_type": "bank_statement | salary_slip | form16 | invoice | balance_sheet | profit_loss | other",
  "person_name": "",
  "period": "",

  "income": {
    "salary": 0,
    "business_income": 0,
    "house_property": 0,
    "rental_income": 0,
    "interest_income": 0,
    "other_income": 0,
    "total_income": 0
  },

  "deductions": {
    "80c": 0,
    "80d": 0,
    "80e": 0,
    "standard_deduction": 0,
    "hra": 0,
    "other": 0
  },

  "gst": {
    "output_tax": 0,
    "input_tax": 0,
    "net_payable": 0
  },

  "bank": {
    "opening_balance": 0,
    "closing_balance": 0,
    "total_credits": 0,
    "total_debits": 0,
    "transactions": []
  },

  "raw_text_summary": "brief summary of what this document contains"
}

STRICT RULES:
- Return ONLY JSON, no markdown, no explanation
- All amounts must be numbers (not strings)
- For bank statements: populate the bank section and transactions
- For salary slips / Form 16: populate income and deductions
- For GST invoices: populate gst section
- transactions array format: [{"date": "", "description": "", "amount": 0, "type": "credit/debit", "category": ""}]
- If balance decreases after transaction → type is debit
- If balance increases after transaction → type is credit

also keep the text color to black. rest format as it is.
"""

    response = vision_model.generate_content([
        {"mime_type": mime, "data": data},
        prompt
    ])

    text = response.text.strip()
    text = re.sub(r"```json|```", "", text).strip()

    try:
        return json.loads(text)
    except Exception as e:
        print("[file_handler] Gemini parse error:", e)
        print("[file_handler] Raw response:", text[:500])
        return None


def extract_text(path):
    """
    Plain text extraction using Gemini Vision.
    Used for non-financial docs like question papers, notes etc.
    No Tesseract, no pdfplumber — pure Gemini.
    """
    data = read_as_base64(path)
    mime = get_mime_type(path)

    prompt = """
Extract ALL text from this document exactly as it appears.
Preserve formatting, numbers, tables, and structure as much as possible.
Return only the extracted text, nothing else.also keep the text color to black. rest format as it is.
"""

    response = vision_model.generate_content([
        {"mime_type": mime, "data": data},
        prompt
    ])

    return response.text.strip()