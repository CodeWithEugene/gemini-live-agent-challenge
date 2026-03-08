"""Narration service — TTS API (verbatim) or Live API fallback.

When GEMINI_TTS_MODEL is set, uses the dedicated TTS model to speak the script
verbatim (no conversational response). Otherwise uses the Live API with a strict
system instruction to read-only.
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

# Strict instruction so Live does not "answer" the script or add extra words
LIVE_SYSTEM_INSTRUCTION = (
    "You are a voice actor. The user will send you a script line. Your ONLY job is to speak "
    "that exact line, word for word. Do NOT respond to the text as if it were a question. "
    "Do NOT add greetings, acknowledgments, or any extra words (no 'Sure!', 'Okay', 'Here we go', etc.). "
    "Output ONLY the audio of reading the script. Nothing before, nothing after."
)

LIVE_CONFIG = genai_types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    speech_config=genai_types.SpeechConfig(
        voice_config=genai_types.VoiceConfig(
            prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(voice_name="Aoede")
        )
    ),
    system_instruction=genai_types.Content(
        parts=[genai_types.Part.from_text(text=LIVE_SYSTEM_INSTRUCTION)],
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


async def _narrate_via_tts(
    text: str,
    section_id: int,
    send_queue: asyncio.Queue,
) -> None:
    """Use TTS model to speak text verbatim (no conversational response)."""
    client = _get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_tts_model,
        contents=text,
        config=genai_types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=genai_types.SpeechConfig(
                voice_config=genai_types.VoiceConfig(
                    prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
        ),
    )
    if not response.candidates or not response.candidates[0].content.parts:
        logger.warning("TTS returned no audio for section %s", section_id)
        return
    part = response.candidates[0].content.parts[0]
    if not hasattr(part, "inline_data") or part.inline_data is None:
        logger.warning("TTS part has no inline_data for section %s", section_id)
        return
    audio_bytes = part.inline_data.data
    if not audio_bytes:
        return
    # Send text so the UI can show it (typewriter)
    await send_queue.put({"type": "text", "section_id": section_id, "content": text})
    # Send audio in one chunk (frontend enqueues and plays)
    await send_queue.put({
        "type": "audio",
        "section_id": section_id,
        "data": base64.b64encode(audio_bytes).decode("utf-8"),
    })


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
    """Narrate the full script: TTS (verbatim) if configured, else Live API."""
    sections = script.get("sections", [])
    intro = script.get("intro", "")
    outro = script.get("outro", "")

    use_tts = bool(settings.gemini_tts_model and settings.gemini_tts_model.strip())

    try:
        if use_tts:
            await _narrate_script_via_tts(
                intro=intro,
                sections=sections,
                outro=outro,
                send_queue=send_queue,
            )
        else:
            await _narrate_script_via_live(
                intro=intro,
                sections=sections,
                outro=outro,
                send_queue=send_queue,
            )
    except Exception as exc:
        logger.error("Narration error: %s", exc, exc_info=True)
        await send_queue.put({
            "type": "error",
            "content": f"Narration error: {str(exc)}",
        })


async def _narrate_script_via_tts(
    intro: str,
    sections: list,
    outro: str,
    send_queue: asyncio.Queue,
) -> None:
    """Narrate using TTS model (verbatim, no conversational response)."""
    if intro:
        await _narrate_via_tts(intro, section_id=0, send_queue=send_queue)
    for section in sections:
        section_id = section.get("id", 0)
        narration = section.get("narration", "")
        await send_queue.put({"type": "section_start", "section_id": section_id})
        if narration:
            await _narrate_via_tts(narration, section_id=section_id, send_queue=send_queue)
        await send_queue.put({"type": "section_end", "section_id": section_id})
    if outro:
        await _narrate_via_tts(outro, section_id=-1, send_queue=send_queue)


async def _narrate_script_via_live(
    intro: str,
    sections: list,
    outro: str,
    send_queue: asyncio.Queue,
) -> None:
    """Narrate using Live API (strict system instruction to read-only)."""
    client = _get_client()
    async with client.aio.live.connect(
        model=settings.gemini_live_model,
        config=LIVE_CONFIG,
    ) as session:
        if intro:
            await _narrate_text(session, intro, section_id=0, send_queue=send_queue)
        for section in sections:
            section_id = section.get("id", 0)
            narration = section.get("narration", "")
            await send_queue.put({"type": "section_start", "section_id": section_id})
            await _narrate_text(session, narration, section_id=section_id, send_queue=send_queue)
            await send_queue.put({"type": "section_end", "section_id": section_id})
        if outro:
            await _narrate_text(session, outro, section_id=-1, send_queue=send_queue)
