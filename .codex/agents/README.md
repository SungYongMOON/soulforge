# Project Codex agents

## `folder_inventory`

`folder_inventory` is a project-scoped, read-only worker for a first-pass inventory of one explicitly named folder. It records deterministic filesystem metadata only, skips reparse points, and does not read file bodies, extract text, hash files, run OCR, or change the source tree.

Invoke it as a subagent with exactly one authorized folder root and explicit time and file-count budgets. The target must already be one of the session workspace roots or be added as an additional directory for that invocation. Do not grant broader disk access. The worker returns a concise structured result to the parent agent. Because its sandbox is read-only, the parent is responsible for reviewing the result and writing any durable CSV, JSON, or other catalog to an authorized location.

Custom-agent discovery and configuration inheritance can vary by Codex surface and version. Settings omitted from an agent file may inherit from the active parent or project configuration; the explicit model, reasoning effort, and sandbox settings in this file are intended to keep this worker bounded. Confirm that `gpt-5.6-luna` is available in the active Codex model catalog before invoking the agent. If it is unavailable, do not silently substitute another model; report the availability gap and let the parent choose the fallback.
