from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import (
    AutoTagResult,
    OOTDCheckRequest,
    OOTDCheckResponse,
    StylingRequest,
    StylingResponse,
    TravelCapsuleRequest,
    TravelCapsuleResponse,
)
from app.services.capsule_planner import solve_travel_capsule
from app.services.gemini_tagger import auto_tag_garment_with_gemini
from app.services.hybrid_stylist import generate_hybrid_recommendations
from app.services.rules_engine import check_ootd_repeat

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Low-cloud-cost 2D Flat-lay Smart Wardrobe & Hybrid Styling Engine API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "atelier-wardrobe-api", "mode": "hybrid-low-token"}


@app.post("/api/v1/wardrobe/auto-tag", response_model=AutoTagResult)
async def auto_tag_endpoint(
    image: UploadFile = File(...),
    primary_hex: str = Form(..., pattern=r"^#[0-9A-Fa-f]{6}$"),
    secondary_hex: str | None = Form(None),
) -> AutoTagResult:
    """One-time Gemini 2.5 Flash Structured Output tagging at wardrobe ingestion."""
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty garment image payload.")
    try:
        return auto_tag_garment_with_gemini(
            image_bytes=image_bytes,
            mime_type=image.content_type or "image/png",
            primary_hex=primary_hex,
            secondary_hex=secondary_hex,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/v1/styling/recommend", response_model=StylingResponse)
def recommend_outfits_endpoint(request: StylingRequest) -> StylingResponse:
    """Two-stage Hybrid Styling: Stage-1 Local Rules -> Cache -> Stage-2 ID-only LLM."""
    return generate_hybrid_recommendations(request)


@app.post("/api/v1/ootd/check-repeat", response_model=OOTDCheckResponse)
def check_ootd_repeat_endpoint(request: OOTDCheckRequest) -> OOTDCheckResponse:
    """Detect outfit overlap conflicts within the configured anti-repeat window."""
    return check_ootd_repeat(
        planned_date=request.planned_date,
        planned_item_ids=request.planned_item_ids,
        history_logs=request.history_logs,
        window_days=request.window_days,
    )


@app.post("/api/v1/capsule/optimize", response_model=TravelCapsuleResponse)
def optimize_travel_capsule_endpoint(request: TravelCapsuleRequest) -> TravelCapsuleResponse:
    """Solve minimal-item travel capsule maximizing distinct daily outfits."""
    return solve_travel_capsule(request)
