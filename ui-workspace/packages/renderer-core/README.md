# packages/renderer-core

## 목적

- `renderer-core/` 는 renderer v1 의 framework-neutral consumer core 를 둔다.
- raw fixture 또는 legacy derive payload 를 normalized UI state 로 바꾸고, shell 이 쓰는 view-model helper 를 제공한다.

## 포함 대상

- state types
- ui-contract re-export
- legacy derive adapter
- state loader
- selection reducer
- icon/material mapping
- fixture validation CLI

## 제외 대상

- canonical source scan/resolve/validate
- web-only CSS skin
- persistence/control-plane

## 관련 경로

- [packages/README.md](../README.md)
- [packages/ui-contract/README.md](../ui-contract/README.md)
- [apps/renderer-web/README.md](../../apps/renderer-web/README.md)
- [docs/UI_STATE_CONTRACT.md](../../docs/UI_STATE_CONTRACT.md)
- [schemas/ui-state.schema.json](../../schemas/ui-state.schema.json)
