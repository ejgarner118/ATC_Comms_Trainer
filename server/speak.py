"""Speak only the scripted KSLE transmissions, and hear a pilot clip."""

from __future__ import annotations

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import edge_tts
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data" / "ksle.json").read_text(encoding="utf-8"))
PHRASES: dict[str, str] = {
    key: value["spoken"] for key, value in DATA["transmissions"].items()
}
VOICE = "en-US-GuyNeural"
HOST = "127.0.0.1"
PORT = 8765
HEAR_PROMPT = "Skyhawk three six niner four Sierra. Runway 31, taxi via Charlie, cross runway 34, via Foxtrot, hold short. Salem Ground, GA apron, information Bravo. Salem Tower, straight in, landing runway 31."
HEAR_MAX_BYTES = 2_000_000

_hear_lock = threading.Lock()
_hear_model: object | None = None
_hear_failed = False


async def synthesize(text: str) -> bytes:
    communicate = edge_tts.Communicate(text, VOICE, rate="-8%")
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    if not audio:
        raise RuntimeError("edge-tts returned no audio")
    return bytes(audio)


def hear(pcm: bytes) -> str:
    global _hear_model, _hear_failed
    with _hear_lock:
        if _hear_failed:
            raise RuntimeError("recognizer unavailable")
        if _hear_model is None:
            try:
                from faster_whisper import WhisperModel

                print("[speak] loading faster-whisper small.en")
                _hear_model = WhisperModel("small.en", device="cpu", compute_type="int8")
            except Exception as exc:
                _hear_failed = True
                print(f"[speak] recognizer unavailable: {exc}")
                raise RuntimeError("recognizer unavailable") from exc
        model = _hear_model
        samples = np.frombuffer(pcm, dtype="<f4")
        segments, _info = model.transcribe(  # type: ignore[attr-defined]
            samples,
            language="en",
            initial_prompt=HEAR_PROMPT,
            vad_filter=True,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[speak] {self.address_string()} {fmt % args}")

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/api/hear":
            self.hear_clip()
            return
        if path != "/api/speak":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 4096:
            self.send_error(400, "Expected a small JSON body")
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            spoken = PHRASES[str(payload["id"])]
        except (json.JSONDecodeError, KeyError, UnicodeDecodeError, TypeError):
            self.send_error(400, "Unknown transmission")
            return
        try:
            audio = asyncio.run(synthesize(spoken))
        except Exception as exc:
            print(f"[speak] synthesis failed: {exc}")
            self.send_error(502, "Synthesis failed")
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(audio)

    def hear_clip(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > HEAR_MAX_BYTES or length % 4 != 0:
            self.send_error(400, "Expected 16 kHz mono audio")
            return
        pcm = self.rfile.read(length)
        try:
            text = hear(pcm)
        except Exception as exc:
            print(f"[speak] hear failed: {exc}")
            self.send_error(503, "Recognizer unavailable")
            return
        body = json.dumps({"text": text}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Speaking scripted KSLE transmissions on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
