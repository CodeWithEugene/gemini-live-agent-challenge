"""WebSocket endpoint — bridges the browser client to the ADK pipeline.

Message protocol
----------------
Client → Server:
  { "type": "photo",    "data": "<base64 JPEG>" }
  { "type": "question", "text": "<user's spoken question>" }
  { "type": "stop" }

Server → Client:
  { "type": "status",       "content": "..." }           # progress update
  { "type": "meta",         "subject": "...", "topic": "..." }
  { "type": "title",        "content": "..." }
  { "type": "section_start","section_id": N }
  { "type": "audio",        "section_id": N, "data": "<base64 PCM>" }
  { "type": "text",         "section_id": N, "content": "..." }
  { "type": "image_url",    "section_id": N, "url": "...", "caption": "..." }
  { "type": "section_end",  "section_id": N }
  { "type": "error",        "content": "..." }
  { "type": "done" }
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from agents.coordinator import run_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected from %s", websocket.client)

    session: dict = {
        "photo_b64": None,
        "pipeline_task": None,
    }

    send_queue: asyncio.Queue = asyncio.Queue()

    async def sender():
        """Drain send_queue and forward all messages to the client."""
        while True:
            msg = await send_queue.get()
            if msg is None:
                return
            try:
                await websocket.send_text(json.dumps(msg))
            except Exception as exc:
                logger.warning("Could not send to client: %s", exc)
                return

    sender_task = asyncio.create_task(sender())

    async def cancel_pipeline():
        task = session.get("pipeline_task")
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON from client, skipping")
                continue

            msg_type = msg.get("type")

            if msg_type == "photo":
                data = msg.get("data", "")
                if not data:
                    await send_queue.put({"type": "error", "content": "Empty photo data."})
                    continue
                session["photo_b64"] = data
                logger.info("Photo received (%d chars)", len(data))
                await send_queue.put({"type": "status", "content": "Photo received. Ask your question!"})

            elif msg_type == "question":
                question = msg.get("text", "").strip()
                if not question:
                    await send_queue.put({"type": "error", "content": "Question text is empty."})
                    continue
                if not session.get("photo_b64"):
                    await send_queue.put({"type": "error", "content": "Please capture a photo first."})
                    continue

                # Cancel any previous pipeline
                await cancel_pipeline()

                # Reset queue
                while not send_queue.empty():
                    send_queue.get_nowait()

                logger.info("Starting pipeline for question: %s", question[:80])
                session["pipeline_task"] = asyncio.create_task(
                    run_pipeline(
                        photo_b64=session["photo_b64"],
                        question=question,
                        send_queue=send_queue,
                    )
                )

            elif msg_type == "stop":
                logger.info("Client requested stop")
                await cancel_pipeline()
                await send_queue.put({"type": "done"})
                await send_queue.put(None)
                break

            else:
                logger.warning("Unknown message type from client: %s", msg_type)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.error("WebSocket error: %s", exc, exc_info=True)
        try:
            await websocket.send_text(json.dumps({"type": "error", "content": str(exc)}))
        except Exception:
            pass
    finally:
        await cancel_pipeline()
        await send_queue.put(None)
        try:
            await asyncio.wait_for(sender_task, timeout=2.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            sender_task.cancel()
        logger.info("WebSocket session closed")
