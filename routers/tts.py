"""
Router for ElevenLabs TTS endpoints
"""
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from services.tts_api import tts_api

router = APIRouter(
    prefix="/api/tts",
    tags=["tts"]
)

class TTSRequest(BaseModel):
    text: str

@router.post("/speak")
async def speak(request: TTSRequest):
    """
    Convert text to speech and return audio file
    
    Args:
        request: Request body containing text to convert
    """
    try:
        if not tts_api.api_key:
            return Response(
                content=b"",
                media_type="audio/mpeg",
                status_code=503,
                headers={"X-Error": "ElevenLabs API key not configured"}
            )
        
        audio_generator = tts_api.text_to_speech(request.text)
        # Collect all audio chunks from the generator
        audio_data = b"".join(audio_generator)
        return Response(
            content=audio_data,
            media_type="audio/mpeg"
        )
    except Exception as e:
        print(f"TTS Error: {e}")
        return Response(
            content=b"",
            media_type="audio/mpeg",
            status_code=500,
            headers={"X-Error": str(e)}
        )