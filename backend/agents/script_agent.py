"""Script Agent — produces a structured multi-section explainer script."""
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


SCRIPT_PROMPT = """You are an expert educator creating a short, factual explainer for a student.

Subject: {subject}
Topic: {topic}
Image Context: {context}
Student's Question: {question}

RULES:
- Base your explanation ONLY on what is in the image and the student's question. Do not invent facts, examples, or concepts that are not clearly supported by the image or standard knowledge for that topic.
- Use simple, concrete language. One idea per section. No filler, no vague enthusiasm, no "awesome" or "cool" padding.
- Each section: 2-3 clear sentences that explain one specific point. Be direct.

Create 3-4 sections. Each section must have:
- narration: 2-3 spoken sentences, factual and clear
- image_prompt: a concrete prompt for an educational diagram (what to draw, labels, style)

Respond ONLY with a JSON object (no markdown, no extra text):
{{
  "title": "<catchy title for this explainer>",
  "intro": "<one sentence welcome/intro the narrator will say first>",
  "sections": [
    {{
      "id": 1,
      "narration": "<spoken text for this section>",
      "image_prompt": "<detailed Imagen prompt: style=educational diagram, clean white background, labeled, colorful>"
    }}
  ],
  "outro": "<one sentence closing the explainer>"
}}"""


async def generate_script(vision_result: dict[str, Any]) -> dict[str, Any]:
    """Generate a structured narration script from vision analysis output."""
    client = _get_client()

    prompt = SCRIPT_PROMPT.format(
        subject=vision_result.get("subject", "General"),
        topic=vision_result.get("topic", "the topic"),
        context=vision_result.get("context", ""),
        question=vision_result.get("question", ""),
    )

    response = await client.aio.models.generate_content(
        model=settings.gemini_flash_model,
        contents=[genai_types.Part.from_text(text=prompt)],
        config=genai_types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=2048,
        ),
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        script = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Script agent returned non-JSON: %s", raw[:200])
        script = {
            "title": vision_result.get("topic", "Explainer"),
            "intro": "Let me explain this for you.",
            "sections": [
                {
                    "id": 1,
                    "narration": vision_result.get("context", "Let me walk you through this."),
                    "image_prompt": f"Educational diagram about {vision_result.get('topic', 'the topic')}, clean white background, colorful, labeled",
                }
            ],
            "outro": "I hope that helps!",
        }

    logger.info(
        "Script generated: title=%s, sections=%d",
        script.get("title"),
        len(script.get("sections", [])),
    )
    return script
