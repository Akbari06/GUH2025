# main.py
import os
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

# Create FastAPI app
app = FastAPI(
    title="Well World - Minimal with Gemini",
    description="FastAPI backend exposing simple Gemini endpoints",
    version="1.0.0",
)

# CORS configuration (dev-friendly)
_frontend_origins = os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in _frontend_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the gemini router
from routers.gemini.router import router as gemini_router  # import after app created
app.include_router(gemini_router, prefix="/api/gemini", tags=["gemini"])


@app.get("/", response_class=HTMLResponse)
def root():
    return """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Well World - Minimal FastAPI + Gemini</title>
        <style>
          html,body{height:100%;margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;}
          body{display:flex;align-items:center;justify-content:center;background:#0b1020;color:#e6eef8}
          .card{max-width:720px;padding:28px;border-radius:12px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));box-shadow:0 6px 24px rgba(2,6,23,0.6);text-align:center}
          h1{margin:0 0 12px;font-size:28px}
          p{margin:0 0 18px;color:#bcd0ea}
          a.button{display:inline-block;padding:10px 16px;border-radius:8px;background:#1f6feb;color:white;text-decoration:none;font-weight:600}
          a.small{margin-left:12px;color:#9fb6ff;text-decoration:none;font-size:0.9rem}
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Well World - Minimal FastAPI + Gemini</h1>
          <p>Use the frontend to call <code>/api/gemini/*</code> endpoints. API docs at <strong>/docs</strong>.</p>
          <div>
            <a class="button" href="/docs">Open API Docs</a>
            <a class="small" href="/redoc">Open ReDoc</a>
          </div>
        </div>
      </body>
    </html>
    """

@app.get("/api/health")
def health():
    return {"status": "ok"}
