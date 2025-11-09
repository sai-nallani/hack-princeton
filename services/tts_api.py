import os
from dotenv import load_dotenv
from elevenlabs import ElevenLabs

# Load environment variables from .env file
load_dotenv()

class TTSAPI:
    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        self.client = ElevenLabs(
            api_key=self.api_key,
            base_url="https://api.elevenlabs.io"
        )
        self.default_voice_id = "JBFqnCBsd6RMkjVDRZzb"
        self.default_model_id = "eleven_multilingual_v2"
        self.default_output_format = "mp3_44100_128"
    
    def text_to_speech(self, text: str, voice_id: str = None, model_id: str = None, output_format: str = None):
        return self.client.text_to_speech.convert(
            voice_id=voice_id or self.default_voice_id,
            output_format=output_format or self.default_output_format,
            text=text,
            model_id=model_id or self.default_model_id
        )

tts_api = TTSAPI()