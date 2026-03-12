# UI Selection Model

## 목적

- renderer v1 에서 허용되는 local selection state 범위를 고정한다.
- selection persistence 와 canonical mutation 이 renderer 범위가 아님을 분명히 한다.

## local state 범위

- `active_tab`
- `selected_item_key`
- `opened_catalog`
- `preview_candidate_key`
- `hovered_item_key`
- `info_dock_section`

## 허용 interaction

- 탭 전환
- row item 선택
- catalog 열기
- candidate preview
- diagnostics item focus

## 금지 interaction

- canonical YAML write-back
- selected candidate 저장
- body/class/workspace binding patch
- profile 변경 저장
- host-local remembered selection 파일 생성

## model 원칙

- local state 는 JSON contract 바깥에 둔다.
- local state 는 브라우저 메모리 안에서만 유지한다.
- 새 payload 를 읽으면 local state 는 보수적으로 reset 또는 rebase 한다.

## rebase 규칙

- active tab 이 여전히 유효하면 유지한다.
- selected item 이 새 payload 에 없으면 dock 를 summary 로 되돌린다.
- preview candidate 가 사라지면 preview 를 닫는다.

## info dock 우선순위

1. preview candidate
2. selected item
3. diagnostics focus
4. tab summary

## selection persistence 를 미루는 이유

- canonical source owner 와 renderer consumer 책임을 섞지 않기 위해서다.
- control-plane 이 생기기 전까지는 selection 저장 규칙을 고정하지 않는다.
