"""Gemini Live API service — streams TTS narration for each script section.

Uses the google-genai SDK's Live API to synthesize speech for each section's
narration text, then pushes base64-encoded PCM audio chunks to the send_queue
alongside matching text transcript messages.
"""
import asyncio
import base64
import logging
from typing import Any

import google.genai as genai
from google.genai import types as genai_types
from google.genai.live import AsyncSession as AsyncLiveSession

from config import settings

logger = logging.getLogger(__name__)

_client: genai.Client | None = None

LIVE_CONFIG = genai_types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    speech_config=genai_types.SpeechConfig(
        voice_config=genai_types.VoiceConfig(
            prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(voice_name="Aoede")
        )
    ),
    system_instruction=genai_types.Content(
        parts=[
            genai_types.Part.from_text(
                text=(
                    "You are an enthusiastic, friendly tutor. Read the provided text "
                    "naturally and expressively, as if explaining to a curious student. "
                    "Do not add extra commentary — only speak the text provided."
                )
            )
        ]
    ),
)


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )
    return _client


async def _narrate_text(
    session: AsyncLiveSession,
    text: str,
    section_id: int,
    send_queue: asyncio.Queue,
) -> None:
    """Send one section's narration text to the Live session and stream back audio."""
    await session.send_client_content(
        turns=genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=text)],
        ),
        turn_complete=True,
    )

    # Stream audio response back to frontend
    async for response in session.receive():
        if response.data:
            # response.data is raw PCM bytes
            audio_b64 = base64.b64encode(response.data).decode("utf-8")
            await send_queue.put({
                "type": "audio",
                "section_id": section_id,
                "data": audio_b64,
            })
        if response.text:
            await send_queue.put({
                "type": "text",
                "section_id": section_id,
                "content": response.text,
            })
        if response.server_content and response.server_content.turn_complete:
            break


async def narrate_script(
    script: dict[str, Any],
    send_queue: asyncio.Queue,
) -> None:
    """Open one Live API session and narrate the full script sequentially."""
    client = _get_client()
    sections = script.get("sections", [])
    intro = script.get("intro", "")
    outro = script.get("outro", "")

    try:
        async with client.aio.live.connect(
            model=settings.gemini_live_model,
            config=LIVE_CONFIG,
        ) as session:

            # Narrate intro
            if intro:
                await _narrate_text(session, intro, section_id=0, send_queue=send_queue)

            # Narrate each section in order
            for section in sections:
                section_id = section.get("id", 0)
                narration = section.get("narration", "")

                # Signal which section is now being narrated
                await send_queue.put({
                    "type": "section_start",
                    "section_id": section_id,
                })

                await _narrate_text(session, narration, section_id=section_id, send_queue=send_queue)

                await send_queue.put({
                    "type": "section_end",
                    "section_id": section_id,
                })

            # Narrate outro
            if outro:
                await _narrate_text(session, outro, section_id=-1, send_queue=send_queue)

    except Exception as exc:
        logger.error("Live API narration error: %s", exc, exc_info=True)
        await send_queue.put({
            "type": "error",
            "content": f"Narration error: {str(exc)}",
        })
