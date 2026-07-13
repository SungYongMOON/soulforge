# PLAUD Adoption Decision v0

## 결정

PLAUD는 사용할 의미가 있다. 다만 Soulforge에서의 역할은 **회의록을 확정하는
AI 서비스**가 아니라 **휴대 가능한 원본 음성 수집기**다.

현재 상태는 `본인 1명, 5~10회 회의 파일럿 채택`이다. 파일럿이 끝날 때까지
Apple Notes 같은 독립 녹음을 함께 유지하고, 단독 정본 수집기로의 전환은
누락·전송·배터리·원거리 화자 품질을 확인한 뒤 결정한다.

## 채택 이유

- 휴대성이 좋아 일상 대화와 회의에서 수집 시작 장벽이 낮다.
- 내부 동일 회의 비교에서 PLAUD 원본은 주 음성 source 후보로 사용할 수 있는
  수준이었고, 맥북 녹음보다 음량 일관성과 clipping 측면에서 유리했다.
- 원본 오디오를 내려받을 수 있어 provider 결과가 틀려도 독립 전사, 화자분리,
  사실 확인을 다시 수행할 수 있다.
- 전사 완료 메일을 신호로 사용하면 24시간 맥미니가 공식 CLI 수집을 시작할 수
  있다.

구체적인 측정값과 비교 근거는 companion private repo의
`_workmeta/system/reports/voice_quality/20260710_mac_notes_vs_plaud_review.yaml`
에 두며 public 문서에는 원본 음성이나 전사 내용을 복사하지 않는다.

## 역할 구분

| PLAUD 산출물 | Soulforge 역할 | 직접 장부 승격 |
| --- | --- | --- |
| 원본 오디오 | 정본 후보, 재전사·사실 확인 기준 | 불가 |
| provider 전사 | 시간 구간과 화자 구간을 찾는 미검증 보조본 | 불가 |
| provider 화자 라벨 | 서로 다른 목소리 구간을 찾는 힌트, 실명 아님 | 불가 |
| provider 요약 | 오류 가능성이 있는 격리 참고본 | 불가 |

프로젝트 판단, 회의록 작성, 결정·일정·할일 추출은 Soulforge의 독립 검토
단계가 담당한다. 프로젝트가 불명확한 자료는 `P00-000_INBOX`에 남기고,
누락 방지를 위해 과제명이 틀리더라도 미분류 기록 자체는 보존한다.

## 2026-07-13 owner 승인 운영 방향

PLAUD를 단독 정본 수집기로 전환하는 결정과 맥미니를 음성 처리의
`operational-primary`로 지정하는 결정은 분리한다.

- PLAUD 장치는 위 파일럿 종료 기준을 통과하기 전까지 단독 정본 수집기로
  확정하지 않는다.
- 24시간 맥미니는 지금부터 음성 수집 trigger, 원음 회수, 독립 전사, 보관함
  등록, 후속 분석 queue를 책임지는 단일 writer다.
- 목표 처리선은 `원음 수집 -> 독립 전사/품질 확인 -> 녹음 종류 분류 ->
  회의·주제 구간 분리 -> 화자 후보 -> 프로젝트 구간 route -> 담당자·할일·
  기한·결정 추출 -> AI 임시 확정 기록 -> 재검증 -> 요약/예외 알림`이다.
- AI 임시 확정은 사람의 매 건 승인을 기다리지 않고 내부 후속 처리를 계속하기
  위한 상태다. 사람의 승인, 공식 사실, 완료 사실을 뜻하지 않으며
  `accepted_by: owner` 같은 값을 AI가 대신 기록해서는 안 된다.
- 프로젝트를 하나로 확정하기 어려운 장시간 녹음은 전체 파일을 억지로 한
  프로젝트에 넣지 않고 구간별로 여러 프로젝트에 임시 route할 수 있다.
- 외부 메일 발송, 외부 공유, 구매, 공식 승인, 기술 기준값 확정처럼 되돌리기
  어려운 행위는 별도 승인 경계를 유지한다. 모순, 근거 부족, 새 프로젝트,
  낮은 화자 신뢰도만 예외 검토함으로 보낸다.

이 방향은 승인된 개발 목표이며 현재 코드가 전 구간을 구현했다는 뜻은 아니다.
현 구현은 원음 수집·독립 전사·보관함 등록·안전한 완료 알림까지 동작하고,
자동 구간 분리, 화자 실명 후보, 프로젝트/담당자 임시 확정, 업무 장부 연결은
후속 구현 대상이다.

## 저장과 PC 간 전달

| 구분 | 저장 위치 | 다른 PC 전달 방식 |
| --- | --- | --- |
| 원음·전사·화자 분석 | `_workspaces/system/voice_capture/sessions/**` | owner-approved shared worksite, Git 금지 |
| 녹음 보관함·회의 묶음·전달 확인 | `_workspaces/system/voice_capture/{library,meeting_bundles,delivery}/**` | 같은 shared worksite + receipt/ack |
| 프로젝트별 route·업무 metadata | `_workmeta/<project_code>/**` | project private Git |
| 공통 운영 이력 | `private-state/guild_hall/state/**` | private-state Git |
| 코드·규칙·테스트 | Soulforge public tracked tree | public Git |

맥미니 외 PC는 원음 처리 surface를 동시에 쓰지 않는다. 다른 PC는 public/private
Git을 pull하고 shared worksite의 payload를 확인한 뒤 자기 node 이름의 consumer
ack와 허용된 프로젝트 metadata만 기록한다.

## 파일럿 종료 기준

5~10회 회의 동안 다음을 확인한다.

1. 녹음 누락과 계정 전송 누락이 없는가.
2. 하루 사용에 배터리가 충분한가.
3. 멀리 있는 참석자와 겹쳐 말하는 구간도 원본에서 확인 가능한가.
4. 원본 오디오, provider 전사, 요약을 반복해서 내려받을 수 있는가.
5. 하이웍스 메일에서 맥미니 수집까지 끊김 없이 이어지는가.
6. `unresolved` 검토함에 남은 메일이 누락 없이 확인되는가.

원본 누락이나 회수 불가능한 전송 실패가 반복되면 PLAUD를 단독 주 수집기로
사용하지 않는다. 반대로 원본 회수와 장시간 운용이 안정적이면 PLAUD를 주
수집기로 전환하고 맥북 녹음은 중요한 회의의 보조 수단으로 남긴다.

## 사용 중단선

- 보안시설과 고객사 규정이 녹음기 반입 또는 녹음을 허용하지 않으면 사용하지
  않는다.
- PLAUD 전사, 화자명, 요약만 있고 원본 오디오가 없으면 공식 회의록이나
  할일을 확정하지 않는다.
- 프로젝트 매칭 근거가 부족하면 임의 프로젝트로 보내지 않고 P00에서
  검토한다.
- provider 로그인 token, 공유 capability URL, 24시간 download URL은 Git이나
  `_workmeta`에 저장하지 않는다.

## 맥미니 이어받기

```bash
git pull
git -C _workmeta pull
```

운영 설치와 실행 명령은
[`guild_hall/voice_capture/README.md`](../../../guild_hall/voice_capture/README.md)의
`PLAUD account intake on an always-on Mac` 절을 따른다.

## 한 줄 원칙

> PLAUD는 잘 녹음하고 전달하는 장치로 사용하고, 이해·분류·회의록·할일 확정은 Soulforge가 담당한다.
