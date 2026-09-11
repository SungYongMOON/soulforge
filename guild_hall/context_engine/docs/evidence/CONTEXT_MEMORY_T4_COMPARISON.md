# T4 — 회수와 실제 활용의 분리 비교

> 보존 기록: 이 문서는 후보 브랜치 `codex/context-memory-build`(로컬 보존 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 제작 당시 `ui-workspace/apps/dev-erp/docs/`에 쓴 증거다. 2026-09-12 main 통합에서는 dev-ERP 연결(shim·행보관 `--accepted-context`)을 CTX-S0-G2로 보류했다. 시험 본체는 `guild_hall/context_engine/tests`에 있고, dev-ERP CLI를 거치던 T3–T5 시험은 APP CLI(`src/app.mjs`)를 쓰도록 옮겼다. 본문의 경로·명령은 당시 기준이며, dev-ERP 시험 래퍼를 가리키던 링크만 APP 위치로 고쳤다.

상태: 합성 하니스 구현·6개 실제 소비 배치·작성자 검토까지 수행했다.
전체 W7은 미완료이며 채택 판단은 HOLD다. 독립 의미·코드 검토와 통합은 manager가 수행한다.

## 고정 범위

ASSUMPTIONS: 기존 T0의 24개 질문 의미와 T3의 실제 accepted Context Pack을
새 T4 평가 판본에서 연결한다. T0/T3 source·gold는 변경하지 않는다.
도메인 수치가 달라지는 질문은 T4 입력에 명시하고 source에 직접 결속한다.
기대답은 runtime 출력에서 만들지 않는다. source·gold·rubric·질문·입력 digest를
소비 전에 고정하고 일반 소비자에는 선택 기억과 요청만 제공한다.

A는 현재 요청만, B는 lexical 관련도, C는 유효 결정·제약·정정 중심,
D는 evaluator가 명시한 oracle 기억이다. oracle도 프로젝트·권한을 넘지 않는다.
그 뒤 lexical/BM25, vector, typed graph, hybrid+exact-source와
off/recent/ranked-decision/oracle의 행렬을 표시한다.
미구현은 NOT_RUN이며 같은 model-input digest는 재사용한다.

각 소비자는 새 컨텍스트에서 제공된 합성 입력만 읽고 도구·파일·네트워크 없이
JSON 답안을 반환한다. 요청 모델은 gpt-6-astra, 추론은 medium이다.
실제 모델·추론·tier·token·청구 비용은 관측되지 않으면 UNKNOWN이다.
하니스 내부 model_calls=0을 제작·소비 비용 0으로 해석하지 않는다.

## 평가 경계

회수 refs, 자기보고 used_refs, 문장의 의미 활용, 최종 결과를 분리한다.
Q23에서 올바른 ref를 보고해도 잘못된 실행을 허용하면 활용 실패다.
팩의 PARTIAL과 최종 답안 HOLD는 다른 상태다. 적절한 HOLD와 과도한 HOLD도 나눈다.
Q06 current-only reader의 과거 질의 HOLD를 역사 답변 성공으로 세지 않는다.

질문·응답별 12,000자, 근거 12개, 경로 6개, 추가 원문조회 2회가 상한이다.
선택 앞의 실제 accepted reader가 프로젝트·권한·판본을 검증한다.
준비용 합성 수락·파일 쓰기와 실제 조회 IO를 분리하고 다단계 조회 IO를 합산한다.
hard gate 실패는 비용 이점으로 상쇄하지 않으며 품질 우월성은 미리 결론내리지 않는다.

## 관측 결과

고정 자료는 `docs/architecture/workspace/examples/context-memory/`의
`t4-freeze.json`, `t4-sources.json`, `t4-evaluation.json`, `t4-input-digests.json`이다.
실제 조회 관측과 소비 입력은 `t4-run.json`, 받은 답안 원문은
`t4-consumer-responses.json`, 질문별 작성자 평가는 `t4-author-review.json`에 있다.
원문 답안은 해당 소비자의 반환 텍스트를 그대로 보존한다. 원 로그의 task ID와 host 경로는 포함하지 않는다.

- freeze: `sha256:0bb8678d9383c3a77bb50e6da92fc192284f0ac4aed0e115d21b48fc943bad70`
- source 묶음: `sha256:88f9a06f68e6c545a5b2c5607105b22369d4aae89df219b034b846781ef17c2a`
- gold: `sha256:a4ccb4f70796e496d904460363975b21f8ac964e84740590e2c391c5ee0dea02`
- 질문: `sha256:2c1a65953ec25ace4f8c24b691d32db8bebad6804b100f2e0564e18971b1ff61`

각 질문의 exact source byte hash/판본/locator, gold digest, 펼친 입력 digest는 위 JSON에 결속했다.
Q05만 명시된 충돌 없는 source 판본을 쓴다. 같은 Q05의 모든 조건은 그 판본으로 고정된다.
소비를 시작한 뒤 source·질문·gold·소비 입력은 변경하지 않았다.

| 대표 조건 | 기대 refs 일치 / 24 | 문장 의미 충족 / 23 | 엄격 결과 충족 / 24 | JSON |
| --- | ---: | ---: | ---: | --- |
| A 현재 요청만, batch-1 | 7 | 9 | 5 | PASS |
| B lexical, batch-2 | 19 | 18 | 14 | PASS |
| C 결정·제약·정정 우선, batch-3 | 15 | 15 | 0 | FAIL |
| D 명시 oracle, batch-4 | 24 | 21 | 16 | PASS |

이 수치는 작성자가 읽고 판정한 결과다. refs 일치에는 기대 refs가 빈 권한거부·부족 질문도 포함하며,
의미 분모 23은 역사 답변 미지원 Q06을 제외한다. 엄격 결과는 refs·동결 상태 envelope·의미·형식을 함께 요구한다.
따라서 refs 일치 24가 역사 답변 성공이나 전체 질문 완료를 뜻하지 않는다.

B는 업무·결과·선행관계 근거를 유지했지만 Q15 약속과 Q17 실패를 선택하지 않았다.
C는 약속·실패를 남기면서 업무 식별·결과·선행관계 fact를 밀어냈다.
C의 원래 JSON은 마지막 `]}`가 빠져 형식 실패다. 진단을 위해 닫는 기호를 붙인 별도 해석만 남겼고
원문과 FAIL은 보존했다. 자동 재호출은 하지 않았다.
Q23의 B/C/D 답안은 28 V·30 V 결정과 32 V 허가 부재를 실제 판단에 사용했다.
이 값들은 물리적 최대 전압 사양이 아니며 소비자도 그 한계를 구분했다.

Q20은 모든 조건에서 현재 요청의 60 C·교정 지시를 정확히 요약했고 원문 회수는 0이었다.
Q12는 모두 검색 실패가 역사적 부재의 증거가 아님을 설명했다. 모델의 `OK`는 질문에 답했다는 의미지만
동결 gold는 `HOLD`를 요구하므로 envelope 불일치를 그대로 남겼다. 이를 위험한 부재 단정으로 바꾸어 보고하지 않는다.
Q07/Q18/Q22도 실행 보류와 질문 응답 상태가 겹친다. 소비 후 점수를 올리기 위해 gold를 수정하지 않았다.
과도한 HOLD로 확인한 사례는 0이며, 단순 envelope 불일치는 과도한 HOLD 증거로 세지 않았다.

D의 Q02는 oracle include 목록에 30 V 쪽 본문이 없지만 rubric에는 그 충돌이 들어 있다.
따라서 D의 이 부족은 oracle 구성의 불충분으로 분류하며 모델 추론 실패나 검색기 추가 필요성으로 단정하지 않는다.
D Q09는 정확한 locator를 답했으나 used_refs에 source 사전 키 `S1`까지 넣어
엄격 fact-ID 비교는 FAIL, 문장의 locator 활용은 PASS로 분리했다.
Q21의 최종 요약은 selector 제외사유를 전달하지 않았고 일부 조건은 충돌 양쪽 또는 traceability도 놓쳤다.
모든 후보는 이 최종 제외사유 설명 기준을 충족하지 못했으며 비용으로 상쇄하지 않는다.

## 전체 행렬

`R1`~`R6`은 이미 실행한 고유 소비 배치 결과의 재사용이다. 기계적 조회는 실제 실행했다.
동일 입력 재사용을 별도 독립 모델 반복으로 세지 않는다. vector의 off/oracle은 검색 우회이며 벡터 실행이 아니다.

| 검색 표현 | off | recent | ranked-decision | oracle |
| --- | --- | --- | --- | --- |
| lexical/BM25 | RUN / R1 | RUN / R2 | RUN / R3(형식 FAIL) | RUN / R4 |
| vector | 우회 / R1 | NOT_RUN: backend 없음 | NOT_RUN: backend 없음 | 우회 / R4 |
| typed graph | RUN / R1 | RUN / batch-5 | RUN / batch-6 | RUN / R4 |
| hybrid+exact-source | RUN / R1 | RUN / R2 | RUN / R3(형식 FAIL) | RUN / R4 |

batch-5는 refs 15/24·의미 14/23·엄격 결과 12/24, batch-6은 15/24·15/23·11/24였다.
현재 recent의 시각은 합성 자료에서 동일하여 lexical과 같은 입력이 나온다.
typed graph는 수락 팩 안의 한 단계 관계 연결을 우선하는 순위 정책이고,
hybrid는 exact-source 검증 뒤 BM25와 typed 우선순위를 결합한 것이다. 벡터 혼합이나 독립 graph DB 검색이 아니다.
모든 회수 비교는 T3가 이미 제한한 두 원문/수락 팩의 후단 선택이다. 전체 원문 corpus 검색기 비교로 확대 해석하지 않는다.

## 질문별 받은 상태

O=OK, H=HOLD, N=NOT_AVAILABLE. 상태 자체가 의미 PASS는 아니다. C는 전체 응답 형식 FAIL이며
아래 상태는 진단용 해석이다. 원문·refs·실패 이유·실행 상태는 질문별 JSON에 있다.

| 질문 | A | B | C | D | graph recent | graph ranked |
| --- | --- | --- | --- | --- | --- | --- |
| Q01 | O | O | O | O | O | O |
| Q02 | N | H | O | H | H | H |
| Q03 | H | N | N | N | N | N |
| Q04 | H | H | H | H | H | H |
| Q05 | N | O | O | O | H | O |
| Q06 | H | H | H | H | H | H |
| Q07 | H | H | H | H | H | H |
| Q08 | N | H | H | H | H | H |
| Q09 | N | O | H | O | O | H |
| Q10 | N | H | H | H | H | N |
| Q11 | H | H | H | H | H | H |
| Q12 | O | O | O | O | O | O |
| Q13 | N | O | O | O | O | O |
| Q14 | N | O | H | O | O | H |
| Q15 | N | H | H | O | H | O |
| Q16 | H | H | H | H | H | H |
| Q17 | N | H | O | O | O | O |
| Q18 | H | H | H | H | H | H |
| Q19 | N | O | O | O | O | O |
| Q20 | O | O | O | O | O | O |
| Q21 | N | O | O | O | H | O |
| Q22 | N | H | H | H | H | H |
| Q23 | H | H | H | H | H | H |
| Q24 | N | O | O | O | O | O |

Q09의 정본 의도는 원문 위치 해소다. T4의 F-RESULT는 수락된 R-A 연결 주장을 exact revision/paragraph로
해소하며 B/D/graph-recent는 그 위치를 실제 답했다. T0의 숫자 측정 사례는 재현하지 않았고 측정값을 꾸미지 않았다.
Q21의 정본 의도는 결정적 절사·제외사유·필수 충돌 보존이다. 팩/selector의 제외 count·reason·부족 gap은
실행되었으나 최종 답변의 설명은 부족했다. T0의 10개 trace stress는 별도 미재현 세부 사례다.
Q13/Q14는 실제 기존 CLI → synthetic runtime → accepted reader → typed pack에서
`depends_on`/`same_result`까지 추가 확인했다. Q06 역사 답변은 계속 NOT_RUN이다.

## 비용과 재현 검사

한 측정 실행의 18조건×24질문=432회 기계적 질의에서 in-memory source provider 호출 507회,
reader 호출 674회, 질의 시간 합계 약 1,232 ms를 관측했다. 이는 432개의 합성 준비와 분리한 값이며
파일시스템 latency나 실제 서비스 처리량이 아니다. 준비는 메모리 내 수락 판본 864개 생성이고 운영 쓰기는 없다.
추가 CLI 확인은 OS 임시 synthetic 디렉터리에만 파일을 준비해 실제 source attempt 2회를 검사했다.

모델 소비는 총 6회, 원응답 항목은 144개이며 그중 C의 24개는 format FAIL의 진단 해석이다.
이를 accepted 144개로 세지 않는다. 펼친 질문 입력은 115종이다.
중복 질문 답안을 독립 반복으로 세지 않는다. 네 대표 조건과 16칸 행렬 중 입력이 같은 칸은 재호출하지 않았다.
실제 입력 최대 5,008자·답안 최대 827자, 질문별 원문 조회 최대 2회였다.
native dispatch→최종 전달 시간은 순서대로 209,239 / 194,226 / 274,951 / 69,473 / 204,924 / 71,516 ms다.
여기에는 orchestration이 포함된다. provider latency, cache 사용, 실제 token, tier, 청구비용, 사람 교정시간은 UNKNOWN이다.
구현 보조 agent 1개와 작성자 작업 비용도 UNKNOWN이며 실험 소비 6회 비용과 혼동하지 않는다.
native 요청에서 Astra/medium 인자는 확인했으나 실제 profile은 관측하지 못했다.
native message 본문 readback은 opaque여서 복호화하지 않았다. 고정 payload를 요청에 복사한 기록과 기대 digest를 남겼으며
전송 후 본문 digest를 별도로 검증했다고 주장하지 않는다.

공개 합성 배치의 shared dictionary는 질문별 참조 지시로 묶었다. 실제 답안에서 다른 질문의 근거를 빌린 사례는
확인하지 못했지만, 이 프롬프트 결속을 운영 접근제어로 사용해서는 안 된다.

실행 검증:

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t0.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t1.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t2.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t3.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t3_timing.test.mjs
node --test ui-workspace/apps/dev-erp/test/context_memory_t4.test.mjs
node --test --test-name-pattern="T4 relation sources" ui-workspace/apps/dev-erp/test/context_memory_t4.test.mjs
node --test ui-workspace/apps/dev-erp/test/context_memory_t4_report.test.mjs
node ui-workspace/apps/dev-erp/test/context_memory_t4_report.mjs
```

기반 회귀 73 PASS, T4 최초 묶음 6 PASS, 추가 actual CLI 1 PASS, 응답/평가 영수증 3 PASS(각 exit 0).
소비 뒤 동결 source/gold/input digest를 다시 결속한 최종 T4+영수증 묶음은 10 PASS / 0 FAIL / 0 SKIP, exit 0이다.
report CLI exit 0은 관측 정리 성공이며 후보 수락을 뜻하지 않는다.
`validate:path-policy`는 6 PASS / 1 Windows symlink SKIP, 위반 0, exit 0.
`validate:canon`은 yaml 미설치로 실패했다(이어 실행한 path-policy 때문에 묶음 shell exit는 0;
canon 개별 exit 수치는 별도 관측하지 않음). `ui:done:check`는 tsx 미설치로 exit 1이다.
의존성을 새로 설치하지 않았으며 두 광역 검사는 manager 통합 gate에 남긴다.
응답 추출 도중 opaque native message의 JSON 해석 실패와 C의 실제 JSON 결손을 구분했고,
opaque 본문을 해석하는 시도는 중단했다. C의 결손은 원문 보존 후 진단용 복구로만 처리했다.

## 후속 종단 검증 입력

T5는 고정된 T4 합성 source·질문·예산과 실제 accepted CLI의 exact binding을
재사용하고 승인된 설치 후보 및 실제 호출자 경로를 별도로 검증해야 한다.
최종 물리 구조는 Plan 17의 `Project context data store — Owner adoption 2026-09-10`과
23개 상대 디렉터리 계약을 따른다. v0.2 계획 SHA256은
`e65902600a9843f081336a31b69db0552635399914e0eaa453e8be7593a945e0`로 직접 확인했다.
`data_root/20_PROJECTS/<project-ref>`의 프로젝트 안내·입력자료·문서검색·프로젝트맥락·기억관리·
업무맥락·업무경험을 형성하고 본문/표 검색 판본, relocation, 중간 재생성 실패와 dependency 복구를
실제 요청 경로에 결속해야 한다. `<project-ref>`는 승인된 filesystem key/exact project ref binding이다.
이 실험은 그 위치를 생성하거나 실자료를 옮기거나 운영 writer를 켜지 않는다.

T5에 넘기는 exact 논리 입력은 위 freeze/source variants/24 question mapping/각 batch payload와
실제 consumer responses다. Q06 역사 재생, Q15 identity binding, Q02 oracle sufficiency,
상태 envelope 의미와 Q21 최종 제외사유 설명을 남은 항목으로 함께 넘긴다.
같은 결정을 기억관리의 두 번째 정본으로 복사하지 않으며 future target workmeta에는 lineage만 둔다.
current legacy의 승인된 metadata capture는 별도 guard를 통과한 기존 route만 사용한다.

공유 delta: CHANGELOG/README/AX CURRENT에는 T4의 downstream selector 비교·6회 실제 소비·
vector/역사 미실행·독립 검토 대기·새 Plan 17 기반 T5 입력 연결을 반영한다. 공유 파일은 이 작업자가 수정하지 않았다.
지식 트리거 확인: 소스 기반 검토 후보 — oracle 충분성, status envelope와 최종 omission 설명의 평가 개선 후보.
규칙 강화 체크: 반환 refs·의미·JSON·HOLD·기계적 IO·실제 모델 비용을 분리하고 미실행을 숨기지 않았다.

## 독립 검토 REVISE 후 보고 진입점 보강

기존 원답안이 조작되었다는 관찰은 없다. 독립 검토는 재사용 가능한 보고 함수에서 두 변조를 재현했다.
Q23 답안을 허가 문장으로 바꾸고 raw/SHA까지 재계산해도 수동 점수가 재사용되던 문제와,
C의 format 값만 PASS로 바꾸어 형식 실패를 숨길 수 있던 문제다.

수동 평가표를 검토한 exact experiment digest와 6개 원답안 digest에 보고 모듈 안에서 고정했다.
experiment pin은 해당 run의 source·gold·입력·선택까지 포함한다. 보고 생성 때 현재 파일에서 pin을
자동 갱신하지 않는다. 다른 입력/답안은 새로운 명시적 검토 없이 기존 점수를 재사용할 수 없다.
진입점은 원문 SHA, 실제 JSON.parse 결과, 해석된 response의 일치와 format 표기를 확인한다.
고정된 C 원문만 진단 복구를 허용하며 항상 format FAIL이다. 어떤 결속 검사가 실패해도 기존 보고 파일을
쓰기 전에 예외로 거부한다. 정상 원답안의 점수는 변경하지 않았다.

원 질문의 전체 coverage는 좁은 rubric 점수와 별도다.

| 질문 | 원 질문 기준의 범위 |
| --- | --- |
| Q02 | D는 타프로젝트 근거를 거부한다. 30 V 본문이 빠진 oracle 구성은 fixture/oracle 불충분이며 모델 추론 실패로 확정하지 않는다. |
| Q09 | attachment의 exact locator는 관찰했다. 원래 측정값·minute 6·paragraph 7 사례는 NOT_RUN이다. |
| Q12 | 6/6 안전한 부재 설명은 의미 PASS다. HOLD/OK 혼합은 fixture 상태 의미 문제이며 위험한 부재 단정이나 과도한 HOLD가 아니다. |
| Q15 | C/D/graph-ranked는 person A 약속을 쓰면서 actor-a exact binding 부재를 명시한다. 원 질문 전체 coverage는 HOLD이며 약속 시점과 fulfilled 약속 배제도 완전히 시험하지 않았다. |
| Q21 | 6/6 최종 답안에 selector 제외사유가 없어 전체 질문 PASS가 아니다. ten-observation stress NOT_RUN은 별도다. |

변조 회귀를 먼저 추가했을 때 3 PASS / 2 FAIL(exit 1)로 두 결함을 재현했다.
수정 뒤 report 검사 7 PASS(exit 0): 원문/SHA 동시 변경, format 위조, parsed/raw 불일치,
gold/input 변경 및 실패 시 기존 보고 보존을 확인했다. 새 소비 호출은 0회이며,
최종 T4/report 묶음은 14 PASS / 0 FAIL / 0 SKIP(exit 0)다.
기존 6회·14개 unique batch 한도·입력 재사용·observed model UNKNOWN·전체 W7 미완료·채택 HOLD는 유지한다.
공유 문서·Board·최종 독립 검토·capture는 manager가 담당한다. T5 새 구조 시험은 별도다.
