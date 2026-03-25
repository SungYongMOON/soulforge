# MONSTER_FAMILY_LINEUP_V0

## 목적

- 이 문서는 current-default v0 에서 mail/request intake 가 참조할 상위 `monster_family` 20개 라인업을 잠근다.
- `monster_family` 는 세계관 overlay 용 큰 분류이고, 실제 업무 의미는 `work_pattern` 과 `objective` 가 따로 소유한다.

## 한 줄 정의

- `monster_family` 는 큰 계열이다.
- `monster_name` 은 계열 안의 세부 이름이다.
- `work_pattern` 은 실제 처리 방식이다.
- `objective` 는 이번 인스턴스에서 해야 하는 실제 일이다.

## naming 원칙

- 세부 이름은 `green_dragon`, `ash_goblin`, `clear_slime` 처럼 `descriptor_family` 형태를 권장한다.
- `monster_family` 와 `monster_name` id 는 stable ASCII snake_case 를 유지한다.
- 사람에게 보여주는 이름이 필요하면 report/candidate note 에 한국어 `monster_label` 을 별도로 둘 수 있다.
- `monster_family` 나 `monster_name` 만으로 실제 업무를 설명하지 않는다.
- 실제 업무 설명은 반드시 별도 `objective` 에 적는다.

## locked family lineup

1. `slime`
   - 반복적이고 작은 update/maintenance 성격의 일
2. `imp`
   - 짧은 회신, 확인, 일정 응답처럼 빠른 반응이 필요한 일
3. `goblin`
   - 문서, 표, BOM, 식별자 같은 산출물 작성형 일
4. `kobold`
   - 자료 수집, 발굴, 정리, 조합 성격의 일
5. `mimic`
   - 송부, 제출, 패키징, 전달 성격의 일
6. `basilisk`
   - 검토, 적절성 판단, 규격 확인 성격의 일
7. `harpy`
   - 외부 업체/협력사와 왕복하며 견적 또는 가능 여부를 받는 일
8. `orc`
   - 손이 많이 가고 반복 자동화가 아직 어려운 실무 처리
9. `golem`
   - 형식이 고정되고 반복 가능한 execution 성격의 일
10. `troll`
   - 누락, 지연, 후속조치, 끈질긴 추적이 필요한 일
11. `wyvern`
   - 기한 압박이 강하고 urgency 가 높은 일
12. `hydra`
   - 하나의 source 에서 여러 몬스터가 갈라지는 다발성 일
13. `chimera`
   - 성격이 다른 요청이 한 덩어리로 섞인 복합형 일
14. `sphinx`
   - 질문은 왔지만 요구가 모호해서 해석이 먼저 필요한 일
15. `beholder`
   - 이해관계자와 참조자가 많아 조율 난도가 높은 일
16. `lich`
   - 오래된 자료, 레거시 문서, 과거 산출물 재활용 성격의 일
17. `wraith`
   - 흔적은 있으나 실체나 owner 가 불분명한 일
18. `phoenix`
   - 수정, 재작성, 재시도처럼 되살리기 성격의 일
19. `dragon`
   - 영향도와 실패 비용이 큰 상위급 일
20. `unknown_monster`
   - 아직 family 를 확정하지 못했지만 몬스터로는 식별된 fallback 분류

## v0 적용 규칙

- intake 단계에서는 먼저 `monster_family` 만 붙여도 된다.
- `monster_name` 과 `work_pattern` 은 실전 처리 중 안정화되면 뒤에서 붙여도 된다.
- family 를 모르면 비워두지 말고 `unknown_monster` 를 사용한다.

## sample

```yaml
monster_family: dragon
monster_name: green_dragon
monster_label: 상위급 자료 갱신 몬스터
work_pattern: material_refresh
objective: 점검장비 자료를 최신 기준으로 갱신한다.
```

## 연결 문서

- [`MONSTER_CANDIDATE_CONTRACT_V0.md`](../../../docs/architecture/workspace/MONSTER_CANDIDATE_CONTRACT_V0.md)
- [`AUTOHUNT_MODEL.md`](../../../docs/architecture/workspace/AUTOHUNT_MODEL.md)

## ASSUMPTIONS

- 이 문서는 family line-up 만 잠그며, family 별 detailed naming tree 와 `work_pattern` taxonomy 는 뒤 phase 에서 자란다고 본다.
