"""Extend an existing Buzz instance without editing Hermes or its classes."""
import inspect
import json
import logging
from dataclasses import fields
from pathlib import Path

logger = logging.getLogger(__name__)


def extend_adapter(adapter):
    from gateway.platforms.base import BasePlatformAdapter, SendResult

    original = type(adapter)
    if not isinstance(adapter, BasePlatformAdapter) or original.__name__ != "BuzzAdapter":
        raise RuntimeError("buzz_media: unsupported adapter type")
    # An upstream implementation wins on the next gateway start.
    if original.send_image_file is not BasePlatformAdapter.send_image_file:
        logger.info("buzz_media: native implementation present; extension inactive")
        return adapter
    params = inspect.signature(adapter._run_cli).parameters
    if "args" not in params or "input_text" not in params:
        raise RuntimeError("buzz_media: CLI contract changed")

    class BuzzMediaAdapter(original):
        async def send_image_file(self, chat_id, image_path, caption=None,
                                  reply_to=None, metadata=None, **kwargs):
            def failure(reason):
                # Never echo the local path, credentials or raw CLI stderr.
                logger.warning("buzz_media: %s", reason)
                return SendResult(success=False, error="buzz_media: " + reason,
                                  retryable=False)

            safe = self.validate_media_delivery_path(str(image_path))
            if not safe:
                return failure("file missing or delivery path rejected")
            image = Path(safe)
            if image.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}:
                return failure("unsupported image extension")
            if not image.is_file():
                return failure("file missing")
            args = ["messages", "send", "--channel", str(chat_id),
                    "--file", str(image), "--content", "-"]
            target = (metadata or {}).get("thread_id") or reply_to
            if target:
                args.extend(["--reply-to", str(target)])
            try:
                code, out, _err = await self._run_cli(args, input_text=caption or "")
            except Exception:
                return failure("CLI execution failed; delivery outcome unknown")
            if code != 0:
                return failure("CLI exit " + str(code) + "; delivery not confirmed")
            try:
                data = json.loads(out)
            except (ValueError, TypeError):
                return failure("invalid upload response; delivery outcome unknown")
            if not isinstance(data, dict) or data.get("accepted") is not True:
                return failure("upload acceptance not confirmed")
            event_id = data.get("event_id")
            if not isinstance(event_id, str) or not event_id.strip():
                return failure("missing event receipt; delivery outcome unknown")
            self._mark_seen(str(chat_id), event_id)
            logger.info("buzz_media: image upload accepted")
            return SendResult(success=True, message_id=event_id)

    # Only this factory-created instance changes class; native class and files
    # remain intact, including existing local hooks and connection behavior.
    adapter.__class__ = BuzzMediaAdapter
    logger.info("buzz_media: profile-local image extension active")
    return adapter


def register(ctx):
    from gateway.platform_registry import platform_registry

    entry = platform_registry.get("buzz")
    if entry is None:
        raise RuntimeError("buzz_media: native Buzz registration missing")
    native_factory = entry.adapter_factory

    def factory(config):
        return extend_adapter(native_factory(config))

    # Keep native auth, config, cron, approval and discovery contracts.
    kwargs = {field.name: getattr(entry, field.name) for field in fields(entry)
              if field.init and field.name not in {"source", "plugin_name", "adapter_factory"}}
    ctx.register_platform(adapter_factory=factory, **kwargs)
