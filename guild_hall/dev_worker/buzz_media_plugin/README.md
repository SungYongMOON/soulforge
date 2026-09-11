# Buzz attachment delivery compatibility plugin

This profile-local Hermes user plugin extends the existing Buzz adapter factory.
It supplies missing image, document, voice-file and video-file methods on the newly
created instance. It neither edits
Hermes source nor replaces native authentication, connections, local hooks,
configuration or cron delivery.

When Hermes implements a method itself, that native method wins independently;
an upstream image fix does not disable the document extension. Unknown adapter/CLI
contracts refuse initialization instead
of silently applying an incompatible patch. Hermes updates still require the
offline test and a synthetic delivery check; source-file independence is not a
guarantee of future API compatibility.

The plugin retains the native delivery-path validator and the existing CLI for
images. General files use Buzz's Blossom upload and NIP-98 event API because the
tested native CLI rejects PDFs before upload. The existing native Nostr signer,
profile key, relay and optional delegation header are reused without copying or
editing credential files. No credentials are sent to redirected or returned URLs.
Documents retain original bytes and their download filenames; thread metadata and
an exact accepted event receipt are required. Missing files and uncertain results
do not become path messages or automatic retries.

The generic path accepts files up to 100 MiB and preserves server validation.
PDF, Excel, Word, PowerPoint, HWPX, archives, text/data and supported audio/video
can use it; this is not a promise that every format is accepted. The server can
reject dangerous formats, unsupported media containers or stricter size limits.
Voice files are attachments, not a promise of platform-specific voice bubbles.
Images still use the existing CLI limits. Documents are download attachments;
preview availability depends on Buzz and the file type.

## Automatic first-page preview

For outgoing PDF and Office documents, the plugin automatically adds a first-page
PNG below the download card in the same message. The caller supplies only the
document. The preview is rendered from the exact uploaded byte snapshot, never
from a later edit of the source file. PDF uses PyMuPDF; Office uses an installed
LibreOffice with a unique profile and macro/linked-content restrictions. Converter
children receive OS essentials only, without gateway credential environment.
Each conversion/raster step has a 45-second limit with owned-process-tree cleanup.
The thumbnail is bounded to 1000 by 1400 pixels and 5 MiB.

Missing converters, unsupported types (including archives and HWPX previews),
conversion errors and failed thumbnail uploads retain the original file card.
This does not change Buzz's file-card click behavior: it downloads the original.
It does not add a multipage document viewer or alter human-uploaded messages.
LibreOffice layout may differ from the originating Office application; the
downloaded original is authoritative. Program settings are not OS network isolation.

## Install and recover

After passing the test below, copy this directory to the exact approved profile's
`plugins/soulforge-buzz-media/`, outside the Hermes checkout. Back up that profile's
configuration privately, then enable `soulforge-buzz-media` with Hermes' plugin
command. The profile needs a controlled gateway restart to create a new adapter.
Never start a second gateway or restart unrelated profiles. Do not change the
Buzz identity, model, relay or credentials.

Rollback: disable `soulforge-buzz-media` with the same profile selected and restart
that gateway. The installed plugin can stay on disk disabled. Preserve the prior
configuration backup, source hashes and exact deployment receipt privately.

## Offline verification

```text
python guild_hall/dev_worker/test_buzz_media_plugin.py --hermes-root <hermes-checkout>
python guild_hall/dev_worker/buzz_media_plugin/test_file_transport.py
python guild_hall/dev_worker/buzz_media_plugin/test_document_preview.py
```

Uses the supplied Hermes classes and plugin loader under a temporary Hermes home.
Transport is mocked. It verifies the original failure, image dispatch, path and
response failures, thread targeting, upstream takeover, source-class preservation,
and plugin unload restoring the original platform registration. Transport tests
use mocked HTTP and synthetic signing. They do not prove server upload or UI
rendering. Real delivery must use an approved destination and synthetic fixtures,
then download and hash-compare documents; never use business files as test data.
