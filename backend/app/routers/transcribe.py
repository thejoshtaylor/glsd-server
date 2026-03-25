import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from openai import AsyncOpenAI

from app.config import get_settings
from app.dependencies import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["transcribe"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB


@router.post("/transcribe")
async def transcribe_audio(
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> dict[str, str]:
    """Transcribe an audio file using OpenAI Whisper.

    Accepts audio file uploads up to 25 MB and returns transcribed text.
    Requires authentication via Bearer token.
    """
    # Step 1: Size validation before reading full content
    if file.size is not None and file.size > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    # Step 2: Read content, then validate actual length
    content = await file.read()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    # Step 3: Call Whisper via AsyncOpenAI (per-request client, no global state)
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    try:
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(file.filename or "audio.webm", content, file.content_type or "audio/webm"),
        )
    except Exception as exc:
        logger.error("Whisper transcription failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcription service failed",
        ) from exc

    # Step 4: Return transcribed text
    return {"text": transcript.text}
