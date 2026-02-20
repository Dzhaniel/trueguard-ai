import os
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# ✅ NEW Gemini SDK
from google import genai

APP_DIR = Path(__file__).parent
STATIC_DIR = APP_DIR / "static"
TEMPLATES_DIR = APP_DIR / "templates"

app = FastAPI()

# templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# static
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

MODEL_NAME = os.getenv("MODEL_NAME", "models/gemini-2.5-flash")


def risk_level_from_score(score: int) -> str:
    if score >= 66:
        return "HIGH"
    if score >= 31:
        return "MEDIUM"
    return "LOW"


def analyze_with_gemini(username: str, bio: str, chat_text: str) -> dict:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY табылмады. PowerShell-де:\n"
            "$env:GOOGLE_API_KEY='YOUR_KEY'\n"
            "қойып, сол терминалда uvicorn іске қос."
        )

    client = genai.Client(api_key=api_key)

    prompt = f"""
Сен fraud/scam risk analyzer-сің. Төмендегі мәліметке қарап JSON қайтар.
ТЕК JSON (ешқандай мәтінсіз). Схема дәл осылай:

{{
  "risk_score": 0-100,
  "scam_type": "string",
  "manipulation_score": 0-100,
  "vulnerability_score": 0-100,
  "reasons": ["...","..."],
  "safety_coach": "string",
  "safe_reply": "string"
}}

Username: {username}
Bio: {bio}
Chat:
{chat_text}
""".strip()

    resp = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )

    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Gemini бос жауап қайтарды (empty response).")

    # Кейде ```json ... ``` келеді — тазалаймыз
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        data = json.loads(text)
    except Exception as e:
        raise RuntimeError(f"Gemini JSON емес қайтарды. parse error={e}. raw={text[:500]}")

    required = [
        "risk_score", "scam_type",
        "manipulation_score", "vulnerability_score",
        "reasons", "safety_coach", "safe_reply"
    ]
    for k in required:
        if k not in data:
            raise RuntimeError(f"Gemini JSON ішінде '{k}' жоқ. raw={text[:500]}")

    return data


# ✅ HOME
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    # templates/home.html міндетті
    return templates.TemplateResponse("home.html", {"request": request})


# ✅ APP
@app.get("/app", response_class=HTMLResponse)
async def app_page(request: Request):
    # templates/app.html міндетті
    return templates.TemplateResponse("app.html", {"request": request})


# ✅ ANALYZE API
@app.post("/analyze")
async def analyze(
    # Frontend кейде жібереді: username/bio
    username: str = Form(""),
    bio: str = Form(""),

    # Сенің әртүрлі фронттарың үшін: chat_text та, text те қабылдаймыз
    chat_text: Optional[str] = Form(None),
    text: Optional[str] = Form(None),

    # фото optional
    photo: UploadFile = File(None),
):
    # Қайсысы келсе — соны аламыз
    merged_text = (chat_text if chat_text is not None else text) or ""
    merged_text = merged_text.strip()

    if not merged_text and photo is None:
        raise HTTPException(status_code=400, detail="Мәтін немесе фото керек")

    # (қаласаң кейін OCR қосуға болады; қазір фото тек қабылданады)
    # if photo is not None:
    #     _ = await photo.read()

    try:
        ai = analyze_with_gemini(username, bio, merged_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")

    try:
        risk_score = int(ai["risk_score"])
        manipulation_score = int(ai["manipulation_score"])
        vulnerability_score = int(ai["vulnerability_score"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Score parse error: {e}")

    result = {
        "request_id": str(uuid.uuid4()),
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "from_cache": False,
        "risk_score": risk_score,
        "risk_level": risk_level_from_score(risk_score),
        "scam_type": str(ai["scam_type"]),
        "manipulation_score": manipulation_score,
        "vulnerability_score": vulnerability_score,
        "reasons": list(ai["reasons"])[:10],
        "safety_coach": str(ai["safety_coach"]),
        "safe_reply": str(ai["safe_reply"]),
    }

    return JSONResponse(result)