"""Portuguese speech transcription through NVIDIA's hosted Canary ASR NIM."""

import asyncio
import os
import subprocess
import time

import grpc
import imageio_ffmpeg
import riva.client


CANARY_FUNCTION_ID = "b0e8b4a5-217c-40b7-9b96-17d84e666317"


def _transcribe(audio: bytes, api_key: str) -> str:
    # The browser records WebM/Opus or MP4/AAC. Riva expects mono PCM samples.
    conversion = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-loglevel", "error", "-i", "pipe:0",
         "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
        input=audio, capture_output=True, check=True, timeout=12,
    )
    if not conversion.stdout:
        raise ValueError("No audio samples after conversion")

    auth = riva.client.Auth(
        use_ssl=True,
        uri="grpc.nvcf.nvidia.com:443",
        metadata_args=[
            ["function-id", CANARY_FUNCTION_ID],
            ["authorization", f"Bearer {api_key}"],
        ],
    )
    service = riva.client.ASRService(auth)
    config = riva.client.RecognitionConfig(
        encoding=riva.client.AudioEncoding.LINEAR_PCM,
        sample_rate_hertz=16000,
        language_code="pt-PT",
        max_alternatives=1,
        enable_automatic_punctuation=True,
    )
    for attempt in range(2):
        try:
            result = service.offline_recognize(conversion.stdout, config, future=True).result(timeout=18)
            break
        except grpc.RpcError as error:
            if attempt or error.code() not in {
                grpc.StatusCode.UNAVAILABLE, grpc.StatusCode.DEADLINE_EXCEEDED,
                grpc.StatusCode.RESOURCE_EXHAUSTED,
            }:
                raise
            time.sleep(0.25)
    return " ".join(
        entry.alternatives[0].transcript.strip()
        for entry in result.results if entry.alternatives and entry.alternatives[0].transcript.strip()
    )


async def transcribe_voice_audio(audio: bytes) -> str:
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not configured for transcription")
    return await asyncio.to_thread(_transcribe, audio, api_key)
