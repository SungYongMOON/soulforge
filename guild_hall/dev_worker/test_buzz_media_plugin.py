"""Offline integration tests against an explicitly supplied Hermes checkout.

python test_buzz_media_plugin.py --hermes-root <installed-hermes-repo>
No config, credentials, gateway connection or external send is used.
"""
import argparse
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class ImageDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.image = Path(os.environ["HERMES_HOME"]) / "cache" / "images" / "screen 한글.png"
        self.image.parent.mkdir(parents=True, exist_ok=True)
        self.image.write_bytes(b"\x89PNG\r\n\x1a\nsynthetic")
        # No constructor: it resolves profile credentials. Exercise the real
        # class and inherited dispatch with the transport replaced instead.
        self.adapter = native.BuzzAdapter.__new__(native.BuzzAdapter)
        self.calls = []
        self.text = []
        self.response = (0, json.dumps({"accepted": True, "event_id": "synthetic-event"}), "")

        async def cli(args, *, input_text=None):
            self.calls.append((args, input_text))
            return self.response

        async def send(*args, **kwargs):
            self.text.append((args, kwargs))
            return SendResult(success=True)

        self.adapter._run_cli = cli
        self.adapter.send = send
        self.adapter._mark_seen = lambda *args: None

    async def test_original_reproduces_reported_failure(self):
        await self.adapter.send_image_file("synthetic", str(self.image))
        self.assertFalse(self.calls)
        self.assertIn("Couldn't deliver the image attachment.", self.text[0][1]["content"])

    async def test_real_dispatch_uploads_local_image_in_thread(self):
        adapter = plugin.extend_adapter(self.adapter)
        # Match Hermes' file:// + absolute-path producer (including Windows).
        await adapter.send_multiple_images("synthetic", [("file://" + str(self.image), "caption")],
                                           metadata={"thread_id": "thread-root"})
        self.assertEqual(len(self.calls), 1)
        args, caption = self.calls[0]
        self.assertEqual(Path(args[args.index("--file") + 1]), self.image)
        self.assertEqual(args[args.index("--reply-to") + 1], "thread-root")
        self.assertEqual(caption, "caption")
        self.assertFalse(self.text)

    async def test_receipt_and_reply_precedence(self):
        adapter = plugin.extend_adapter(self.adapter)
        result = await adapter.send_image_file("synthetic", str(self.image), reply_to="parent",
                                               metadata={"thread_id": "root"})
        self.assertTrue(result.success)
        self.assertEqual(result.message_id, "synthetic-event")
        self.assertEqual(self.calls[0][0][-1], "root")

    async def test_missing_file_never_leaks_path_or_sends(self):
        result = await plugin.extend_adapter(self.adapter).send_image_file("synthetic", str(self.image)+"missing")
        self.assertFalse(result.success)
        self.assertFalse(self.calls)
        self.assertFalse(self.text)
        self.assertNotIn(str(self.image), result.error)

    async def test_rejected_and_malformed_receipts(self):
        adapter = plugin.extend_adapter(self.adapter)
        for response in [(2, "", "sensitive stderr"), (0, "broken", ""),
                         (0, "[]", ""), (0, "{}", ""),
                         (0, '{"accepted":false}', ""),
                         (0, '{"accepted":true}', "")]:
            with self.subTest(response=response[:2]):
                self.response = response
                result = await adapter.send_image_file("synthetic", str(self.image))
                self.assertFalse(result.success)
                self.assertFalse(result.retryable)
                self.assertNotIn("sensitive", result.error)

    async def test_upstream_implementation_wins(self):
        async def upstream(*args, **kwargs):
            return SendResult(success=True, message_id="upstream")
        cls = type("BuzzAdapter", (native.BuzzAdapter,), {"send_image_file": upstream})
        instance = cls.__new__(cls)
        self.assertIs(plugin.extend_adapter(instance), instance)
        self.assertIs(type(instance), cls)

    async def test_native_class_not_modified(self):
        plugin.extend_adapter(self.adapter)
        self.assertIs(native.BuzzAdapter.send_image_file, BasePlatformAdapter.send_image_file)

    async def test_real_plugin_loader_preserves_native_registration(self):
        from hermes_cli.plugins import PluginManager, PluginContext, PluginManifest
        from gateway.platform_registry import platform_registry
        manager = PluginManager()
        ctx = PluginContext(PluginManifest(name="synthetic-native", source="bundled"), manager)
        native.register(ctx)
        before = platform_registry.get("buzz")
        manifests = manager._scan_directory(Path(__file__).parent, source="user")
        manifest = next(m for m in manifests if m.name == "soulforge-buzz-media")
        manager._load_plugin(manifest)
        after = platform_registry.get("buzz")
        self.assertIsNot(before, after)
        self.assertEqual(after.allowed_users_env, before.allowed_users_env)
        self.assertIs(after.check_fn, before.check_fn)
        self.assertIs(after.standalone_sender_fn, before.standalone_sender_fn)
        self.assertIs(after.apply_yaml_config_fn, before.apply_yaml_config_fn)
        manager.unload(manifest.key or manifest.name)
        self.assertIs(platform_registry.get("buzz"), before)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hermes-root", type=Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="buzz-media-offline-") as home:
        os.environ["HERMES_HOME"] = home
        for key in list(os.environ):
            if key.startswith("BUZZ_") or key in {"HERMES_PROFILE", "HERMES_BUZZ_PILOT_BINDING"}:
                os.environ.pop(key)
        sys.path.insert(0, str(args.hermes_root.resolve()))
        from gateway.platforms.base import BasePlatformAdapter, SendResult
        native = load("buzz_media_test_native", args.hermes_root / "plugins/platforms/buzz/adapter.py")
        plugin = load("buzz_media_test_extension", Path(__file__).parent / "buzz_media_plugin/__init__.py")
        result = unittest.main(argv=[sys.argv[0]], exit=False).result
        sys.exit(0 if result.wasSuccessful() else 1)
