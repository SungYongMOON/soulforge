# Technical Action Brief Example

This is a public synthetic rendering example. It is not a sent-mail archive and
must not be treated as a source of technical facts, recipients, deadlines, or
send authority.

Use this layout when one technical request combines approved constants or
control conditions, an ordered implementation or test sequence, and explicit
result evidence to return.

```text
제목
[<확정된 프로젝트 키워드>] <메일 종류> - <기술 요청 요약>

본문
안녕하세요. <수신자 호칭>.
<회사/발신자 표기>

<이 메일의 목적 또는 재송부 사유를 한두 문장으로 먼저 표시합니다.>

1. 목적
- <유지해야 할 기존 동작>
- <이번 변경에서 맞출 범위>
- <이번 범위에서 제외되는 사항>
- <입력 이상 시 유지해야 할 동작>

2. 기술 요청
| 항목 | 요청 내용 |
| --- | --- |
| 기준 입력 | <승인된 입력 조건> |
| 측정 구간 | <승인된 측정 조건> |
| 정상 기준 | <승인된 정상값> |
| 계산 | <승인된 계산식 또는 판정 기준> |
| 제어 | <승인된 증감 방향과 확인 조건> |
| 이상 처리 | <입력 단절 또는 오류 시 동작> |

<표에 이미 적은 조건을 산문으로 반복하지 않습니다.>

3. 실행 또는 시험 순서
1) <초기 고정 조건 확인>
2) <주요 측정점 확인>
3) <변화 방향 또는 기능 확인>
4) <수동 검증>
5) <자동 동작 및 이상 조건 검증>

4. 회신 요청
- <revision 또는 식별자>
- <필수 측정값 또는 로그 필드>
- <전후 비교 결과>
- <남은 문제 또는 판단 요청>

기한: <확정된 기한 또는 협의 기준이 있을 때만 표시>
첨부: <선택된 첨부가 있을 때만 표시>
후속조치: <누가 다음 단계에서 무엇을 확인하는지 표시>

<서명 block>
<보안 문구 block>
```

## Rendering Guards

- Keep one technical-condition table. Split unrelated decisions into another
  mail or synchronous discussion instead of stacking tables.
- Use numbers only for actual execution order. Use bullets for parallel facts
  and requested evidence.
- Put approved values in the normalized context before rendering. Never invent
  constants, formulas, deadlines, recipients, or control direction from this
  example.
- Omit empty `기한`, `첨부`, and `후속조치` lines instead of writing
  `해당 없음`.
- Keep the exact footer, contact values, private paths, and project rows outside
  public workflow artifacts.
