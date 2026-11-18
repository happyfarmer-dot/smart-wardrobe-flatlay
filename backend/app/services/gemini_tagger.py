from __future__ import annotations

import base64
import json

from app.config import settings
from app.prompts import (
    AUTO_TAG_JSON_SCHEMA,
    AUTO_TAG_SYSTEM_INSTRUCTION,
    build_auto_tag_prompt,
)
from app.schemas import AutoTagResult


def auto_tag_garment_with_gemini(
    image_bytes: bytes,
    mime_type: str,
    primary_hex: str,
    secondary_hex: str | None = None,
) -> AutoTagResult:
    """
    One-time ingestion multimodal call using Gemini 2.5 Flash Structured Outputs.
    Falls back cleanly if GEMINI_API_KEY is not configured.
    """
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured; use client-side rule tagger.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = build_auto_tag_prompt(primary_hex=primary_hex, secondary_hex=secondary_hex)

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ],
        config=types.GenerateContentConfig(
            system_instruction=AUTO_TAG_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=AUTO_TAG_JSON_SCHEMA,
            temperature=0.1,
            max_output_tokens=160,
        ),
    )

    payload = json.loads(response.text)
    return AutoTagResult(**payload)


def encode_thumbnail_b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")
