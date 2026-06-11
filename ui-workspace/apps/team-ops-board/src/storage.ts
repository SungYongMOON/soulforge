// localStorage 어댑터와 시드 데이터 (공개 안전 샘플만 사용).
import { addDaysKey, dateKey } from "./core/model.mjs";
import { addComment, addItem, emptyState, parseState, serializeState, upsertPerson, upsertProject } from "./core/store.mjs";

export const STORAGE_KEY = "team_ops_board_v1";

export function loadStoredState(): any | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = parseState(raw);
    return parsed.error ? null : parsed.state;
  } catch {
    return null;
  }
}

export function saveStoredState(state: any): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

// 시드: 설계서 표본 규모(프로젝트 3, 팀원 6, 항목 20)를 실제 오늘 날짜 기준으로 생성.
export function buildSeedState(): any {
  const at = nowIso();
  const actor = "관리자";
  const today = todayKey();
  let state = emptyState();

  const projectSeeds = [
    { name: "게이트웨이 정비", code: "GTW", color: "#0e7490", health: "watch", currentGoal: "메일 인입 안정화", nextGate: "주간 점검", targetDate: addDaysKey(today, 8) },
    { name: "지식 운영", code: "KOP", color: "#7c3aed", health: "ok", currentGoal: "소스 패킷 검토 회전", nextGate: "검토 회의", targetDate: addDaysKey(today, 4) },
    { name: "운영 보드 구축", code: "BRD", color: "#d97706", health: "risk", currentGoal: "MVP 1 파일럿", nextGate: "팀 시연", targetDate: addDaysKey(today, 2) }
  ];
  const projectIds: string[] = [];
  for (const seed of projectSeeds) {
    const result = upsertProject(state, { at, actor, project: seed });
    state = result.state;
    if (result.project) {
      projectIds.push(result.project.id);
    }
  }

  const peopleSeeds = [
    { name: "김지나", role: "운영 리드", color: "#0f766e" },
    { name: "이마르코", role: "프로젝트 조율", color: "#2563eb" },
    { name: "박일랴", role: "워크플로 담당", color: "#9333ea" },
    { name: "조하나", role: "품질 검토", color: "#ca8a04" },
    { name: "한오웬", role: "데이터 정리", color: "#c2410c" },
    { name: "나프리야", role: "납품 관리", color: "#15803d" }
  ];
  const personIds: string[] = [];
  for (const seed of peopleSeeds) {
    const result = upsertPerson(state, { at, actor, person: seed });
    state = result.state;
    if (result.person) {
      personIds.push(result.person.id);
    }
  }

  const D = (offset: number) => addDaysKey(today, offset);
  const itemSeeds: any[] = [
    { title: "오늘 인입 담당 지도 확정", projectId: projectIds[0], ownerId: personIds[0], status: "doing", priority: "high", dueDate: D(0), nextAction: "담당 분배 확인" },
    { title: "소스 패킷 검토 인계 노트 초안", projectId: projectIds[1], ownerId: personIds[2], status: "todo", priority: "normal", dueDate: D(0), nextAction: "초안 작성" },
    { title: "보드 빌드 출력 확인", projectId: projectIds[2], ownerId: personIds[3], status: "todo", priority: "normal", dueDate: D(0), nextAction: "빌드 로그 확인" },
    { title: "오래된 차단 라벨 정리", projectId: projectIds[0], ownerId: personIds[1], status: "blocked", priority: "high", dueDate: D(0), blockerReason: "라벨 2건 폐기 여부 책임자 확인 대기", nextAction: "책임자 회신 확인" },
    { title: "주간 검토 명단 확정", projectId: projectIds[1], ownerId: personIds[5], status: "waiting", priority: "normal", dueDate: D(1), waitingOn: "검토자 일정 회신", nextAction: "회신 오면 명단 고정" },
    { title: "인수 화면 캡처 수집", projectId: projectIds[2], ownerId: personIds[3], status: "doing", priority: "normal", dueDate: D(1), nextAction: "데스크톱 캡처 먼저" },
    { title: "담당 없는 인입 항목 배정", projectId: projectIds[0], ownerId: null, status: "todo", priority: "high", dueDate: D(1), nextAction: "아침 회의에서 배정" },
    { title: "후보 큐 라벨 정규화", projectId: projectIds[1], ownerId: personIds[4], status: "todo", priority: "low", dueDate: D(2), nextAction: "라벨 표준안 적용" },
    { title: "표본 데이터 검토", projectId: projectIds[2], ownerId: personIds[5], status: "done", priority: "low", dueDate: D(0), nextAction: "" },
    { title: "금요일 현황 요약 준비", projectId: projectIds[0], ownerId: personIds[0], status: "todo", priority: "normal", dueDate: D(2), nextAction: "요약 틀 잡기" },
    { title: "수동 검토 게이트 문구 확정", projectId: projectIds[1], ownerId: personIds[2], status: "blocked", priority: "normal", dueDate: D(2), blockerReason: "체크리스트 공개 전 책임자 문구 필요", nextAction: "문구 받으면 게시" },
    { title: "모바일 보드 열 조정", projectId: projectIds[2], ownerId: personIds[3], status: "todo", priority: "normal", dueDate: D(2), nextAction: "열 너비 실험" },
    { title: "운영자 인계 색인 갱신", projectId: projectIds[1], ownerId: personIds[4], status: "waiting", priority: "high", dueDate: D(3), waitingOn: "마지막 사용 기록 첨부", nextAction: "기록 오면 색인 닫기" },
    { title: "주간 CSV 표본 검토", projectId: projectIds[2], ownerId: personIds[1], status: "todo", priority: "low", dueDate: D(3), nextAction: "" },
    { title: "완료 인입 영수증 정리", projectId: projectIds[0], ownerId: personIds[5], status: "done", priority: "low", dueDate: D(0), nextAction: "" },
    { title: "보드 라벨-검토 패킷 대조", projectId: projectIds[2], ownerId: null, status: "todo", priority: "normal", dueDate: D(4), nextAction: "라벨 목록 추출" },
    { title: "소스 패킷 예행 일정 잡기", projectId: projectIds[1], ownerId: personIds[0], status: "todo", priority: "normal", dueDate: D(5), nextAction: "참석자 후보 정리" },
    { title: "팀원 부하 균형 점검", projectId: projectIds[0], ownerId: personIds[1], status: "doing", priority: "low", dueDate: D(5), nextAction: "보드 People 화면 확인" },
    { title: "설정 화면 자리표시 확인", projectId: projectIds[2], ownerId: personIds[3], status: "todo", priority: "low", dueDate: D(6), nextAction: "" },
    { title: "주간 담당 요약 내보내기", projectId: projectIds[0], ownerId: personIds[5], status: "todo", priority: "normal", dueDate: D(6), nextAction: "내보내기 양식 확인" }
  ];

  let firstItemId: string | null = null;
  for (const seed of itemSeeds) {
    const result = addItem(state, { at, actor, fields: seed });
    if (!result.error && result.item) {
      state = result.state;
      if (!firstItemId) {
        firstItemId = result.item.id;
      }
    }
  }

  if (firstItemId) {
    const commented = addComment(state, { at, actor: "이마르코", itemId: firstItemId, message: "담당 분배 검토 준비 완료." });
    if (!commented.error) {
      state = commented.state;
    }
  }

  return state;
}
