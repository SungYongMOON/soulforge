# class profile 모델

## 목적

- profile 을 hero 대체재가 아니라 default preference mode 로 고정한다.

## profile 의미

- workflow 가 없을 때 먼저 떠올릴 preferred workflow
- workflow 가 여러 개일 때 먼저 제안할 기본 성향
- preferred skill, tool, knowledge 조합
- verify-first, report-style 같은 운용 기본값

## profile 이 아닌 것

- hero overlay
- installed asset allowlist
- hard policy floor
- workflow required 조합식

## 우선순위

1. workflow `required`
2. profile `preferred`
3. hero bias
4. species default

profile 은 required 가 없을 때만 기본 제안을 강화한다.
