# backend/app.py
import os
import json
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from pdfminer.high_level import extract_text
import openai
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("Set the OPENAI_API_KEY environment variable")

openai.api_key = OPENAI_API_KEY

app = Flask(__name__)
CORS(app)  # allow requests from frontend during local dev

# ---------------- utilities ----------------
def extract_text_from_pdf(fp_path):
    try:
        return extract_text(fp_path) or ""
    except Exception as e:
        print("PDF extraction error:", e)
        return ""

def chunk_text(text, max_chars=3000):
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        if end < len(text):
            split_at = max(text.rfind("\n", start, end), text.rfind(" ", start, end))
            if split_at <= start:
                split_at = end
            end = split_at
        chunks.append(text[start:end].strip())
        start = end
    return chunks

def call_llm(system_prompt, user_prompt, model="gpt-3.5-turbo", max_tokens=600):
    try:
        resp = openai.ChatCompletion.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print("LLM call failed:", e)
        raise

def generate_mc_flashcards(text, num_cards=8, choices=4):
    if len(text) > 300000:
        text = text[:300000]
    system = "You are a helpful study assistant that outputs valid JSON only."
    user_prompt = (
        f"From the following text, generate {num_cards} multiple-choice flashcards. "
        f"Each flashcard should have exactly {choices} answer options. Return a JSON array like:\n"
        '[{"question":"...","choices":["A","B","C","D"],"answer_index":1}, ...]\n\n'
        "The 'answer_index' should be a 0-based index indicating the correct choice. "
        "Make questions concise (one sentence). Make distractors plausible. Do NOT include explanations. "
        "Text:\n\n" + text
    )
    resp = call_llm(system, user_prompt, max_tokens=1200)

    try:
        data = json.loads(resp)
        if isinstance(data, list):
            return data
    except Exception:
        pass

    m = re.search(r"(\[.*\])", resp, flags=re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            if isinstance(data, list):
                return data
        except Exception:
            pass

    # retry prompt if parse failed
    try:
        retry_prompt = (
            "You must return valid JSON only. Return a JSON array with objects "
            "having fields: question, choices (array of 4 strings), answer_index (0-based). "
            "Do not add any text outside the JSON. Now produce the JSON again from the original text:\n\n" 
            + text[:15000]
        )
        resp2 = call_llm(system, retry_prompt, max_tokens=1200)
        try:
            data = json.loads(resp2)
            if isinstance(data, list):
                return data
        except Exception:
            pass
    except Exception:
        pass

    # fallback single card for debugging
    return [{
        "question": "Flashcard generation failed to produce parseable JSON. See raw output:",
        "choices": [resp[:200], resp[200:400] if len(resp)>200 else "","", ""],
        "answer_index": 0
    }]

# ---------------- routes ----------------
@app.route("/process", methods=["POST"])
def process():
    uploaded_file = request.files.get("file")
    raw_text = request.form.get("text", "").strip()

    if uploaded_file and uploaded_file.filename.lower().endswith(".pdf"):
        tmp_path = os.path.join("/tmp", uploaded_file.filename)
        uploaded_file.save(tmp_path)
        text = extract_text_from_pdf(tmp_path)
        try:
            os.remove(tmp_path)
        except Exception:
            pass
    elif raw_text:
        text = raw_text
    else:
        return jsonify({"error": "No PDF file or text provided."}), 400

    if not text or text.strip() == "":
        return jsonify({"error": "No text found in the provided file or box."}), 400

    try:
        flashcards = generate_mc_flashcards(text, num_cards=8, choices=4)
    except Exception as e:
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

    return jsonify({"flashcards": flashcards})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
