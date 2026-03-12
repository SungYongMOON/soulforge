# .agent/catalog/identity/heroes

## 목적

- `heroes/` 는 optional hero candidate catalog 를 둔다.
- hero 는 class 나 profile 대체재가 아니라 species 위에 얹히는 identity overlay 후보군이다.
- hero candidate canonical source 는 motif / imprint 구조만 저장한다.

## 포함 대상

- `index.yaml`
- species 별 candidate 하위 폴더
- motif 또는 imprint 기반 hero candidate

## 제외 대상

- 실존 인물 또는 특정 IP 캐릭터의 직접 복제 데이터
- active hero selection state

## 규칙

- `index.yaml` 은 `source_ref` 로 hero candidate 정본을 가리킨다.
- hero candidate 는 bias / imprint 만 저장하고 factual or policy override 를 저장하지 않는다.
