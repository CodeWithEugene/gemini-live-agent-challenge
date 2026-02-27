"""Visual Asset Agent — generates one Imagen 3 image per script section."""
import asyncio
import logging
from typing import Any

from services.imagen import generate_image
from services.storage import upload_image_bytes

logger = logging.getLogger(__name__)


async def generate_section_image(
    section: dict[str, Any],
    send_queue: asyncio.Queue,
) -> str | None:
    """Generate an image for a single section and push image_url to the send_queue."""
    section_id = section.get("id", 0)
    image_prompt = section.get("image_prompt", "educational diagram")

    try:
        image_bytes = await generate_image(image_prompt)
        if not image_bytes:
            logger.warning("No image bytes returned for section %d", section_id)
            return None

        url = await upload_image_bytes(
            image_bytes=image_bytes,
            destination_name=f"section_{section_id}.png",
        )

        await send_queue.put({
            "type": "image_url",
            "section_id": section_id,
            "url": url,
            "caption": image_prompt[:80],
        })

        logger.info("Image ready for section %d: %s", section_id, url)
        return url

    except Exception as exc:
        logger.error("Image generation failed for section %d: %s", section_id, exc)
        return None


async def generate_all_images(
    script: dict[str, Any],
    send_queue: asyncio.Queue,
) -> None:
    """Generate images for all sections concurrently."""
    sections = script.get("sections", [])
    if not sections:
        return

    tasks = [
        generate_section_image(section, send_queue)
        for section in sections
    ]
    await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("All section images processed")
