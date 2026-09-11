"""Offline transport checks; only synthetic keys, bytes, and mocked HTTP."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch, AsyncMock

import httpx

spec = importlib.util.spec_from_file_location("file_transport_under_test", Path(__file__).with_name("file_transport.py"))
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class BuzzAdapter:
    relay_url = "https://relay.example"
    _private_key = "synthetic-only"

    def _mark_seen(self, channel, event):
        self.seen = event


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "report.pdf"
        self.path.write_bytes(b"%PDF synthetic test only")
        self.calls = []
        self.channel = "00000000-0000-0000-0000-000000000001"
        self.parent = "a" * 64
        self.root = "b" * 64
        self.parent_tags = [["h", self.channel]]
        self.blob_change = {}
        self.receipt_change = {}
        self.status = 200
        self.fail_publish = False
        self.preview_failure = False
        self.preview_blob_change = {}
        self.adapter = BuzzAdapter()
        native = types.SimpleNamespace(
            _load_nostr_auth=lambda: types.SimpleNamespace(public_key_hex=lambda key: "c" * 64, schnorr_sign=lambda digest, key: b"s" * 64),
            os=types.SimpleNamespace(getenv=lambda name, default: "synthetic-membership"))
        self.stack = patch.dict(sys.modules, {BuzzAdapter.__module__: native,
            "gateway.platforms.base": types.SimpleNamespace(SendResult=lambda **kw: types.SimpleNamespace(**kw))})
        self.stack.start()
        self.addCleanup(self.stack.stop)
        real_client = httpx.AsyncClient
        self.client_patch = patch.object(transport.httpx, "AsyncClient", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(self.handle), **kw))
        self.client_patch.start()
        self.addCleanup(self.client_patch.stop)
        self.preview_patch = patch.object(transport, "_preview_bytes", AsyncMock(return_value=None))
        self.preview_mock = self.preview_patch.start()
        self.addCleanup(self.preview_patch.stop)

    def handle(self, request):
        self.calls.append(request)
        self.assertEqual(request.headers["x-auth-tag"], "synthetic-membership")
        token = request.headers["authorization"].split()[1]
        auth = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
        if request.url.path != "/upload":
            self.assertIn(["payload", hashlib.sha256(request.content).hexdigest()], auth["tags"])
            self.assertEqual(auth["kind"], 27235)
        if request.url.path == "/query":
            return httpx.Response(200, json=[dict(id=self.parent, tags=self.parent_tags)])
        if request.url.path == "/upload":
            if request.content.startswith(b"\x89PNG"):
                if self.preview_failure:
                    return httpx.Response(415, json={"error":"preview rejected"})
                blob = dict(url="https://relay.example/media/preview.png",
                    sha256=hashlib.sha256(request.content).hexdigest(), size=len(request.content), type="image/png")
                blob.update(self.preview_blob_change)
                return httpx.Response(200, json=blob)
            self.assertEqual(request.content, self.path.read_bytes())
            self.assertEqual(auth["kind"], 24242)
            self.assertIn(["server", "relay.example"], auth["tags"])
            digest = hashlib.sha256(request.content).hexdigest()
            self.assertEqual(request.headers["X-SHA-256"], digest)
            self.assertIn(["x", digest], auth["tags"])
            blob = dict(url="https://relay.example/media/file.pdf", sha256=hashlib.sha256(request.content).hexdigest(), size=len(request.content), type="application/pdf")
            blob.update(self.blob_change)
            return httpx.Response(self.status, json=blob)
        if self.fail_publish:
            raise httpx.ReadTimeout("sensitive failure must be hidden")
        event = json.loads(request.content)
        self.event = event
        receipt = dict(accepted=True, event_id=event["id"])
        receipt.update(self.receipt_change)
        return httpx.Response(200, json=receipt)

    async def send(self, **kwargs):
        return await transport.send_file(self.adapter, self.channel, self.path, **kwargs)

    async def test_document_filename_and_receipt(self):
        result = await self.send(file_name="private\\한글 보고서.pdf", caption="report")
        self.assertTrue(result.success)
        self.assertEqual(self.adapter.seen, result.message_id)
        self.assertIn("filename 한글 보고서.pdf", self.event["tags"][-1])
        self.assertEqual(self.event["content"], "report\n[한글 보고서.pdf](https://relay.example/media/file.pdf)")

    async def test_nested_reply(self):
        self.parent_tags += [["e", self.root, "", "reply"]]
        self.assertTrue((await self.send(reply_to=self.parent)).success)
        self.assertIn(["e", self.root, "", "root"], self.event["tags"])
        self.assertIn(["e", self.parent, "", "reply"], self.event["tags"])

    async def test_root_only_parent_is_top_level(self):
        self.parent_tags += [["e", self.root, "", "root"]]
        self.assertTrue((await self.send(metadata={"thread_id": self.parent})).success)
        self.assertNotIn(["e", self.root, "", "root"], self.event["tags"])

    async def test_wrong_channel_stops_before_upload(self):
        self.parent_tags = [["h", "other"]]
        self.assertFalse((await self.send(reply_to=self.parent)).success)
        self.assertEqual(len(self.calls), 1)

    async def test_bad_descriptors_stop_publish(self):
        for change in ({"sha256": "d" * 64}, {"url": "https://other.example/file"}, {"size": True}, {"type": "bad\nvalue"}):
            self.calls.clear()
            self.blob_change = change
            self.assertFalse((await self.send()).success)
            self.assertEqual(len(self.calls), 1)

    async def test_redirect_not_followed(self):
        self.status = 307
        self.assertFalse((await self.send()).success)
        self.assertEqual(len(self.calls), 1)

    async def test_http_status_is_reported_without_response_payload(self):
        for status in (403, 413, 415):
            self.calls.clear()
            self.status = status
            self.blob_change = {"error": "sensitive response payload"}
            result = await self.send()
            self.assertFalse(result.success)
            self.assertEqual(result.error, "buzz_media: upload failed; delivery not confirmed; HTTP " + str(status))
            self.assertEqual(len(self.calls), 1)

    async def test_wrong_receipt_rejected(self):
        for change in ({"event_id": "d" * 64}, {"accepted": False}, {"event_id": None}):
            self.receipt_change = change
            self.assertFalse((await self.send()).success)

    async def test_timeout_is_sanitized_without_retry(self):
        self.fail_publish = True
        result = await self.send()
        self.assertFalse(result.success)
        self.assertFalse(result.retryable)
        self.assertNotIn("sensitive", result.error)
        self.assertEqual(len(self.calls), 2)

    async def test_size_and_filename_guard(self):
        with patch.object(transport, "MAX_FILE_BYTES", 1):
            self.assertFalse((await self.send()).success)
        self.assertFalse((await self.send(file_name="bad\nname")).success)
        self.assertFalse(self.calls)

    async def test_read_growth_capped_even_after_small_stat(self):
        with patch.object(transport, "MAX_FILE_BYTES", 1), patch.object(Path, "is_file", return_value=True), patch.object(Path, "stat", return_value=types.SimpleNamespace(st_size=0)):
            self.assertFalse((await self.send()).success)
        self.assertFalse(self.calls)

    async def test_media_sanitized_descriptor_may_change_hash(self):
        self.path = self.path.with_suffix(".mp4")
        self.path.write_bytes(b"synthetic media")
        self.blob_change = {"sha256": "d" * 64, "type": "video/mp4"}
        self.assertTrue((await self.send()).success)

    async def test_unconfigured_key_never_sends(self):
        self.adapter._private_key = ""
        self.assertFalse((await self.send()).success)
        self.assertFalse(self.calls)

    async def test_link_filename_and_url_delimiters_are_escaped(self):
        self.blob_change = {"url": "https://relay.example/media/file(1).pdf"}
        self.assertTrue((await self.send(file_name="a[b].pdf")).success)
        self.assertEqual(self.event["content"], "\n[a\\[b\\].pdf](https://relay.example/media/file%281%29.pdf)")
        self.assertIn("url https://relay.example/media/file%281%29.pdf", self.event["tags"][-1])

    async def test_total_message_length_checked_after_link_added(self):
        result = await self.send(caption="x" * 65536)
        self.assertFalse(result.success)
        self.assertEqual(len(self.calls), 1)

    async def test_automatic_preview_is_in_same_message(self):
        self.preview_mock.return_value = b"\x89PNG\r\n\x1a\nsynthetic preview"
        result = await self.send()
        self.assertTrue(result.success)
        self.assertEqual(len(self.calls), 3)
        media = [t for t in self.event['tags'] if t[0]=='imeta']
        self.assertEqual(len(media), 2)
        self.assertIn('m image/png', media[1])
        self.assertIn('![First page preview](', self.event['content'])

    async def test_preview_rejection_keeps_original_attachment(self):
        self.preview_mock.return_value = b"\x89PNG\r\n\x1a\nsynthetic preview"
        self.preview_failure = True
        result = await self.send()
        self.assertTrue(result.success)
        self.assertEqual(len([t for t in self.event['tags'] if t[0]=='imeta']), 1)
        self.assertNotIn('![First page preview](', self.event['content'])

    async def test_wrong_preview_digest_or_size_keeps_original_only(self):
        self.preview_mock.return_value = b"\x89PNG\r\n\x1a\nsynthetic preview"
        for change in ({'sha256':'d'*64}, {'size':1}):
            self.preview_blob_change = change
            result = await self.send()
            self.assertTrue(result.success)
            self.assertEqual(len([t for t in self.event['tags'] if t[0]=='imeta']), 1)
            self.assertNotIn('![First page preview](', self.event['content'])


if __name__ == "__main__":
    unittest.main()
