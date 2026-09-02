# buzz_collect_lane example

`buzz_collect.binding.example.json` is the public-safe shape of the private
binding consumed by `guild_hall/buzz_history/` (the HPP read-only Buzz
collection lane, the Tributary that carries relay Ore into Heartwood). Every
value is synthetic:

- `<PRIVATE_ROOT>`, `<REPOSITORY_ROOT>`, `<RUNTIME_ROOT>`, and
  `<WSL_EXECUTABLE>` are placeholders for host-local absolute paths that never
  belong in the public tree. The real binding lives outside Git under the same
  private config root the Linear and Slack lanes use.
- **There is no `credentials` key, and adding one is rejected.** The relay's
  PostgreSQL is reached over the container's local socket with trust
  authentication, so the lane holds no token, password, or key at all. The
  registrar refuses a binding that declares `credentials`, that contains a
  Nostr secret key (`nsec1…`), or that contains a JWT-shaped value.
- `relay.liveness_url` must be a loopback `_liveness` URL
  (`^http://127\.0\.0\.1:\d+/_liveness$`). The lane pins the request to the
  `127.0.0.1` literal, so no name lookup can move the probe off the host.
- `relay.wsl_executable` must be an absolute path whose basename is `wsl.exe`,
  outside every forbidden root. `relay.mount_prefix` is the single-segment
  drvfs prefix used to translate a Windows drive path into its drvfs form
  (`<drive>:\<rest>` becomes `<mount_prefix>/<drive lowercased>/<rest>`); a
  path that cannot be translated that way (a UNC share, a mapped drive, a
  component with a space or a non-ASCII name) is refused rather than guessed
  at.
- `relay.relay_key` names the custody subfolder under `data_root`, so one
  private root can hold more than one relay without the two ever mixing.
- `cursor.row_limit` bounds one export; a run that fills it reports the
  `row_limit_reached` gap and the next run resumes from the watermark it
  reached. `cursor.timeout_ms` bounds the single export process and must not
  exceed `cursor.run_deadline_ms`.
- `cursor.run_deadline_ms` is the only optional key. It shows the default
  (480000 ms = 8 minutes); omit it to get the same value. The lane bounds it
  to 1000..540000 so the in-process deadline always ends before the
  registrar's 10-minute Scheduled Task execution limit.

The lane test binds the placeholders to temporary directories and validates
the result with `validateBuzzCollectBinding`, so this example cannot drift
from the runtime contract silently.
