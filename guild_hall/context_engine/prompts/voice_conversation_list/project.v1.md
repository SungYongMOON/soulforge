이 구간이 **어느 과제의 이야기인지 후보**를 낸다. 확정이 아니라 후보다. 확정은 사람이 한다.

입력은 셋이다.

1. 구간 본문
2. **단서 분류표** — 각 낱말이 `shared`(여러 과제가 함께 쓰는 말) / `distinctive`(한 과제에서만 관측된 말) /
   `unregistered`(등록부가 모르는 말) 중 무엇인지, 그리고 `workflow`(작업 도구의 상태·알림 어휘)인지
3. **근거 행** — 위 단서로 각 과제의 기존 자료를 찾아 나온 줄. 각 줄에 `row_id`, 과제 코드, 항목 id, 인용이 붙는다

## 규칙

1. **후보는 근거 행이 있는 과제만** 낸다. 근거 행 없이 과제 코드를 쓰지 않는다.
   기억이나 짐작으로 과제를 떠올리지 않는다. 근거 행에 없는 과제 코드는 거부된다.
2. **`shared` 단서만으로 과제를 정하지 않는다.** 여러 과제가 같은 부품·같은 시험 이름을 쓴다.
   그 말이 나왔다는 것은 주제에 대한 정보이지 과제에 대한 정보가 아니다.
3. **`unregistered`는 "한 과제만 쓰는 말"이 아니다.** 아무도 확인하지 않은 말이다. 강한 근거가 될 수 없다.
4. 후보마다 `basis`로 **무엇이 이 과제를 가리키는지** 종류를 적는다. 여러 개 가능.
   - `equipment` 장비·기기
   - `board` 보드·부품·조립품
   - `purpose` 무엇을 하려고 한 이야기인지
   - `test_condition` 시험 조건·환경
   - `deliverable` 산출물·문서·납품물
   - `follow_up_record` 뒤에 남은 기록(메일·이슈·회신)과 이어짐
5. `strength`
   - `strong` — `distinctive` 단서가 맞았거나, `basis`가 두 종류 이상
   - `weak` — 그 밖의 경우
   확신이 서지 않으면 `weak`다.
6. 후보는 **최대 3개**. 근거가 없으면 후보를 0개로 내고 `unclassified_reason`에 한 문장으로 이유를 쓴다.
   **모르면 모른다고 쓰는 것이 맞는 답이다.**

## 출력

JSON만 낸다.

```
{"candidates": [
  {"project_code": "<근거 행에 있는 과제 코드>", "evidence_row_ids": [3,7],
   "basis": ["equipment","follow_up_record"], "strength": "weak"}
 ],
 "unclassified_reason": null}
```

후보가 없으면 `{"candidates": [], "unclassified_reason": "…"}`.

## 예 (합성 자료 — 실제 기록이 아니다)

단서 분류표: `케이블` shared · `시험수조` shared · `XG-보정판` unregistered
근거 행: row 1 (과제 AA-111, "케이블 포설 일정"), row 2 (과제 BB-222, "케이블 규격 회신")

```
{"candidates": [], "unclassified_reason": "맞은 근거가 여러 과제가 함께 쓰는 낱말뿐이라 과제를 좁히지 못한다"}
```
