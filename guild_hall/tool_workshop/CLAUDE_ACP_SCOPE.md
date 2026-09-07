# Scoped Claude execution adapter

This is a candidate adapter under the existing Tool Workshop owner. It implements
the standard ACP stdio entry accepted by Buzz's custom harness registration, without
changing Buzz or its native Claude adapter. A fixed per-job binding controls the
working directory, CLI bytes, model, instruction bytes and tool names. It is usable
by different organization roles without granting one role the authority of another.

The observed Buzz source is commit
`95154bee4034ca7a40b33095c2ddbde8c9aa1614`. Its registration contract is
`desktop/src-tauri/src/managed_agents/custom_harnesses.rs::HarnessDefinition`.
The native path sets a default home cwd and may replace `CLAUDE_CODE_EXECUTABLE`
after persona environment merging. This adapter uses a distinct custom harness
identity and direct CLI execution; it does not wrap or patch the installed global
ACP package. No additional npm dependency is required.

## Buzz compatibility

The adapter supports ACP protocol 1. Initialization follows version negotiation:
a positive safe-integer request for a newer version receives the latest supported
version, `1`; missing, zero, negative, fractional and wrongly typed versions are
refused. `_meta.requestedProtocolVersion` records only the requested version for
readback. It does not grant client filesystem, terminal or other capabilities.
The Buzz log's `agent=0` is a pool index, not evidence of protocol 0 support.

The referenced Buzz source temporarily requests protocol 2 and chooses its legacy
prompt handling for an agent that responds with protocol 1. A separate installed
Buzz ACP metadata-only `models` probe also observed a protocol 2 request with
`clientInfo` name `buzz-acp`, version `0.1.0`, followed by `session/new` and a clean
exit after a synthetic peer responded with protocol 1. That probe used no relay,
credentials, work prompt or actual model. It confirms this negotiation path only;
it does not establish the full bot pool or installed scoped adapter's work-turn
behavior. The synthetic sequence uses the referenced source's `auth`/`_meta`
capabilities; an additional broad filesystem/terminal capability case verifies
that client capabilities do not become inner Claude authority.

`session/new` returns a single fixed model in both `models` and `configOptions`.
`session/set_model` and `session/set_config_option` with `configId: "model"`
acknowledge only that exact binding model and return the same complete catalog.
They neither launch Claude nor change configuration. Other models, modes, effort
options and extra setter keys are refused. In particular, an outer Buzz
`bypassPermissions` request remains refused; a subsequent valid model selection
and prompt can continue with inner Claude's `default` mode and fixed tools.

Buzz's `sessionTitle`, cwd and system-prompt metadata do not replace binding
instructions. Legacy `[SYSTEM]` standing context inside a prompt remains user
text; it is never appended to the inner instruction packet. Client-supplied MCP
servers, including Buzz's optional global MCP with environment entries, remain
refused. This compatibility work does not complete the M05 input-release bridge,
shared job tracing, protected original-input/output capture or the workshop chain.

The `tool-workshop-claude-acp-v2` source-lane specification carries the same four
production source paths and no prior runtime state. Its `v2` is a packaging revision,
not ACP protocol 2 support. The earlier v1 specification and installed lane remain
separate; building this source revision does not install or activate it.

## Runtime contract

`src/claude_acp_cli.mjs` accepts only:

```text
node <installed-adapter>/claude_acp_cli.mjs --binding <private-binding.json> --binding-sha256 <exact-sha256>
node <installed-adapter>/claude_acp_cli.mjs --preflight --binding <private-binding.json> --binding-sha256 <exact-sha256>
```

The same entrypoint has an internal `--workspace-mcp` mode for the one fixed stdio
MCP child. `--preflight` performs only the native metadata control handshake and
exits without a user prompt or tool invocation. A registered harness uses an absolute Node executable as `command` and
the remaining items as the `args` array. Arguments containing commas are rejected
by Buzz's existing transport. Do not create a shell command string or substitute a
native `claude` harness with arbitrary environment overrides.

There is no registration/installation writer here. Installing files into an
approved versioned source lane, creating the exact per-bot custom harness,
selecting it on the intended stopped bot, and reading that configuration back are
separate integration actions. Never execute the production adapter from a Git
checkout. Credentials are not copied into a new home. The official CLI retains
its own existing OAuth authentication at the standard host location.

The local binding is a strict JSON object, not an accepted actor row or canonical
workspace record. Every field below is required; unknown fields are refused.

| Field | Required meaning |
| --- | --- |
| `version` | Integer `1` |
| `botRef`, `roleRef`, `projectRef`, `jobRef` | Exact current registration/assignment references; no inferred historical metadata |
| `inputFiles` | At most 200 exact `{path,sha256}` entries projected from the existing reviewed input packet; paths are relative to `jobRoot`. Empty means no existing files are readable |
| `workRoot` | Existing approved mutable bot work folder, fully resolved absolute path |
| `jobRoot` | Exactly `workRoot/JOBS/jobRef`, pre-created by the trusted job dispatcher |
| `model` | Exact approved CLI model identifier; the observed runtime identifier must match |
| `cliPath`, `cliSha256` | Explicit native Claude executable and measured SHA-256 |
| `nodeSha256` | Measured SHA-256 of the Node executable running the adapter |
| `instructions` | Exact `{ref,path,sha256}` for the instruction file |
| `skills` | At most eight explicit `{ref,path,sha256}` text packets; no auto-discovery or executable Skill tool |
| `tools` | Nonempty unique subset of `workspace_list`, `workspace_read_text`, `workspace_write_text` |
| `sourceHashes` | Exact SHA-256 map for the four `claude_acp_*.mjs` production files |
| `expiresAt` | Current authorization expiry as Unix milliseconds |

Use OS-native fully resolved path strings in this binding. The binding and adapter
sources must be outside the mutable bot work folder. Instruction packets may be in
the bot folder but must be outside the job's writable subtree. The canonical
`_workspaces` and `_workmeta` planes are forbidden as either working root. Runtime
refs never authorize moving old metadata into them.

The installer owns authenticity and actor/assignment resolution. External data
release remains with M05 and the existing reviewed/signed exact-byte input packet;
this adapter creates no separate approval protocol. A reference string or SHA pin
is not a release permit, signature, OS principal binding, or proof that a human
accepted a business artifact. Public/synthetic test scope already authorized by the
Owner should be reused. Real work inputs and incoming prompts must pass the existing
release/packet bridge before this adapter receives them. That bridge integration is
still required; a runtime declaration cannot promote a bot's `capability_ready`.

## Enforced boundaries

- Every launch verifies the CLI, Node and adapter source pins. The CLI's bounded
  `--help` probe must advertise the required options. Unknown runtimes fail before
  the work prompt is sent. No PATH or global module fallback selects another CLI.
  Windows native installation may use hardlinks for its executable. Only the CLI
  path in a validated binding permits multiple links, while checking exact SHA-256,
  regular-file identity, size, mtime and link count during each read. The adapter
  reads these bytes without writing them; this does **not** mean the OS prevents
  another process from modifying them. Writable installer hardlinks are intentionally
  allowed under these checks. A generic reader or caller-supplied purpose cannot
  select this exception. Working files, bindings, instructions and adapter sources
  still require a single link. CLI bytes are rechecked before each prompt's metadata
  handshake and immediately before launching a new process.
- Claude receives `--strict-mcp-config` with exactly the local workspace MCP,
  `--tools ""`, `--disable-slash-commands`, empty `--setting-sources`, fixed
  `--settings` disabling hooks/auto memory/plugins, and the exact model/instructions.
  Permission mode stays `default`; there is no bypass flag. Only the named fixed
  MCP tools receive permission rules, and any permission control request is denied.
- Ambient Buzz keys, provider overrides, `NODE_OPTIONS`, `CLAUDE_CONFIG_DIR`, and
  arbitrary tool environment variables are not inherited by the Claude child.
  Normal OS paths remain available so existing CLI-owned authentication can work.
  `ENABLE_CLAUDEAI_MCP_SERVERS=false` and the `disableClaudeAiConnectors` setting
  additionally request that the CLI not fetch account-linked cloud connectors.
  They are separate from strict local MCP configuration. Their effect in the
  installed native version must still be measured; help text is not proof of it.
- Client-supplied MCP servers, additional roots and Claude options are refused.
  Buzz's default cwd and prompt metadata are untrusted hints and do not replace the
  fixed binding. Changing the fixed model, session loading/resume and slash commands
  are unsupported. Acknowledging the already bound model is supported as described
  above. Typed ACP text blocks are accepted; embedded resources are refused.
- Before sending the first work prompt, the host sends correlated native
  `control_request` frames for `initialize`, `mcp_status` and `get_context_usage`.
  It checks default permission mode, no slash commands, the exact connected MCP
  and tool names, the selected model and no discovered memory/custom-agent context.
  A pending MCP connection receives a bounded metadata wait; failed/foreign or
  unsupported replies close the session with zero work prompts sent. The MCP and
  context checks repeat before later prompts. Client metadata cannot supply or
  spoof these control replies.
- Before returning a successful turn or assistant text, the CLI's actual init
  frame must report the exact effective cwd/model, connected workspace MCP, and
  exactly the configured tool names (plus the provider's non-I/O EndConversation
  control where present). Missing or broader inventory closes the session. This
  readback corroborates flags; it is not a hostile-runtime attestation.
  Every block of an assistant frame is validated before any text in that frame is
  emitted; a later forbidden tool or unknown block cannot leak earlier text.
- Each ACP session retains one in-memory CLI conversation. No disk persistence or
  cross-session resume is requested. At most one turn is active across the adapter;
  cancellation, timeout, invalid output, drift or process loss closes that session
  without retrying or replaying the work request. Restart requires a fresh session.
- The file broker restricts listing and UTF-8 read/create to the assigned job.
  Existing readable files must appear in `inputFiles` and match the pinned bytes.
  Newly created drafts are readable only by their producing broker instance and
  exact recorded hash. Unlisted existing files are omitted from listing. Restart
  does not silently adopt leftover drafts as inputs.
  Reads/writes are capped at 64 KiB, listing at 200 entries. Only `.txt`, `.md` and
  `.json` files are admitted. Traversal, absolute paths, ADS, hidden/reserved names,
  junctions, symlinks and multiply-linked files are rejected. Current root identity,
  binding, instructions and file identities are rechecked. Writes require the exact
  `jobRef`, purpose `work_draft` and exclusive create; existing bytes are preserved.
  The same relative-path grammar is applied when the binding is loaded, so an
  invalid input manifest cannot reach executable loading or workspace access.

`settingSources` alone does not suppress global `.claude.json` or managed policy.
The strict MCP and builtin/skill restrictions are separate controls. This adapter
does not inspect or edit those global files, weaken managed policy, prove that no
global instruction metadata was consulted internally, or provide an OS sandbox.
Its scoped tool surface prevents the agent from requesting shell/filesystem escape;
hostile concurrent host filesystem replacement remains outside that guarantee.
Runtime SHA pins are neither origin signatures nor proof of OS immutability.
No read-only attribute, file ACL or installed executable is modified by the adapter.
The interval after a successful byte check is not a complete defense against a
hostile OS actor concurrently changing or replacing the executable.
In a detected write race, preserve any partial unaccepted draft for inspection.
An unexpected init inventory closes the session, but does not prove that no setup
side effects preceded that inventory. Actual provider setup behavior remains a
separate measurement.

## Validation and integration limits

```text
node --test guild_hall/tool_workshop/tests/claude_acp_scope.test.mjs
node --test guild_hall/tool_workshop/tests/claude_acp_buzz_compat.test.mjs
node guild_hall/tool_workshop/src/claude_acp_cli.mjs --help
```

The tests run actual synthetic lower processes and the actual standalone MCP
entrypoint, including serialized argv, cwd, two-turn stdio, scope rejection,
current-binding/instruction/root changes, unsupported CLI, broader tool inventory,
hardlink/junction access, concurrency and cancellation. Windows uses its existing
.NET Framework compiler to build a tiny synthetic CLI; POSIX uses a standard Node
executable fixture. Neither fixture calls Claude, a model or an external service.
No fallback test executable is silently substituted when compilation fails.

The Buzz compatibility suite invokes the actual adapter stdio CLI with the same
synthetic Claude executable. It covers initialization, session creation, both
pinned model selectors, two prompt text blocks, streamed reply and stop, plus a
refused outer permission request followed by a successful scoped turn. Invalid
negotiation, model/config widening, global MCP requests, malformed scope arrays,
and standalone CLI preflight failures are checked without real model/network use.
The existing scope suite retains the full assistant-frame and native metadata
gates. This fixture execution is not a real Buzz bot-pool conversation.

An isolated metadata-only `--help`/`--version` probe against native Claude Code
`2.1.226` confirmed the needed public option names. The actual adapter also completed
its three-control preflight against that native executable and its real source-bound
workspace MCP: three exact tools, selected model and zero memory files, with zero
user/work prompts, tool calls or assistant updates. It used a synthetic home/job
with no copied authentication. MCP `2025-11-25` negotiation was exercised.
A separate synthetic native control run with user settings enabled and strict MCP
disabled loaded an extra configured global MCP and produced its startup marker.
The adapter's protected synthetic run retained only the workspace MCP and produced
no global startup marker. This measures the combined configuration boundary in
synthetic homes, not the real Owner account's complete connector inventory.

This native version does not emit `system/init` before a user prompt. Its metadata
context also omits the optional `systemTools` inventory, so preflight reports
`builtinInventoryObserved:false`; the fixed `--tools ""` enforcement is not relabeled
as pre-prompt builtin readback. After a permitted work prompt, the separate full-init
gate remains required. That native preflight did not exercise actual authentication,
model execution, post-prompt native inventory, Buzz registration or user work. Those measurements
remain necessary before calling the new bot's isolation verified. A user-facing
instruction file alone did not prevent global MCP inheritance in the earlier
native-harness observation.

This initial tool surface produces working text drafts only. Connecting the existing
Tool Workshop queue, rendering and artifact validators remains required for a PPT
bot's complete capability. Safely scoped edits/test runners for development roles
also remain required; this adapter does not silently expose Bash to fill that gap.
Candidate receipt, external delivery, human acceptance and official completion
remain distinct. Follow-up technical work must not be mislabeled as Owner setup.

Official source references:

- [Claude CLI reference](https://code.claude.com/docs/en/cli-usage)
- [SDK configuration boundaries](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
- [Claude account-linked MCP controls](https://code.claude.com/docs/en/mcp)
- [MCP initialization contract](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [ACP version negotiation](https://agentclientprotocol.com/protocol/v1/initialization)
- [ACP session configuration](https://agentclientprotocol.com/protocol/v1/session-config-options)
- [Buzz ACP initialization and model contract](https://github.com/block/buzz/blob/95154bee4034ca7a40b33095c2ddbde8c9aa1614/crates/buzz-acp/src/acp.rs)
- [Buzz pool protocol and permission handling](https://github.com/block/buzz/blob/95154bee4034ca7a40b33095c2ddbde8c9aa1614/crates/buzz-acp/src/pool.rs)
- [Buzz custom harness source](https://github.com/block/buzz/blob/95154bee4034ca7a40b33095c2ddbde8c9aa1614/desktop/src-tauri/src/managed_agents/custom_harnesses.rs)
