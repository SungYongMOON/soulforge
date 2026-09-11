"""Offline hydration fixtures: no real credentials, files, or network endpoints."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import httpx

package = types.ModuleType("inbound_test_package")
package.__path__ = [str(Path(__file__).parent)]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location(package.__name__ + ".inbound_media", Path(__file__).with_name("inbound_media.py"))
inbound = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inbound)


class BuzzAdapter:
    relay_url = "https://relay.example"
    _private_key = "synthetic"
    _is_sender_authorized = lambda self, *args: True


class InboundTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.adapter = BuzzAdapter()
        self.adapter._buzz_attachment_home = Path(self.temp.name)
        self.calls = []
        self.content = b"synthetic attachment bytes"
        self.digest = hashlib.sha256(self.content).hexdigest()
        self.url = "https://relay.example/media/" + self.digest + ".pdf"
        self.event = types.SimpleNamespace(message_id="a" * 64, text="Original user text", media_urls=[], media_types=[],
            source=types.SimpleNamespace(platform="buzz", user_id="b" * 64, chat_id="synthetic-chat", chat_type="dm"))
        self.raw = dict(id=self.event.message_id, pubkey=self.event.source.user_id, kind=9,
            tags=[["h", "synthetic-chat"], ["imeta", "url " + self.url, "m application/pdf", "x " + self.digest,
                "size " + str(len(self.content)), "filename original.pdf"]])
        self.payload = self.content
        self.status = 200
        native = types.SimpleNamespace(_load_nostr_auth=lambda: types.SimpleNamespace(
            public_key_hex=lambda key: "c" * 64, schnorr_sign=lambda digest, key: b"s" * 64),
            os=types.SimpleNamespace(getenv=lambda *args: "synthetic-membership"))
        module_patch = patch.dict(sys.modules, {BuzzAdapter.__module__: native})
        module_patch.start()
        self.addCleanup(module_patch.stop)
        real_client = httpx.AsyncClient
        client_patch = patch.object(inbound.httpx, "AsyncClient", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(self.handle), **kw))
        client_patch.start()
        self.addCleanup(client_patch.stop)

    def handle(self, request):
        self.calls.append(request)
        self.assertEqual(request.headers["x-auth-tag"], "synthetic-membership")
        token = request.headers["authorization"].split()[1]
        auth = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
        if request.method == "POST":
            self.assertEqual(json.loads(request.content), [{"ids": [self.event.message_id], "limit": 1}])
            self.assertEqual(auth["kind"], 27235)
            self.assertIn(["payload", hashlib.sha256(request.content).hexdigest()], auth["tags"])
            return httpx.Response(200, json=[self.raw])
        self.assertEqual(auth["kind"], 24242)
        self.assertIn(["t", "get"], auth["tags"])
        return httpx.Response(self.status, content=self.payload)

    async def test_pdf_hydration_and_verified_cache_reuse(self):
        await inbound.hydrate_event(self.adapter, self.event)
        path = Path(self.event.media_urls[0])
        self.assertEqual(path.read_bytes(), self.content)
        self.assertEqual(path.parent.name, "documents")
        self.assertEqual(self.event.media_types, ["application/pdf"])
        self.assertEqual(self.event.text, "Original user text")
        self.event.media_urls = []
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertEqual(len(self.calls), 3)

    async def test_image_and_spreadsheet_mime_routes(self):
        for mime, extension, folder in (("image/png", ".png", "images"), ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx", "documents")):
            self.event.media_urls = []
            self.raw["tags"][1][2] = "m " + mime
            self.raw["tags"][1][-1] = "filename nested\\original" + extension
            await inbound.hydrate_event(self.adapter, self.event)
            path = Path(self.event.media_urls[0])
            self.assertEqual(path.suffix, extension)
            self.assertEqual(path.parent.name, folder)
            self.assertEqual(path.read_bytes(), self.content)

    async def test_authorization_denial_and_unknown_make_no_requests(self):
        for authorization in (False, None, 1):
            self.adapter._is_sender_authorized = lambda *args: authorization
            await inbound.hydrate_event(self.adapter, self.event)
        self.adapter._is_sender_authorized = None
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertFalse(self.calls)

    async def test_internal_rejected_and_upstream_hydrated_unchanged(self):
        self.event.internal = True
        await inbound.hydrate_event(self.adapter, self.event)
        self.event.internal = False
        self.event.source.profile_route_rejected = True
        await inbound.hydrate_event(self.adapter, self.event)
        self.event.source.profile_route_rejected = False
        self.event.media_urls = ["already-local"]
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertFalse(self.calls)

    async def test_body_url_not_an_attachment(self):
        self.event.text += " https://evil.example/file.pdf"
        self.raw["tags"] = [["h", "synthetic-chat"]]
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertEqual(len(self.calls), 1)
        self.assertFalse(self.event.media_urls)

    async def test_identity_and_channel_mismatch(self):
        for key, value in (("id", "d" * 64), ("pubkey", "d" * 64), ("kind", 1), ("tags", [["h", "other"]])):
            original = self.raw[key]
            self.raw[key] = value
            self.calls.clear()
            await inbound.hydrate_event(self.adapter, self.event)
            self.assertEqual(len(self.calls), 1)
            self.assertFalse(self.event.media_urls)
            self.raw[key] = original

    async def test_cross_origin_and_duplicate_imeta_rejected(self):
        self.raw["tags"][1][1] = "url https://evil.example/media/" + self.digest
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertEqual(len(self.calls), 1)
        self.raw["tags"][1][1] = "url " + self.url
        self.raw["tags"][1].append("x " + self.digest)
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertEqual(len(self.calls), 2)

    async def test_hash_and_size_mismatch_cleanup(self):
        for payload in (b"x" * len(self.content), self.content + b"extra", self.content[:-1]):
            self.payload = payload
            await inbound.hydrate_event(self.adapter, self.event)
            self.assertFalse(self.event.media_urls)
            self.assertIn("could not be cached", self.event.text)
            self.assertFalse(list(Path(self.temp.name).rglob(".buzz-*")))

    async def test_redirect_not_followed(self):
        self.status = 307
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertFalse(self.event.media_urls)
        self.assertEqual(len(self.calls), 2)

    async def test_aggregate_and_file_count_limits_before_download(self):
        original = self.raw["tags"][1]
        self.raw["tags"] = [["h", "synthetic-chat"]] + [original] * 9
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertEqual(len(self.calls), 1)
        self.raw["tags"] = [["h", "synthetic-chat"], original]
        with patch.object(inbound, "MAX_BYTES", 1):
            await inbound.hydrate_event(self.adapter, self.event)
        self.assertEqual(len(self.calls), 2)
        self.assertFalse(self.event.media_urls)

    async def test_corrupt_cache_not_overwritten(self):
        await inbound.hydrate_event(self.adapter, self.event)
        target = Path(self.event.media_urls[0])
        target.write_bytes(b"other bytes")
        self.event.media_urls = []
        await inbound.hydrate_event(self.adapter, self.event)
        self.assertFalse(self.event.media_urls)
        self.assertEqual(target.read_bytes(), b"other bytes")


if __name__ == "__main__":
    unittest.main()
