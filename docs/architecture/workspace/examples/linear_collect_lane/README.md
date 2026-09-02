# linear_collect_lane example

`linear_collect.binding.example.json` is the public-safe shape of the private
binding consumed by `guild_hall/linear_history/` (the HPP read-only Linear
collection lane). Every value is synthetic:

- `<PRIVATE_ROOT>`, `<REPOSITORY_ROOT>`, and `<RUNTIME_ROOT>` are placeholders
  for host-local absolute paths that never belong in the public tree. The
  real binding lives outside Git under the same private config root the Slack
  lane uses.
- `credentials.api_key_file` is a pointer to a file the Owner writes
  (`<PRIVATE_ROOT>/config/linear_history/credentials/linear_api_key.txt`);
  `credentials.api_key_env` is an optional environment variable name; the key
  value itself is never stored in a binding, receipt, custody object, log, or
  this repository.
- `workspace.url_key`, the project UUID, and `project_scope_ref` are invented.

The lane test binds the placeholders to temporary directories and validates
the result with `validateLinearCollectBinding`, so this example cannot drift
from the runtime contract silently.
