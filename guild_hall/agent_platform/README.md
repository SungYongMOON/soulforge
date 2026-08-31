# Agent Platform composition root — no runtime

Owner: `guild_hall/agent_platform` as the logical `product.agent` composition
surface only. This directory contains only this explanation and
`product.manifest.json`; it is intentionally **not** a Module and therefore has
no `module.manifest.json`, source implementation, state, runtime, writer,
authority, Pack, or release claim.

The current product-owned Modules remain at their existing source owners:

- `guild_hall/agent_observation`
- `guild_hall/ai_usage_meter`
- `guild_hall/codex_work_directory`
- `guild_hall/tool_workshop`

All other currently enrolled Modules are classified Shared by
`guild_hall/module_operability/catalogs/product_module_classification.v0.json`.
The product manifest is a reference-in-place composition contract. It does not
copy or move source, activate a runtime, build a Pack, or release a product.
Those actions remain `HOLD` pending their later, separately authorized PC4–PC6
evidence and Owner decision.
