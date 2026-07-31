// Owner Action Inbox MVP — synthetic, read-only fixture adapter.
// No task, thread, ERP, worktree, or provider data in this module is live.

export const INBOX_STATUSES = [
  "in_progress",
  "review_needed",
  "blocked",
  "completed_unread"
];

export const INBOX_STATUS_LABELS = {
  in_progress: "진행 중",
  review_needed: "검토·결정 필요",
  blocked: "막힘",
  completed_unread: "완료·미확인",
  owner_acknowledged: "읽고 확인됨",
  excluded: "기본 제외"
};

export const DEFAULT_CARD_LIMIT = 4;

const PROJECTS = [
  ["P01", "오로라"],
  ["P02", "네뷸라"],
  ["P03", "아틀라스"],
  ["P04", "루멘"],
  ["P05", "폴라리스"],
  ["P06", "브릿지"],
  ["P07", "센티널"],
  ["P08", "포지"],
  ["P09", "하버"],
  ["P10", "노바"]
];

const RESPONSIBILITIES = [
  "전략·포트폴리오",
  "기능개발",
  "설계검토",
  "시험평가",
  "품질보증",
  "구매·조달",
  "일정통합",
  "형상관리",
  "요구사항",
  "보안검토",
  "데이터운영",
  "지식운영",
  "문서출판",
  "고객지원",
  "운영자동화"
];

const PROVIDER_FIXTURES = [
  [{ agent: "Codex", provider: "GPT", observed: true }],
  [{ agent: "Antigravity", provider: "Gemini", observed: true }],
  [{ agent: "Kimi", provider: "Kimi", observed: true }],
  []
];

function taskBase(overrides) {
  return {
    id: "",
    title: "",
    projectCode: "",
    project: "",
    responsibility: "",
    route: "",
    status: "excluded",
    priority: 2,
    lastActivityKst: "2026-07-31 09:00 KST",
    reviewNeeded: false,
    pointer: "",
    agentState: "unknown",
    providers: [],
    owner: "책임자 미관찰",
    reviewer: "검토자 미관찰",
    worktree: null,
    blockerReason: "",
    nextDecision: "",
    evidenceSummary: "",
    impact: "",
    requestMessage: "",
    targetActive: false,
    excludedReason: "기본 대상 아님",
    synthetic: true,
    events: [],
    ...overrides
  };
}

function specialTasks() {
  return [
    taskBase({
      id: "fixture-aurora-release",
      title: "오로라 출시 체크리스트",
      projectCode: "P01",
      project: "오로라",
      responsibility: "기능개발",
      route: "[SYSTEM] 기능개발/팀장",
      status: "in_progress",
      priority: 0,
      lastActivityKst: "2026-07-31 15:42 KST",
      pointer: "[SYSTEM] 오로라 출시 체크리스트/TASK",
      agentState: "observed",
      providers: [{ agent: "Codex", provider: "GPT", observed: true }],
      owner: "책임자 A",
      reviewer: "품질 검토",
      worktree: "codex/aurora-release-check",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-nebula-risk",
      title: "네뷸라 위험대장 정리",
      projectCode: "P02",
      project: "네뷸라",
      responsibility: "전략·포트폴리오",
      route: "[개발1팀 운영실] 전략기획·포트폴리오",
      status: "in_progress",
      priority: 1,
      lastActivityKst: "2026-07-31 14:18 KST",
      pointer: "[개발1팀 운영실] 네뷸라 위험대장 정리/TASK",
      agentState: "observed",
      providers: [{ agent: "Antigravity", provider: "Gemini", observed: true }],
      owner: "책임자 D",
      reviewer: "운영실",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-nebula-review",
      title: "네뷸라 인증자료 검토",
      projectCode: "P02",
      project: "네뷸라",
      responsibility: "설계검토",
      route: "[SYSTEM] 설계검토/책임자",
      status: "review_needed",
      priority: 0,
      lastActivityKst: "2026-07-31 13:50 KST",
      reviewNeeded: true,
      pointer: "[SYSTEM] 네뷸라 인증자료 검토/TASK",
      agentState: "observed",
      providers: [{ agent: "Kimi", provider: "Kimi", observed: true }],
      owner: "책임자 B",
      reviewer: "Owner",
      nextDecision: "검토 의견 승인",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-aurora-supply",
      title: "오로라 공급 일정 확정",
      projectCode: "P01",
      project: "오로라",
      responsibility: "구매·조달",
      route: "[SYSTEM] 구매·조달/책임자",
      status: "blocked",
      priority: 0,
      lastActivityKst: "2026-07-31 13:12 KST",
      reviewNeeded: true,
      pointer: "[SYSTEM] 오로라 공급 일정 확정/TASK",
      agentState: "observed",
      providers: [{ agent: "Codex", provider: "GPT", observed: true }],
      owner: "책임자 C",
      reviewer: "Owner",
      blockerReason: "부품 납기 미확정",
      nextDecision: "대체 공급안 승인",
      evidenceSummary: "공급 확인 2/5 · readiness 40% (HOLD)",
      impact: "일정 지연 위험 · 높음",
      requestMessage: "부품 납기 이슈로 일정 리스크가 발생했습니다. 대체 공급안 승인 여부를 결정해 주세요.",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-aurora-complete",
      title: "오로라 회고 승인 결과",
      projectCode: "P01",
      project: "오로라",
      responsibility: "품질보증",
      route: "[SYSTEM] 품질보증/검토자",
      status: "completed_unread",
      priority: 1,
      lastActivityKst: "2026-07-31 11:30 KST",
      reviewNeeded: true,
      pointer: "[SYSTEM] 오로라 회고 승인 결과/TASK",
      agentState: "observed",
      providers: [{ agent: "Codex", provider: "GPT", observed: true }],
      owner: "책임자 E",
      reviewer: "Owner",
      nextDecision: "결과를 읽고 확인",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-atlas-multi-agent",
      title: "아틀라스 통합 검증 패킷",
      projectCode: "P03",
      project: "아틀라스",
      responsibility: "시험평가",
      route: "[SYSTEM] 시험평가/통합검증",
      status: "review_needed",
      priority: 1,
      lastActivityKst: "2026-07-31 10:45 KST",
      reviewNeeded: true,
      pointer: "[SYSTEM] 아틀라스 통합 검증 패킷/TASK",
      agentState: "observed",
      providers: [
        { agent: "Codex", provider: "GPT", observed: true },
        { agent: "Antigravity", provider: "Gemini", observed: true },
        { agent: "Kimi", provider: "Kimi", observed: false }
      ],
      owner: "책임자 F",
      reviewer: "시험평가 검토자",
      nextDecision: "복수 agent 결과 대조",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-lumen-unknown",
      title: "루멘 자료 위치 확인",
      projectCode: "P04",
      project: "루멘",
      responsibility: "지식운영",
      route: "[SYSTEM] 지식운영/분류",
      status: "in_progress",
      priority: 2,
      lastActivityKst: "2026-07-31 09:40 KST",
      pointer: "[SYSTEM] 루멘 자료 위치 확인/TASK",
      agentState: "unknown",
      providers: [],
      owner: "책임자 G",
      reviewer: "검토자 미관찰",
      targetActive: true,
      excludedReason: ""
    }),
    taskBase({
      id: "fixture-missing-route",
      title: "누락 메타데이터 보완",
      projectCode: "UNKNOWN",
      project: "프로젝트 미관찰",
      responsibility: "",
      route: "",
      status: "blocked",
      priority: 1,
      lastActivityKst: "2026-07-31 09:20 KST",
      pointer: "[SYNTHETIC] missing-data/TASK",
      agentState: "unknown",
      providers: [],
      owner: "책임자 미관찰",
      reviewer: "검토자 미관찰",
      blockerReason: "responsibility/route 필드 누락",
      nextDecision: "source pointer 확인 후 분류",
      targetActive: true,
      excludedReason: ""
    })
  ];
}

export function buildOwnerInboxFixture() {
  const responsibilities = [];
  const scaleTasks = [];

  PROJECTS.forEach(([projectCode, project], projectIndex) => {
    RESPONSIBILITIES.forEach((responsibility, responsibilityIndex) => {
      const route = `[${project}] ${responsibility}/책임자`;
      const responsibilityId = `${projectCode}-R${String(responsibilityIndex + 1).padStart(2, "0")}`;
      responsibilities.push({
        id: responsibilityId,
        projectCode,
        project,
        responsibility,
        route,
        synthetic: true
      });

      for (let taskIndex = 0; taskIndex < 2; taskIndex += 1) {
        const ordinal = projectIndex * RESPONSIBILITIES.length + responsibilityIndex;
        const targetActive = taskIndex === 0 && ordinal % 13 === 0;
        const providerSet = PROVIDER_FIXTURES[ordinal % PROVIDER_FIXTURES.length];
        const activeStatus = INBOX_STATUSES[ordinal % INBOX_STATUSES.length];
        const excludedStates = ["todo", "waiting", "owner_acknowledged", "archived"];
        const status = targetActive ? activeStatus : excludedStates[(ordinal + taskIndex) % excludedStates.length];

        scaleTasks.push(
          taskBase({
            id: `${responsibilityId}-T${taskIndex + 1}`,
            title: `${project} ${responsibility} 점검 ${taskIndex + 1}`,
            projectCode,
            project,
            responsibility,
            route,
            status,
            priority: ordinal % 3,
            lastActivityKst: `2026-07-${String(30 - (ordinal % 12)).padStart(2, "0")} ${String(9 + (ordinal % 8)).padStart(2, "0")}:15 KST`,
            reviewNeeded: status === "review_needed" || status === "completed_unread",
            pointer: `[SYNTHETIC] ${projectCode}/${responsibilityId}/TASK-${taskIndex + 1}`,
            agentState: providerSet.length > 0 ? "observed" : "unknown",
            providers: providerSet,
            owner: `책임자 ${String.fromCharCode(65 + (ordinal % 8))}`,
            reviewer: status === "review_needed" ? "Owner" : "검토자 미관찰",
            blockerReason: status === "blocked" ? "합성 선행조건 확인 대기" : "",
            nextDecision: status === "blocked" ? "다음 합성 결정을 선택" : "",
            worktree: targetActive && ordinal % 5 === 0 ? `codex/${projectCode.toLowerCase()}-${responsibilityIndex + 1}` : null,
            targetActive,
            excludedReason: targetActive ? "" : "기본 대상 상태 또는 비활성 표본"
          })
        );
      }
    });
  });

  return {
    schemaVersion: "soulforge.owner_action_inbox.fixture.v1",
    synthetic: true,
    observedAtKst: "2026-07-31 16:00 KST",
    projects: PROJECTS.map(([code, name]) => ({ code, name })),
    responsibilities,
    tasks: [...specialTasks(), ...scaleTasks],
    history: []
  };
}

function searchableText(task) {
  return [
    task.title,
    task.project,
    task.projectCode,
    task.responsibility,
    task.route,
    task.pointer,
    task.owner,
    task.reviewer,
    task.status,
    task.excludedReason,
    task.blockerReason,
    task.nextDecision,
    task.evidenceSummary,
    task.impact,
    task.requestMessage,
    ...task.providers.flatMap((entry) => [entry.agent, entry.provider])
  ]
    .join(" ")
    .toLowerCase();
}

export function selectInboxTasks(
  fixture,
  {
    view = "active",
    query = "",
    project = "all",
    responsibility = "all",
    status = "all",
    limit = DEFAULT_CARD_LIMIT
  } = {}
) {
  const normalizedQuery = String(query).trim().toLowerCase();
  const historyView = view === "history";
  const eligible = fixture.tasks.filter((task) => {
    const inView = historyView
      ? task.status === "owner_acknowledged" || !task.targetActive || !INBOX_STATUSES.includes(task.status)
      : task.targetActive && INBOX_STATUSES.includes(task.status);
    return (
      inView &&
      (project === "all" || task.projectCode === project) &&
      (responsibility === "all" || task.responsibility === responsibility) &&
      (status === "all" || task.status === status) &&
      (!normalizedQuery || searchableText(task).includes(normalizedQuery))
    );
  });

  eligible.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return right.lastActivityKst.localeCompare(left.lastActivityKst);
  });

  const grouped = Object.fromEntries(
    INBOX_STATUSES.map((statusId) => {
      const all = eligible.filter((task) => task.status === statusId);
      return [
        statusId,
        {
          all,
          visible: all.slice(0, limit),
          total: all.length,
          hasMore: all.length > limit
        }
      ];
    })
  );

  return { eligible, grouped };
}

export function acknowledgeFixtureTask(fixture, { taskId, atKst = "2026-07-31 16:05 KST", actor = "Owner" }) {
  const task = fixture.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return { fixture, error: "task_not_found" };
  }
  if (task.status !== "completed_unread") {
    return { fixture, error: "task_not_completed_unread" };
  }

  const event = {
    id: `ack-${task.id}-${fixture.history.length + 1}`,
    kind: "owner_acknowledged",
    taskId: task.id,
    atKst,
    actor,
    originalPointer: task.pointer,
    from: "completed_unread",
    to: "owner_acknowledged",
    synthetic: true
  };

  return {
    fixture: {
      ...fixture,
      tasks: fixture.tasks.map((entry) =>
        entry.id === taskId
          ? {
              ...entry,
              status: "owner_acknowledged",
              targetActive: false,
              excludedReason: "Owner가 읽고 확인함",
              events: [event, ...entry.events]
            }
          : entry
      ),
      history: [event, ...fixture.history]
    },
    event
  };
}
