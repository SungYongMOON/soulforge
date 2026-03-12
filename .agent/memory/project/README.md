# .agent/memory/project

## 목적

- `project/` 는 프로젝트의 distilled facts 와 공통 맥락을 둔다.

## 포함 대상

- project facts
- durable mission context

## 제외 대상

- raw project source
- workspace deliverable
- active transcript

## 대표 파일

- [`../README.md`](../README.md): memory 상위 owner 경계

## 참조 관계

- project facts 는 `_workspaces` 원본을 요약하지만 원본을 대체하지 않는다.

## 변경 원칙

- 원본 복제가 아니라 distilled fact 만 남긴다.
