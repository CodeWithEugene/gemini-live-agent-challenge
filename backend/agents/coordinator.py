"""Coordinator — orchestrates the full Living Textbook pipeline.

Flow:
1. Vision Agent  — analyzes the photo (sequential)
2. Script Agent  — generates narration script (sequential, depends on vision)
3. In parallel:
   a. Visual Agent — generates Imagen images for each section
   b. Narration    — streams TTS audio for each section via Live API
"""
import asyncio
import logging
from typing import Any

from agents.vision_agent import analyze_photo
from agents.script_agent import generate_script
from agents.visual_agent import generate_all_images
from services.gemini_live import narrate_script

logger = logging.getLogger(__name__)


async def run_pipeline(
    photo_b64: str,
    question: str,
    send_queue: asyncio.Queue,
) -> None:
    """Entry point called by the WebSocket handler for each user session."""
    try:
        # --- Phase 1: Vision ------------------------------------------------
        await send_queue.put({"type": "status", "content": "Analyzing your image..."})
        vision_result = await analyze_photo(photo_b64, question)

        await send_queue.put({
            "type": "meta",
            "subject": vision_result.get("subject"),
            "topic": vision_result.get("topic"),
        })

        # --- Phase 2: Script ------------------------------------------------
        await send_queue.put({"type": "status", "content": "Preparing your explainer..."})
        script = await generate_script(vision_result)

        await send_queue.put({
            "type": "title",
            "content": script.get("title", "Your Explainer"),
        })

        # --- Phase 3: Parallel — images + narration -------------------------
        await asyncio.gather(
            generate_all_images(script, send_queue),
            narrate_script(script, send_queue),
        )

        await send_queue.put({"type": "done"})
        logger.info("Pipeline complete for topic: %s", vision_result.get("topic"))

    except Exception as exc:
        logger.error("Pipeline error: %s", exc, exc_info=True)
        await send_queue.put({
            "type": "error",
            "content": f"Something went wrong: {str(exc)}",
        })
        await send_queue.put({"type": "done"})
