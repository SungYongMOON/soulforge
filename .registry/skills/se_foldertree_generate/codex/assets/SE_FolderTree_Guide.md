---
title: 'SE 기반 폴더 트리 생성 지침 (000_REF/020_MGMT/단계별 게이트)'
version: '0.6'
owner_team: 개발1팀
principles:
- 폴더 순서 = 업무 순서
- 존재하는 폴더만 수행(없으면 N/A)
- 초안/진행본은 Work, 최종/승인본은 Out. Review/Action/Quality에는 근거/코멘트/조치/품질증빙을 둔다.
- 완료판정은 Out 기준
- '폴더명 규칙: 한글명(영문약어)_상태 예) 체계요구사항명세서(SSRS)_D'
root_naming:
  format: '{START_YYYYMMDD}_{PROJECT_NAME}'
  note: 단계별 날짜를 폴더명에 넣지 말 것(일정 변경에 강하게)
special_folders:
  reference:
    code: 0
    name: REF
    desc: 프로젝트 기준 및 참고자료
  management:
    code: 20
    name: MGMT
    desc: 프로젝트 통합 관리 및 원본 수집
  unclassified:
    code: 270
    name: 분류필요업무
    desc: 단계 미판정 또는 후속 분류 대기 자료
gates:
- code: 30
  name: SRR
  desc: 체계요구조건검토 (System Requirements Review)
  lig_qgate:
  - Q1
  - Q2
  tasks:
  - id: 31
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 32
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 33
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 34
    name: 계약자료검토결과(Q1)
    desc: 고객 요구사양서 검토 및 리스크 식별
    term: Q1_계약자료검토
    source: LIG 개발품질 1
    template: 첨부1 (Q1 활동) 2
  - id: 35
    name: 협력개발실행계획서(Q2)
    desc: 계약 후 30일 이내 제출하는 승인된 계획서
    term: Q2_실행계획서
    source: LIG 개발품질 3
    template: Q2 승인 양식
  - id: 36
    name: 체계공학관리계획서(SEMP)
    desc: (Final) 기술적 관리 및 SE 프로세스 계획
    term: SEMP
    source: 방사청 가이드북 4
    template: p.129 (부록 F) 4
  - id: 37
    name: 품질보증계획서(QAP)
    desc: 개발 단계별 검사 계획 및 부적합 처리 절차
    term: QAP
    source: 방사청 가이드북 5
    template: p.30 (진입기준) 5
  - id: 38
    name: 착수회의록(Kick-off)
    desc: 사업 착수 회의 결과 기록
    term: Kick-off
    source: LIG 개발품질 6
    template: 착수회의록 양식
  - id: 39
    name: 운용개념(CONOPS)
    desc: 운용 시나리오 및 사용자 요구사항 분석
    term: CONOPS
    source: 방사청 가이드북 7
    template: p.119 (함정사례) 8
  - id: 40
    name: 체계요구사항명세서(SSRS)_D
    desc: (Draft) 기술적 요구사항 변환 초안
    term: SSRS
    source: 방사청 가이드북 9
    template: p.131 (서식) 10
  - id: 41
    name: 가정및제약사항
    desc: 설계 제약 조건 및 가정 사항 정리
    term: 가정및제약
    source: 방사청 가이드북
    template: 분석요소 참조
  - id: 42
    name: 초기위험관리자료
    desc: 식별된 위험 요소 평가 및 관리 계획
    term: 위험관리
    source: 방사청 가이드북 5
    template: p.30 (진입기준) 5
  - id: 43
    name: SRR_회의록및조치결과
    desc: SRR 회의록 및 조치결과
    term: SRR_회의록
    source: 방사청 가이드북 11
    template: p.38 (종료기준) 11
  - id: 44
    name: 계약자료제출목록(CDRL)
    desc: 제출 산출물 목록 및 일정 정의
    term: CDRL
    source: 계약서 12
    template: 계약 요구사항 12
  - id: 45
    name: SW개발계획서(SDP)
    desc: (Final) SW 개발 프로세스 및 조직 정의
    term: SDP
    source: 방사청 가이드북 13
    template: p.39 (산출물) 13
  - id: 46
    name: 시험평가기본계획서(TEMP)_D
    desc: (Draft) 시험평가 마스터 플랜 초안
    term: TEMP
    source: 방사청 가이드북 14
    template: p.35 (기술계획) 14
  - id: 47
    name: 기능형상식별서(FCI)_D
    desc: (Draft) 체계 기능 식별서 초안
    term: FCI
    source: 방사청 가이드북 5
    template: p.30 (진입기준) 5
  - id: 48
    name: 연동통제문서(ICD)_D
    desc: (Draft) 인터페이스 식별 초기 문서
    term: ICD
    source: 방사청 가이드북 13
    template: 산출물 목록 참조 13
- code: 60
  name: SFR
  desc: 체계기능검토 (System Functional Review)
  tasks:
  - id: 61
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 62
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 63
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 64
    name: 체계요구사항명세서(SSRS)_F
    desc: (Final) 기능 기준선 확정본
    term: SSRS
    source: 방사청 가이드북 15
    template: p.22 (기준선 정의) 15
  - id: 65
    name: 기능분석및할당자료
    desc: FFBD 및 요구사항 할당 분석
    term: 기능분석
    source: 방사청 가이드북 16
    template: p.40 (개요) 16
  - id: 66
    name: 요구사항추적표(RTM)
    desc: 요구사항-기능 매핑 추적 매트릭스
    term: RTM
    source: 방사청 가이드북 17
    template: p.112 (추적성) 17
  - id: 67
    name: 연동통제문서(ICD)_Prelim
    desc: (Preliminary) 인터페이스 구체화 중간본
    term: ICD
    source: 방사청 가이드북 18
    template: p.50 (산출물) 18
  - id: 68
    name: 검증확인전략(V&V)
    desc: 요구사항 검증 및 확인 전략
    term: V&V 전략
    source: 시험평가 19
    template: 기본전략 참조 19
  - id: 69
    name: 대안분석(Trade-Study)
    desc: 설계 대안 분석 및 절충(Trade-Off) 연구 자료
    term: Trade-Study
    source: 방사청 가이드북 8
    template: p.119 (분석절차) 20
  - id: 70
    name: SFR_회의록및조치결과
    desc: SFR 회의 결과 및 기능 기준선 승인
    term: SFR_회의록
    source: LIG 개발품질 21
    template: G1 Gate 양식 21
  - id: 71
    name: 기능형상식별서(FCI)_F
    desc: (Final) 기능 기준선 설정 문서
    term: FCI
    source: 방사청 가이드북 18
    template: p.50 (산출물) 18
  - id: 72
    name: HW요구사항명세서(HRS)_D
    desc: (Draft) HW 상세 요구사항 초안
    term: HRS
    source: 방사청 가이드북 22
    template: p.132 (서식) 22
  - id: 73
    name: SW요구사항명세서(SRS)_D
    desc: (Draft) SW 상세 요구사항 초안
    term: SRS
    source: 방사청 가이드북 18
    template: 산출물 목록 참조
  - id: 74
    name: 체계설계기술서(SSDD)_D
    desc: (Draft) 체계 및 부체계 설계 초안
    term: SSDD
    source: 방사청 가이드북 18
    template: p.50 (산출물) 18
- code: 90
  name: PDR
  desc: 기본설계검토 (Preliminary Design Review)
  lig_qgate:
  - Q3
  tasks:
  - id: 91
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 92
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 93
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 94
    name: 설계품질점검결과(Q3)
    desc: 상세설계 진입 전 성숙도 점검
    term: Q3_설계점검
    source: LIG 개발품질 3
    template: Q3 활동 양식 3
  - id: 95
    name: 체계아키텍처및형상식별서(안)
    desc: 아키텍처 정의 및 구성품 식별
    term: 아키텍처
    source: 방사청 가이드북 23
    template: 산출물 목록 참조
  - id: 96
    name: 체계설계기술서(SSDD)_F
    desc: (Final) 아키텍처/설계 확정 (할당 기준선)
    term: SSDD
    source: 방사청 가이드북 24
    template: p.133 (서식) 25
  - id: 97
    name: HW요구사항명세서(HRS)_D
    desc: (Draft) HW 상세 요구사항 초안
    term: HRS
    source: 방사청 가이드북 26
    template: p.53 (진입기준) 26
  - id: 98
    name: SW요구사항명세서(SRS)_D
    desc: (Draft) SW 상세 요구사항 초안
    term: SRS
    source: 방사청 가이드북 26
    template: p.53 (진입기준) 26
  - id: 99
    name: 인터페이스설계기술서(IDD)_D
    desc: (Draft) 인터페이스 상세 설계 초안
    term: IDD
    source: 방사청 가이드북 24
    template: p.64 (산출물) 24
  - id: 100
    name: 연동통제문서(ICD)_Prelim
    desc: (Preliminary) PDR 단계 업데이트본
    term: ICD
    source: 방사청 가이드북 24
    template: 산출물 목록 참조
  - id: 101
    name: 요구사항추적표(RTM)_최신화
    desc: 할당 기준선 설정에 따른 업데이트
    term: RTM
    source: 방사청 가이드북 17
    template: 추적표 양식
  - id: 102
    name: 시험평가기본계획서(TEMP)_D
    desc: (Draft) P-TEMP 구체화 버전
    term: TEMP
    source: 방사청 가이드북 27
    template: 산출물 목록 참조
  - id: 103
    name: PDR_회의록및조치결과
    desc: PDR 회의 결과 및 할당 기준선 승인
    term: PDR_회의록
    source: LIG 개발품질 21
    template: G2 Gate 양식 21
  - id: 104
    name: HW설계기술서(HDD)_D
    desc: (Draft) HW 상세설계 초안
    term: HDD
    source: 방사청 가이드북 24
    template: p.64 (산출물) 24
  - id: 105
    name: SW설계기술서(SDD)_D
    desc: (Draft) SW 상세설계 초안
    term: SDD
    source: 방사청 가이드북 24
    template: 산출물 목록 참조
  - id: 106
    name: DB설계기술서(DBDD)_D
    desc: (Draft) DB 상세설계 초안
    term: DBDD
    source: 방사청 가이드북 24
    template: 산출물 목록 참조
  - id: 107
    name: 상세설계도면_D
    desc: (Draft) 제작용 도면 초안
    term: 설계도면
    source: 방사청 가이드북
    template: 산출물 목록 참조
  - id: 108
    name: 자재명세서(Q-BOM)_D
    desc: (Draft) 자재 내역서 초안
    term: Q-BOM
    source: LIG 개발품질 28
    template: 산출물 목록 참조
- code: 120
  name: CDR
  desc: 상세설계검토 (Critical Design Review)
  lig_qgate:
  - Q4
  tasks:
  - id: 121
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 122
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 123
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 124
    name: 제작준비검토결과(MRR_Q4)
    desc: 도면/자재/공정 준비 및 제작 승인
    term: Q4 (MRR)
    source: LIG 개발품질 28
    template: Q4 MRR 양식 28
  - id: 125
    name: HW설계기술서(HDD)_F
    desc: (Final) HW 상세설계 확정 (제품 기준선)
    term: HDD
    source: 방사청 가이드북 29
    template: p.134 (서식) 30
  - id: 126
    name: SW설계기술서(SDD)_F
    desc: (Final) SW 상세설계 확정 (제품 기준선)
    term: SDD
    source: 방사청 가이드북 29
    template: p.67 (진입기준) 29
  - id: 127
    name: DB설계기술서(DBDD)_F
    desc: (Final) DB 설계 확정본
    term: DBDD
    source: 방사청 가이드북 31
    template: 산출물 목록 참조
  - id: 128
    name: 인터페이스설계기술서(IDD)_F
    desc: (Final) 인터페이스 설계 확정본
    term: IDD
    source: 방사청 가이드북 31
    template: p.78 (산출물) 31
  - id: 129
    name: 연동통제문서(ICD)_F
    desc: (Final) ICD 최종 확정
    term: ICD
    source: 방사청 가이드북 31
    template: 산출물 목록 참조
  - id: 130
    name: 상세설계도면_F
    desc: (Final) 승인된 제작용 도면
    term: 설계도면
    source: 방사청 가이드북 29
    template: p.67 (진입기준) 29
  - id: 131
    name: 자재명세서(Q-BOM)_F
    desc: (Final) Q4 승인 자재 목록
    term: Q-BOM
    source: LIG 개발품질 28
    template: Q4 점검항목
  - id: 132
    name: Artwork설계검토서_F
    desc: PCB 제작을 위한 Artwork 승인
    term: Artwork
    source: LIG 개발품질 28
    template: Q4 진입조건 28
  - id: 133
    name: 표준품적절성검토서
    desc: 부품 단종/수급 이슈 검토
    term: 표준품검토
    source: LIG 개발품질 28
    template: 검토서 양식
  - id: 134
    name: 제작사양서(WPS)및검사요구
    desc: 제조 공정 및 검사 요구 기준서
    term: WPS
    source: LIG 개발품질 32
    template: 첨부2 (발주문서) 32
  - id: 135
    name: 제조관점설계검토결과
    desc: 양산 이관성 및 제조 용이성 검토
    term: M-DR
    source: LIG 개발품질 33
    template: 검토보고서 양식
  - id: 136
    name: 제조공정도및작업표준(Flow)
    desc: 제조 흐름 및 공정별 작업 표준
    term: 제조공정도
    source: LIG 개발품질 28
    template: Q4 점검항목
  - id: 137
    name: 요구사항추적표(RTM)_업데이트
    desc: 상세설계 결과 요구사항 충족 확인
    term: RTM
    source: 방사청 가이드북 34
    template: 추적표 양식
  - id: 138
    name: 안전성및신뢰성분석_F
    desc: RAM 및 안전성 분석 확정본
    term: RAM/Safety
    source: 방사청 가이드북 34
    template: p.75 (점검항목) 34
  - id: 139
    name: CDR_회의록및조치결과
    desc: CDR 회의 결과 및 승인 기록
    term: CDR_회의록
    source: LIG 개발품질 21
    template: G3 Gate 양식 21
  - id: 140
    name: HW요구사항명세서(HRS)_F
    desc: (Final) HW 요구사항 최종본
    term: HRS
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
  - id: 141
    name: SW요구사항명세서(SRS)_F
    desc: (Final) SW 요구사항 최종본
    term: SRS
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
  - id: 142
    name: 통합시험계획서절차서(STP)_D
    desc: (Draft) 통합시험 계획 및 절차 초안
    term: STP
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
  - id: 143
    name: 제품형상식별서(PCI)_D
    desc: (Draft) 제품 기준선 식별서 초안
    term: PCI
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
- code: 150
  name: TRR_DT
  desc: 시험준비/시제제작/개발시험 (Q5-Q6-Q7)
  lig_qgate:
  - Q5
  - Q6
  - Q7
  tasks:
  - id: 151
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 152
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 153
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 154
    name: 협력사발주문서
    desc: 발주유형별 발주문서 (PO 등)
    term: 발주서
    source: LIG 구매절차 36
    template: 구매 양식 36
  - id: 155
    name: 원자재성적서및COC
    desc: 원소재 MillSheet 및 추적 정보
    term: MillSheet
    source: LIG 개발품질 32
    template: 첨부3 (가이드) 32
  - id: 156
    name: 부품COC(제조사또는대리점)
    desc: 정품 인증서 (COC)
    term: 부품 COC
    source: LIG 개발품질 32
    template: 첨부4 (위조품) 37
  - id: 157
    name: 위조품검사성적서(Offer_COC)
    desc: 비공식 구매품 검사 성적서
    term: 위조품검사
    source: LIG 개발품질 37
    template: 성적서 양식 37
  - id: 158
    name: 일솜씨검사결과(Q5)
    desc: 조립 공정 품질(Workmanship) 검사
    term: Q5_일솜씨
    source: LIG 개발품질 38
    template: Q5 검사 양식
  - id: 159
    name: 시제제작기록(공정확인표)
    desc: 공정 확인표(Traveler) 및 기록
    term: Traveler
    source: LIG 개발품질 28
    template: Traveler 양식
  - id: 160
    name: SW산출물명세서(SPS_VDD)
    desc: SW 바이너리, 소스코드 및 버전 정의
    term: SPS/VDD
    source: 방사청 가이드북 39
    template: p.89 (산출물) 39
  - id: 161
    name: SW시험계획절차서(STP_STD)
    desc: SW 단위/통합 시험 계획 및 절차
    term: STP/STD
    source: 방사청 가이드북 39
    template: 산출물 목록 참조
  - id: 162
    name: SW시험결과서(STR)
    desc: SW 통합시험 수행 결과
    term: STR
    source: 방사청 가이드북 39
    template: 산출물 목록 참조
  - id: 163
    name: SW신뢰성시험결과(Q6)
    desc: SW 정적/동적 시험 성적서
    term: Q6_신뢰성
    source: LIG 개발품질 40
    template: Q6 검사 양식 40
  - id: 164
    name: 수락시험절차서(ATP)_F
    desc: 승인된 수락검사 기준 절차서
    term: ATP
    source: LIG 개발품질 40
    template: 검사절차서 양식
  - id: 165
    name: 시험평가기본계획서(TEMP)_F
    desc: (Final) 시험평가 착수 승인 본
    term: TEMP
    source: 방사청 가이드북 39
    template: p.89 (산출물) 39
  - id: 166
    name: 통합시험계획서절차서(STP)_F
    desc: (Final) 통합시험 절차서 확정
    term: STP
    source: 방사청 가이드북 39
    template: p.89 (산출물) 39
  - id: 167
    name: 수락검사성적서(FAT_Q7)_F
    desc: 최종 수락검사 합격 성적서
    term: Q7 (FAT)
    source: LIG 개발품질 45
    template: Q7 검사 양식 40
  - id: 168
    name: TRR_회의록및시험준비검토
    desc: 시험평가 착수 승인 기록
    term: TRR_회의록
    source: 방사청 가이드북 41
    template: p.79 (수행시기) 41
  - id: 169
    name: 개발시험평가결과(DT)
    desc: DT 로그, 데이터, 성적서 종합본
    term: DT 결과
    source: 방사청 가이드북 42
    template: 산출물 목록 참조
- code: 180
  name: FCA_OT
  desc: 기능형상확인/통합/운용시험 (Q8)
  lig_qgate:
  - Q8
  tasks:
  - id: 181
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 182
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 183
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 184
    name: 입고검사결과(Q8)
    desc: LIG 입고 후 외관/수량 검사
    term: Q8_입고검사
    source: LIG 개발품질 43
    template: Q8 검사 양식 43
  - id: 185
    name: 납품원장및인수증
    desc: 물품 인도 및 인수 증빙
    term: 인수증
    source: 계약관리 36
    template: 인수증 양식
  - id: 186
    name: 현장수락시험결과(SAT)
    desc: 현장 수락시험 결과
    term: SAT
    source: LIG 개발품질 44
    template: SAT 보고서 양식
  - id: 187
    name: 설치및시운전기록(STW)
    desc: 설치, 셋팅, 시운전 기록
    term: STW
    source: 현장지원
    template: STW 기록지
  - id: 188
    name: 체계통합지원결과
    desc: 통합시험 지원 데이터 및 내역
    term: 통합지원
    source: 사업관리
    template: 지원 결과서
  - id: 189
    name: 기능형상확인결과보고서(FCA)
    desc: 체계요구사항 충족 여부 감사 결과
    term: FCA
    source: 방사청 가이드북 45
    template: p.90 (개요) 45
  - id: 190
    name: 요구사항검증매트릭스(VCRM)_F
    desc: (Final) 요구사항 검증 입증
    term: VCRM
    source: 방사청 가이드북 17
    template: p.112 (추적성) 17
  - id: 191
    name: 운용시험평가지원자료(OT)
    desc: OT 수행 지원 및 기록
    term: OT 지원
    source: 방사청 가이드북 46
    template: 지원 자료 양식
  - id: 192
    name: FCA_OT_회의록및조치결과
    desc: FCA 및 OT 회의록
    term: FCA 회의록
    source: 방사청 가이드북 47
    template: p.96 (산출물) 47
  - id: 193
    name: 개발시험결과보고서(DT)_종합본
    desc: DT 성적서 종합본 (FCA 근거)
    term: DT 종합
    source: 방사청 가이드북 47
    template: 보고서 양식
  - id: 194
    name: 결함조치결과보고서(Defect)
    desc: 시험 중 결함 및 조치 결과
    term: 결함보고서
    source: LIG 개발품질 48
    template: 결함보고서 양식 48
  - id: 195
    name: 제품형상식별서(PCI)_Prelim
    desc: (Preliminary) 제품 형상 식별서 중간본
    term: PCI
    source: 방사청 가이드북 47
    template: p.96 (산출물) 47
- code: 210
  name: PCA
  desc: 물리적 형상확인 및 규격화 (Product Baseline 확정)
  tasks:
  - id: 211
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 212
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 213
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 214
    name: 물리형상확인결과보고서(PCA)
    desc: 제품 실물-도면 일치성 검증 결과
    term: PCA
    source: 방사청 가이드북 49
    template: p.97 (개요) 49
  - id: 215
    name: 최종도면(As-Built)_F
    desc: 실물 일치 최종 도면
    term: 최종도면
    source: 방사청 가이드북 50
    template: p.98 (진입기준) 50
  - id: 216
    name: 자재명세서(Q-BOM)_F
    desc: 최종 자재 목록(As-Built BOM)
    term: 최종 BOM
    source: LIG 개발품질 28
    template: BOM 양식
  - id: 217
    name: 시험성적서통합본
    desc: PCA 증빙용 성적서 모음
    term: 성적서 통합
    source: 방사청 가이드북 50
    template: 통합본 양식
  - id: 218
    name: 부적합및면제요청서(NCR)
    desc: 부적합, 면제 등 불일치 관리
    term: NCR
    source: LIG 개발품질 48
    template: nISP 결함관리
  - id: 219
    name: 최종제품보증서(COC_CoA)
    desc: 최종 납품 제품 품질 보증서
    term: 제품보증서
    source: LIG 개발품질 32
    template: 보증서 양식
  - id: 220
    name: 기술자료패키지목록(TDP)
    desc: 국방규격 제정용 도면/목록 패키지
    term: TDP
    source: 방사청 가이드북 15
    template: p.22 (주석 11) 15
  - id: 221
    name: PCA_회의록및조치결과
    desc: 제품 기준선 최종 승인 기록
    term: PCA 회의록
    source: 방사청 가이드북 51
    template: 회의록 양식
  - id: 222
    name: 연동통제문서(ICD)
    desc: 최종 인터페이스 문서
    term: ICD Final
    source: 방사청 가이드북 51
    template: 산출물 목록 참조
  - id: 223
    name: 제품형상식별서(PCI)_F
    desc: (Final) 제품 기준선 최종 문서
    term: PCI
    source: 방사청 가이드북 51
    template: p.103 (산출물) 51
  - id: 224
    name: 상세설계도면_F(PCA)
    desc: (Final) 국방규격화용 상세 도면
    term: 규격도면
    source: 방사청 가이드북 50
    template: 규격 양식
- code: 240
  name: LL
  desc: 개발이력 공유 및 종결 (Lessons Learned)
  tasks:
  - id: 241
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 242
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 243
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 244
    name: 협력개발품개발이력서
    desc: 개발 이력(변경, 이슈) 정리
    term: 개발이력서
    source: LIG 개발품질 52
    template: 이력공유 양식 52
  - id: 245
    name: 실패사례요약서
    desc: 실패 사례 및 극복 과정
    term: 실패사례
    source: LIG 개발품질 33
    template: 사례 양식
  - id: 246
    name: 개발이력공유회결과
    desc: 이력 공유회 발표 자료
    term: 공유회결과
    source: LIG 개발품질 52
    template: 발표자료 양식
  - id: 247
    name: 사업종료보고서
    desc: 사업 정산 및 행정 종료 보고서
    term: 종료보고서
    source: LIG 개발품질 53
    template: G6 종료 양식 53
fixed_subfolders:
- name: 00_Temp
  desc: AI가 읽는 산출물 생성 지침 및 양식. 이 폴더 안에 프롬프트, 템플릿, 작성 가이드를 배치하면 AI가 참조하여 산출물을 생성함.
- name: 01_Work
  desc: 자료 수집 및 가공 작업 공간. 원본 자료를 모으고 정리하는 임시 공간. 완료되면 02_Input으로 정제하여 이동.
- name: 02_Input
  desc: AI에게 전달할 최종 입력 데이터. 버전별 하위폴더(01/, 02/...) 생성 권장. AI는 가장 최신 버전을 읽어 산출물 생성.
- name: 03_Out
  desc: AI가 생성한 최종 산출물. 승인용 파일이 저장되며, 완료 여부 판단 기준 폴더. *_FINAL.* 파일 존재 시 완료로 간주.
- name: 04_Review
  desc: 산출물 검토 의견 및 피드백. 03_Out에 대한 리뷰 코멘트, RFI, 수정 요청 등을 기록.
- name: 05_Action
  desc: Review 후 조치 기록. 04_Review의 피드백에 대한 조치 결과 및 변경 이력을 문서화.
# 게이트 레벨 고정폴더(INBOX, LOG, TDP) 하위 구조 정의
# folder_type: 폴더명에 매칭 (INBOX, LOG, TDP)
# subfolders: 해당 폴더 내 생성할 하위폴더
# item_subfolders: 개별 아이템(YYYYMMDD_이름) 폴더 내 생성할 하위폴더
# example_item: 예시 폴더 생성 여부
fixed_gate_subfolders:
  INBOX:
    desc: 아직 분류되지 않은 자료 임시 보관. 하위에 YYYYMMDD_자료명 폴더 생성하여 사용.
    subfolders: []
    item_subfolders: []
    example_item: YYYYMMDD_분류전자료_예시
  LOG:
    desc: 의사결정 및 조치 기록. 회의록, 공문 관리.
    subfolders:
    - name: 01_회의
      desc: 회의록 보관. 하위에 YYYYMMDD_회의명 폴더 생성.
      example_item: YYYYMMDD_회의명_예시
      item_subfolders:
      - 00_Temp
      - 01_Work
      - 02_Input
      - 03_Out
      - 04_Action
    - name: 02_공문
      desc: 공문 보관. 하위에 YYYYMMDD_공문명 폴더 생성.
      example_item: YYYYMMDD_공문명_예시
      item_subfolders:
      - 00_Temp
      - 01_Work
      - 02_Input
      - 03_Out
      - 04_Action
  TDP:
    desc: 기술자료 패키지. 수신/송신 자료 관리.
    subfolders:
    - name: 01_수신
      desc: 외부에서 받은 기술자료. 하위에 YYYYMMDD_자료명 폴더 생성.
      example_item: YYYYMMDD_수신자료_예시
      item_subfolders: []
    - name: 02_송신
      desc: 외부로 보낸 기술자료. 하위에 YYYYMMDD_자료명 폴더 생성 후 작업.
      example_item: YYYYMMDD_송신자료_예시
      item_subfolders:
      - 00_Temp
      - 01_Work
      - 02_Input
      - 03_Out
completion_rule:
  required_folder: 03_Out
  done_if:
    mode: final_file
    pattern_examples:
    - '*_FINAL.*'
    fallback_mvp: 03_Out에 파일 1개 이상이면 완료로 간주
profiles:
  A:
    description: 최상위(슈퍼셋) — 모든 폴더 생성
    exclude_task_ids: []
  B:
    description: 'A에서 일부 제외(하드 제외: 폴더 미생성)'
    exclude_task_ids: []
  C:
    description: B보다 더 제외
    exclude_task_ids: []
generation_rules:
  gate_folder_format: '{GATE_CODE:03d}_{GATE_NAME}'
  task_folder_format: '{TASK_ID:03d}_{TASK_NAME}'
  static_folders:
  - 000_REF/01_방사청SE
  - 000_REF/02_방사청품질
  - 000_REF/03_고객품질
  - 000_REF/99_템플릿
  - 020_MGMT/021_자동화설정_운영규칙
  - 020_MGMT/022_INBOX_원본수집
  - 020_MGMT/023_연락처_이해관계자
  - 020_MGMT/024_예산_집행
  - 020_MGMT/025_통합로그_의사결정조치
  - 020_MGMT/026_상태_진행현황
  - 020_MGMT/029_보류_미분류
---


# 설명(사람용)
- 이 문서의 YAML(위)을 파싱해서 폴더를 생성한다.
- 정적 상위 폴더는 `000_REF`, `020_MGMT`를 먼저 생성한다.
- 단계 폴더는 `030_SRR`부터 시작하며, 이후 030 간격으로 진행한다.
- 작업폴더 내부는 fixed_subfolders 그대로 생성한다.
- 완료는 03_Out 기준으로 판단한다.

## 상위 구조 원칙
- `000_REF`: 과제 시작 전에 준비하는 기준/참고자료
- `020_MGMT`: 과제 전체를 가로지르는 자동화설정, 원본수집, 연락처, 예산, 통합로그, 상태, 보류자료
- `030~`: 체계공학 단계별 수행 및 산출물 축적 영역

## 폴더명 규칙
- **형식:** `한글명(영문약어)_상태`
- **예시:** `체계요구사항명세서(SSRS)_D`, `HW설계기술서(HDD)_F`
- **상태:** `_D` (초안), `_F` (확정), `_Prelim` (검토중)

## 파일명/Baseline 관리 권장사항
- 파일명 권장: `*_D_v0.9`, `*_F_v1.0` (또는 Approved/Baseline 표기)
- 승인 증빙(공문/메일/회의록 승인결과)은 Out 또는 Quality에 함께 보관

## 프로젝트별 추가 산출물(옵션)

아래 산출물은 계약/고객 요구에 따라 required_tasks에 추가할 수 있습니다.
- 형상관리계획서(CMP) — 020_MGMT 또는 060_SFR
- WBS/IMS — 020_MGMT
- 데이터관리계획(DMP) — 020_MGMT
- 교육훈련계획서(TTP) — 020_MGMT 또는 150_TRR_DT
- SE 도구/환경 계획서 — 020_MGMT

## 일정(Schedule) 필드 안내

### CSV 입력 시 추가 컬럼 (선택)
| 컬럼명     | 설명                                                               | 예시       |
| ---------- | ------------------------------------------------------------------ | ---------- |
| 작성목표일 | 내부 준비/초안 완료 목표 (Internal Target Date)                    | 2026-02-10 |
| 제출마감일 | 계약/고객 제출 마감일 (Official Deadline), 형상 기준선 확정과 연결 | 2026-02-24 |

- 빈 값 허용 (없으면 null)
- 출력은 ISO 8601 형식(YYYY-MM-DD)으로 정규화

### 파생 계산 (향후 확장)
- 2주 전 알림 계산 등은 대시보드/스캐너 에이전트에서 처리 (이번 범위 밖)
