# .agent/autonomic/reminders

## 목적

- `reminders/` 는 저소음 reminder 경계를 둔다.

## 포함 대상

- verify reminder
- docs sync reminder
- unresolved handoff reminder

## 제외 대상

- intrusive notification system
- scheduler daemon
- project-specific alarm

## 대표 파일

- [`../README.md`](../README.md): autonomic 상위 owner 경계

## 참조 관계

- reminders 는 quality hygiene 를 돕지만 protocol canonical state 를 대체하지 않는다.

## 변경 원칙

- reminder noise 는 낮게 유지하고 task owner 를 넘는 orchestration 으로 키우지 않는다.
