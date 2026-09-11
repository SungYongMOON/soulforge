# Buzz image delivery compatibility plugin

This profile-local Hermes user plugin extends the existing Buzz adapter factory.
It changes only the newly created instance's image-file method. It neither edits
Hermes source nor replaces native authentication, connections, local hooks,
configuration, cron delivery or other attachment types.

When Hermes implements `send_image_file` itself, the extension returns the native
instance unchanged. Unknown adapter/CLI contracts refuse initialization instead
of silently applying an incompatible patch. Hermes updates still require the
offline test and a synthetic delivery check; source-file independence is not a
guarantee of future API compatibility.

The plugin retains the native delivery-path validator, passes the local image to
the existing Buzz CLI, preserves thread metadata, and requires an explicit
accepted event receipt. Missing files and uncertain results do not become path
messages or automatic retries. Batch delivery failures remain visible in gateway
logs according to Hermes' existing batch dispatcher.

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
```

Uses the supplied Hermes classes and plugin loader under a temporary Hermes home.
Transport is mocked. It verifies the original failure, image dispatch, path and
response failures, thread targeting, upstream takeover, source-class preservation,
and plugin unload restoring the original platform registration. It does not prove
server upload or UI rendering. Real delivery must use an approved destination
and synthetic PNG; never use an unrelated screenshot as a test fixture.
