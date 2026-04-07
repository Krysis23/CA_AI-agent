import json
import re
import google.generativeai as genai
from dotenv import load_dotenv
import os

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")




def detect_query_type(query):
    q = query.lower()
    if any(k in q for k in ["gst", "input tax credit", "output tax"]):
        return "gst"
    elif any(k in q for k in ["tax", "80c", "80d", "income", "salary"]):
        return "income_tax"
    else:
        return "theory"


def has_calculation_intent(query):
    q = query.lower()
    calc_keywords = [
        "calculate", "calculation", "compute", "work out",
        "tax payable", "how much tax", "net gst", "liability",
        "show working", "step by step", "numerical", "solve",
    ]
    return any(k in q for k in calc_keywords)


def detect_tax_regime(query):
    q = query.lower()
    if "new regime" in q:
        return "new"
    return "old"




def safe(x):
    return x if isinstance(x, (int, float)) else 0




def calculate_tax(data, regime="old"):
    income = (
        safe(data.get("salary"))
        + safe(data.get("house_property"))
        + safe(data.get("business_income"))
        + safe(data.get("unexplained_income"))
    )

    if regime == "old":
        d80c               = min(safe(data.get("80c")), 150000)
        d80d_self          = min(safe(data.get("80d")), 25000)
        d80d_parents       = min(safe(data.get("80d_parents", 0)), 50000)  # senior citizen limit
        standard_deduction = 50000

        taxable_income = max(
            0,
            income
            - d80c
            - d80d_self
            - d80d_parents
            - standard_deduction
            + safe(data.get("house_property_loss", 0))   # house property loss is negative
        )

        if taxable_income <= 250000:
            tax = 0
        elif taxable_income <= 500000:
            tax = (taxable_income - 250000) * 0.05
        elif taxable_income <= 1000000:
            tax = (250000 * 0.05) + (taxable_income - 500000) * 0.20
        else:
            tax = (250000 * 0.05) + (500000 * 0.20) + (taxable_income - 1000000) * 0.30

        
        if taxable_income <= 500000:
            tax = 0

        
        surcharge = 0
        if taxable_income > 5000000:
            surcharge = tax * 0.10
        if taxable_income > 10000000:
            surcharge = tax * 0.15
        if taxable_income > 20000000:
            surcharge = tax * 0.25
        if taxable_income > 50000000:
            surcharge = tax * 0.37

        tax += surcharge

    else:  
        taxable_income = income

        if taxable_income <= 300000:
            tax = 0
        elif taxable_income <= 600000:
            tax = (taxable_income - 300000) * 0.05
        elif taxable_income <= 900000:
            tax = (300000 * 0.05) + (taxable_income - 600000) * 0.10
        elif taxable_income <= 1200000:
            tax = (300000 * 0.05) + (300000 * 0.10) + (taxable_income - 900000) * 0.15
        elif taxable_income <= 1500000:
            tax = (300000 * 0.05) + (300000 * 0.10) + (300000 * 0.15) + (taxable_income - 1200000) * 0.20
        else:
            tax = (
                (300000 * 0.05)
                + (300000 * 0.10)
                + (300000 * 0.15)
                + (300000 * 0.20)
                + (taxable_income - 1500000) * 0.30
            )

        
        if taxable_income <= 1200000:
            tax = 0

       
        surcharge = 0
        if taxable_income > 5000000:
            surcharge = tax * 0.10
        if taxable_income > 10000000:
            surcharge = tax * 0.15
        if taxable_income > 20000000:
            surcharge = tax * 0.25

        tax += surcharge

    cess = tax * 0.04

    return {
        "income":         income,
        "taxable_income": taxable_income,
        "tax":            round(tax, 2),
        "cess":           round(cess, 2),
        "total_tax":      round(tax + cess, 2),
    }




def calculate_gst(data):
    output_tax = safe(data.get("output_tax"))
    input_tax  = safe(data.get("input_tax"))

    return {
        "output_tax":      output_tax,
        "input_tax":       input_tax,
        "net_gst_payable": max(0, output_tax - input_tax),
    }




def clean_data(data):
    for key in data:
        if data[key] is None:
            data[key] = 0
    return data


def extract_data(query):
    query = query[:2000]

    prompt = f"""
Extract financial data from the query.
Return ONLY valid JSON, no markdown, no explanation.

Extract ALL relevant financial signals visible in the query.
Do not restrict to only common fields.

Return keys (use 0 if missing):
- salary
- business_income
- house_property
- house_property_loss
- unexplained_income
- other_income
- total_credits
- total_debits
- additional_info_amount
- 80c
- 80d
- 80d_parents
- output_tax
- input_tax

Query:
{query}
"""
    response = model.generate_content(prompt)
    text     = response.text.strip()
    text     = re.sub(r"```json|```", "", text).strip()

    try:
        data = json.loads(text)
        return clean_data(data)
    except Exception:
        print("Extraction Error:", text)
        return {}


def extract_data_from_document(gemini_doc_data):
    """
    Convert Gemini Vision extracted document data
    into the format calculate_tax() / calculate_gst() expects.
    gemini_doc_data is the JSON returned by file_handler.extract_financial_data_with_gemini()
    """
    if not gemini_doc_data:
        return {}

    income     = gemini_doc_data.get("income", {})
    deductions = gemini_doc_data.get("deductions", {})
    gst        = gemini_doc_data.get("gst", {})
    bank       = gemini_doc_data.get("bank", {})

    return {
        "salary":              safe(income.get("salary", 0)),
        "business_income":     safe(income.get("business_income", 0))
                               + safe(income.get("other_income", 0)),
        "house_property":      safe(income.get("rental_income", 0)),
        "house_property_loss": safe(income.get("house_property", 0)),  # negative HP income = loss
        "unexplained_income":  0,
        "other_income":        safe(income.get("other_income", 0)),
        "80c":                 safe(deductions.get("80c", 0)),
        "80d":                 safe(deductions.get("80d", 0)),
        "80d_parents":         0,  
        "output_tax":          safe(gst.get("output_tax", 0)),
        "input_tax":           safe(gst.get("input_tax", 0)),
        
        "total_credits":       safe(bank.get("total_credits", 0)),
        "total_debits":        safe(bank.get("total_debits", 0)),
        "transactions":        bank.get("transactions", []),
        "document_type":       gemini_doc_data.get("document_type", "other"),
        "person_name":         gemini_doc_data.get("person_name", ""),
        "period":              gemini_doc_data.get("period", ""),
        "raw_text_summary":    gemini_doc_data.get("raw_text_summary", ""),
    }




def process_query(query, retrieved_context, doc_data=None):
    """
    query            — user's question
    retrieved_context — ICAI chunks from search_rag()
    doc_data         — optional: structured data from Gemini Vision
                       (passed when user uploaded a financial document)
    """

    user_query = query.split("\n")[0]
    query_type = detect_query_type(user_query)
    calculation_intent = has_calculation_intent(user_query)

    query             = query[:3000]
    retrieved_context = retrieved_context[:12000]

    computed_result = None

    
    if doc_data:
        data = extract_data_from_document(doc_data)
        print("[ca_agent] Using Gemini Vision extracted data:", data)
    else:
        
        data = extract_data(user_query) if query_type != "theory" else {}
        print("[ca_agent] Extracted from query:", data)

    
    if query_type == "theory" and not doc_data:
        prompt = f"""
You are a Chartered Accountant examiner.
Use ONLY ICAI content below to answer.

ICAI Content:
{retrieved_context}

Question:
{query}

Answer in structured bullet format with section references where possible.
"""
        return model.generate_content(prompt).text

    
    if calculation_intent and query_type == "income_tax":
        regime          = detect_tax_regime(user_query)
        computed_result = calculate_tax(data, regime)
        print("[ca_agent] Tax computed:", computed_result)

    elif calculation_intent and query_type == "gst":
        computed_result = calculate_gst(data)
        print("[ca_agent] GST computed:", computed_result)

    
    doc_context = ""
    if doc_data:
        doc_context = f"""
Document Type   : {data.get('document_type', 'N/A')}
Person / Entity : {data.get('person_name', 'N/A')}
Period          : {data.get('period', 'N/A')}
Summary         : {data.get('raw_text_summary', 'N/A')}
Total Credits   : {data.get('total_credits', 0)}
Total Debits    : {data.get('total_debits', 0)}
"""

    if computed_result is not None:
        prompt = f"""
You are a Chartered Accountant examiner and tutor.

ICAI Content:
{retrieved_context}

{f"Document Context:{doc_context}" if doc_context else ""}

Student Question:
{query}

Computed Result (FINAL — DO NOT recompute or change any numbers):
{computed_result}

STRICT RULES:
- Computed result is FINAL and AUTHORITATIVE
- DO NOT recompute, DO NOT change any number
- Use ICAI content for explanation wording and section references WHEN relevant.
- If retrieved ICAI context is unrelated/insufficient, still answer using the computed result and accepted tax principles.
-DO NOT invent subsection numbers unless explicitly present in ICAI content.
- Always show:
  1. Income computation (with sources)
  2. Deductions applied
  3. Tax calculation step by step
  4. Final tax payable
- If you use tables, output VALID markdown tables only:
  - Keep header, separator, and each row on a NEW line
  - Do NOT merge multiple rows into one paragraph

Answer clearly with steps.
"""
    else:
        prompt = f"""
You are a Chartered Accountant examiner and tutor.

ICAI Content:
{retrieved_context}

{f"Document Context:{doc_context}" if doc_context else ""}

Student Question:
{query}

STRICT RULES:
- This is a conceptual/theory response unless user explicitly asks to calculate.
- Do NOT show tax/GST computation blocks, formulas, or zero-valued calculation tables unless explicitly asked.
- Use ICAI content ONLY for explanation wording and section references.
- DO NOT invent subsection numbers unless explicitly present in ICAI content.
- Keep answer focused, structured, and concise.
- If you use tables, output VALID markdown tables only:
  - Keep header, separator, and each row on a NEW line
  - Do NOT merge multiple rows into one paragraph

Answer clearly in bullet points.
"""

    return model.generate_content(prompt).text