"""Imagen 3 service — generates educational diagram images via Vertex AI."""
import base64
import logging

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


STYLE_PREFIX = (
    "Educational illustration, clean white background, vibrant colors, "
    "clearly labeled, suitable for a student textbook, high detail: "
)


async def generate_image(prompt: str) -> bytes | None:
    """Generate a single image with Imagen 3 and return raw PNG bytes."""
    client = _get_client()
    full_prompt = STYLE_PREFIX + prompt

    try:
        response = await client.aio.models.generate_images(
            model=settings.imagen_model,
            prompt=full_prompt,
            config=genai_types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="4:3",
                safety_filter_level="block_only_high",
                person_generation="dont_allow",
            ),
        )

        if not response.generated_images:
            logger.warning("Imagen returned no images for prompt: %s", prompt[:60])
            return None

        image = response.generated_images[0]
        return image.image.image_bytes

    except Exception as exc:
        logger.error("Imagen generation error: %s", exc, exc_info=True)
        return None
