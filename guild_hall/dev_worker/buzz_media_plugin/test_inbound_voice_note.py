"""Focused checks for Buzz voice notes packaged as video/mp4."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from guild_hall.dev_worker.buzz_media_plugin import inbound_media
from guild_hall.dev_worker.buzz_media_plugin.inbound_media import (
    _audio_only_mp4,
    _descriptors,
    _effective_mime,
)


class _FakeAuth:
    @staticmethod
    def public_key_hex(_key):
        return "agent"

    @staticmethod
    def schnorr_sign(_digest, _key):
        return b"\0" * 64


def _load_nostr_auth():
    return _FakeAuth


class BuzzAdapter:
    _private_key = b"test-only"
    relay_url = "https://relay.example"

    def _is_sender_authorized(self, *_args):
        return True


class _Response:
    def __init__(self, data):
        self.data = data

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def raise_for_status(self):
        return None

    async def aiter_bytes(self, _size):
        yield self.data


class _Client:
    def __init__(self, event, media):
        self.event = event
        self.media = media

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def stream(self, method, _url, **_kwargs):
        return _Response(json.dumps([self.event]).encode() if method == "POST"
                         else self.media)


class VoiceNoteMediaTests(unittest.TestCase):
    def test_signed_voice_note_metadata_is_retained(self):
        digest = hashlib.sha256(b"fixture").hexdigest()
        url = f"https://relay.example/media/{digest}.mp4"
        source = SimpleNamespace(user_id="sender", chat_id="channel")
        event = SimpleNamespace(message_id="event", source=source)
        raw = {
            "id": "event", "pubkey": "sender", "kind": 9,
            "tags": [
                ["h", "channel"],
                ["imeta", f"url {url}", "m video/mp4", f"x {digest}",
                 "size 7", "filename voice-note-1790124862753.mp4"],
            ],
        }
        item, = _descriptors(raw, event, ("https", "relay.example", 443))
        self.assertTrue(item["voice_note"])
        self.assertEqual(item["mime"], "video/mp4")
        raw["tags"][1][-1] = "filename ordinary-video.mp4"
        item, = _descriptors(raw, event, ("https", "relay.example", 443))
        self.assertFalse(item["voice_note"])

    def test_only_audio_stream_mp4_is_eligible(self):
        ffmpeg = shutil.which("ffmpeg")
        self.assertIsNotNone(ffmpeg, "ffmpeg is required for this media test")
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "voice-note-1790124862753.mp4"
            mixed = Path(directory) / "ordinary-video.mp4"
            subprocess.run(
                [ffmpeg, "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                 "sine=frequency=440:duration=1", "-c:a", "aac", str(audio)],
                check=True, capture_output=True, timeout=15,
            )
            subprocess.run(
                [ffmpeg, "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                 "color=c=black:s=16x16:r=1:d=1", "-f", "lavfi", "-i",
                 "sine=frequency=440:duration=1", "-c:v", "mpeg4", "-c:a", "aac",
                 str(mixed)],
                check=True, capture_output=True, timeout=15,
            )
            self.assertTrue(_audio_only_mp4(audio))
            self.assertFalse(_audio_only_mp4(mixed))
            self.assertFalse(_audio_only_mp4(Path(directory) / "missing.mp4"))
            voice_note = {"voice_note": True, "mime": "video/mp4"}
            ordinary = {"voice_note": False, "mime": "video/mp4"}
            self.assertEqual(_effective_mime(voice_note, audio), "audio/mp4")
            self.assertEqual(_effective_mime(voice_note, mixed), "video/mp4")
            self.assertEqual(_effective_mime(ordinary, audio), "video/mp4")

    def test_verified_inbound_voice_reaches_audio_route(self):
        ffmpeg = shutil.which("ffmpeg")
        self.assertIsNotNone(ffmpeg)
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "voice-note-1790124862753.mp4"
            subprocess.run(
                [ffmpeg, "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                 "sine=frequency=440:duration=1", "-c:a", "aac", str(audio)],
                check=True, capture_output=True, timeout=15,
            )
            media = audio.read_bytes()
            digest = hashlib.sha256(media).hexdigest()
            url = f"https://relay.example/media/{digest}.mp4"
            event_id = "e" * 64
            raw = {
                "id": event_id, "pubkey": "sender", "kind": 9,
                "tags": [["h", "channel"],
                         ["imeta", f"url {url}", "m video/mp4", f"x {digest}",
                          f"size {len(media)}", f"filename {audio.name}"]],
            }
            event = SimpleNamespace(
                source=SimpleNamespace(platform="buzz", user_id="sender",
                                       chat_id="channel", chat_type="dm"),
                message_id=event_id, media_urls=[], media_types=[],
                text=f"[{audio.name}]({url})",
            )
            adapter = BuzzAdapter()
            adapter._buzz_attachment_home = Path(directory)
            with patch.object(inbound_media.httpx, "AsyncClient",
                              return_value=_Client(raw, media)):
                asyncio.run(inbound_media.hydrate_event(adapter, event))
            self.assertEqual(event.media_types, ["audio/mp4"])
            self.assertEqual(event.text, "")
            self.assertEqual(Path(event.media_urls[0]).read_bytes(), media)


if __name__ == "__main__":
    unittest.main()
