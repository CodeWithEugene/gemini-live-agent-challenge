"""Vision Agent — analyzes the homework photo and extracts subject + context."""
import base64
import json
import logging
from typing import Any

import google.genai as genai
from google.genai import types as genai_types

from config import settings

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )
    return _client


VISION_PROMPT = """You are an expert educational analyst.
The user has captured a photo (likely of a textbook page, diagram, or homework problem)
and asked: "{question}"

Analyze the image carefully and respond ONLY with a JSON object (no markdown, no extra text):
{{
  "subject": "<main academic subject, e.g. Biology, Physics, Mathematics>",
  "topic": "<specific topic visible in the image, e.g. photosynthesis, quadratic equations>",
  "context": "<brief description of what is shown in the image, 2-3 sentences>",
  "question": "<restate the user's question clearly>"
}}"""


async def analyze_photo(photo_b64: str, question: str) -> dict[str, Any]:
    """Send the photo to Gemini Flash with vision and extract structured context."""
    client = _get_client()

    image_bytes = base64.b64decode(photo_b64)

    prompt = VISION_PROMPT.format(question=question)

    response = await client.aio.models.generate_content(
        model=settings.gemini_flash_model,
        contents=[
            genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            genai_types.Part.from_text(text=prompt),
        ],
        config=genai_types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=512,
        ),
    )

    raw = response.text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Vision agent returned non-JSON: %s", raw)
        result = {
            "subject": "General",
            "topic": "Unknown",
            "context": raw,
            "question": question,
        }

    logger.info("Vision analysis: subject=%s, topic=%s", result.get("subject"), result.get("topic"))
    return result
