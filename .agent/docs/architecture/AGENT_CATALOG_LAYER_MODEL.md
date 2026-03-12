# agent catalog layer 모델

## 목적

- `.agent/catalog/**` 를 body 내부 selection layer 로 고정한다.
- active, catalog, canonical definition layer 의 경계를 catalog 관점에서 설명한다.

## 왜 catalog 가 `.agent` 안에 있는가

- UI 에서 현재 body 가 선택할 수 있는 후보는 body owner 경계에서 보여야 한다.
- species, hero, profile, skill, tool, knowledge, workflow selection 은 body 가 소비하는 선택 행위다.
- canonical class asset 의 정본은 `.agent_class/**` 에 남겨도, selection index 는 `.agent` 가 소유하는 것이 owner 경계상 자연스럽다.

## 구조

```text
.agent/catalog/
├── identity/
│   ├── species/
│   └── heroes/
└── class/
    ├── profiles/
    ├── skills/
    ├── tools/
    ├── knowledge/
    └── workflows/
```

## 레이어 규칙

- active identity 는 `.agent/identity/**` 에 둔다.
- identity candidate canonical source 는 `.agent/catalog/identity/**` 에 둔다.
- class canonical source 는 `.agent_class/**` 에 둔다.
- `.agent/catalog/class/**` 는 `.agent_class/**` 의 `source_ref` 기반 index 다.

## generator 와 runtime 구분

- future generator 는 species/hero candidate 를 `catalog/identity/**` 로 채울 수 있다.
- future selection UI 는 `catalog/**` 를 읽고 active layer 를 갱신할 수 있다.
- 이 둘은 body core runtime concern 이 아니라 catalog population or selection concern 이다.
