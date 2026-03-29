export function renderMonsterCreatedMessage({ inboxId, sourceRef, subject, bodyExcerpt, from, attachmentRefs, monsters }) {
  const lines = [
    "[관문]",
    "새 의뢰가 도착했습니다.",
  ];

  if (subject) {
    lines.push("");
    lines.push(`제목: ${subject}`);
  }

  const bodySummary = summarizeMailBody(bodyExcerpt);
  if (bodySummary) {
    lines.push(`요약: ${bodySummary}`);
  }

  lines.push(`발신자: ${formatSenderSummary(from)}`);
  lines.push(`첨부파일: ${formatAttachmentCount(attachmentRefs)}`);
  lines.push(`몬스터 수: ${monsters.length}마리`);

  lines.push("");
  lines.push("몬스터 정보");

  monsters.forEach((monster, index) => {
    lines.push(`${index + 1}. ${formatMonsterHeadline(monster)}`);
    lines.push(` - 할일: ${formatMonsterObjective(monster)}`);
    lines.push(` - 기한: ${formatMonsterDue(monster)}`);
    lines.push(` - 긴급도: ${formatMonsterUrgency(monster)}`);
  });

  if (!subject && (inboxId || sourceRef)) {
    lines.push("");
    lines.push("관문에서 새 몬스터가 감지되었습니다.");
  }

  return lines.join("\n");
}

export function sanitizeId(value) {
  const cleaned = String(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "unknown";
}

function formatMonsterHeadline(monster) {
  const family = normalizeMonsterFamilyLabel(monster.monster_family);
  const rawName = String(monster.monster_name ?? "").trim();
  if (!rawName) {
    return family;
  }

  const name = normalizeMonsterNameLabel(rawName);
  if (name.toLowerCase() === family.toLowerCase()) {
    return name;
  }

  return `${name} ${family}`;
}

function formatMonsterObjective(monster) {
  const objectiveKo = String(monster.objective_ko ?? "").trim();
  if (objectiveKo) {
    return objectiveKo;
  }

  const objective = String(monster.objective ?? "").trim();
  if (!objective) {
    return "미정";
  }

  return localizeInstruction(objective, "task");
}

function summarizeMailBody(bodyExcerpt) {
  const normalized = normalizeSentence(bodyExcerpt);
  if (!normalized) {
    return null;
  }

  return truncateLine(localizeInstruction(stripSummaryDueHint(normalized), "summary"), 120);
}

function localizeInstruction(value, mode) {
  const text = normalizeSentence(value);
  if (!text) {
    return mode === "summary" ? "새 요청이 도착했습니다." : "세부 작업을 확인합니다.";
  }

  const stripped = stripRequestPrefix(text);

  const matched =
    matchInstruction(stripped, /^Review and process the attached (.+)$/i, {
      task: (target) => `첨부된 ${target}를 검토하고 처리합니다.`,
      summary: (target) => `첨부된 ${target}의 검토 및 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Review and process (.+)$/i, {
      task: (target) => `${target}를 검토하고 처리합니다.`,
      summary: (target) => `${target}의 검토 및 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Review the attached (.+)$/i, {
      task: (target) => `첨부된 ${target}를 검토합니다.`,
      summary: (target) => `첨부된 ${target} 검토 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Review (.+)$/i, {
      task: (target) => `${target}를 검토합니다.`,
      summary: (target) => `${target} 검토 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Process the attached (.+)$/i, {
      task: (target) => `첨부된 ${target}를 처리합니다.`,
      summary: (target) => `첨부된 ${target} 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Process (.+)$/i, {
      task: (target) => `${target}를 처리합니다.`,
      summary: (target) => `${target} 처리 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Update (.+)$/i, {
      task: (target) => `${target}를 업데이트합니다.`,
      summary: (target) => `${target} 업데이트 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^(Create|Write|Draft|Prepare) (.+)$/i, {
      task: (target) => `${target}를 작성합니다.`,
      summary: (target) => `${target} 작성 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^(Send|Submit) (.+)$/i, {
      task: (target) => `${target}를 송부합니다.`,
      summary: (target) => `${target} 송부 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Confirm (.+)$/i, {
      task: (target) => `${target}를 확인합니다.`,
      summary: (target) => `${target} 확인 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Complete and submit (.+)$/i, {
      task: (target) => `${target}를 완료하고 제출합니다.`,
      summary: (target) => `${target} 완료 및 제출 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^Complete (.+)$/i, {
      task: (target) => `${target}를 완료합니다.`,
      summary: (target) => `${target} 완료 요청입니다.`,
    }) ||
    matchInstruction(stripped, /^(Reply|Respond) with (.+)$/i, {
      task: (target) => `${target}를 회신합니다.`,
      summary: (target) => `${target} 회신 요청입니다.`,
    });

  if (matched) {
    return matched[mode];
  }

  return mode === "summary"
    ? `다음 요청이 도착했습니다: ${truncateLine(stripped, 90)}`
    : `다음 작업을 진행합니다: ${truncateLine(stripped, 90)}`;
}

function formatSenderSummary(entries) {
  const normalized = normalizeArray(entries);
  if (normalized.length === 0) {
    return "미확인";
  }

  const [first, ...rest] = normalized;
  const primary = first.name || first.address || "미확인";
  if (rest.length === 0) {
    return primary;
  }

  return `${primary} 외 ${rest.length}`;
}

function formatAttachmentCount(attachmentRefs) {
  const count = normalizeArray(attachmentRefs).filter(Boolean).length;
  if (count === 0) {
    return "없음";
  }

  return `${count}건`;
}

function formatMonsterDue(monster) {
  return formatDueLabel(monster.d_day, monster.due_state);
}

function formatDueLabel(dDay, dueState) {
  const date = parseDueDate(dDay);
  if (!date) {
    return "기한 미정";
  }

  const dayName = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}(${dayName})`;
  const delta = formatDueDelta(date, dueState);

  return delta ? `${dateLabel} · ${delta}` : dateLabel;
}

function formatDueDelta(date, dueState) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  if (dueState === "missed" || diffDays < 0) {
    return `D+${Math.abs(diffDays)}`;
  }

  if (diffDays === 0) {
    return "D-Day";
  }

  return `D-${diffDays}`;
}

function formatMonsterUrgency(monster) {
  const dueState = monster.due_state ?? computeDueState(monster.d_day);
  if (dueState === "missed" || dueState === "at_risk") {
    return "긴급";
  }

  const date = parseDueDate(monster.d_day);
  if (!date) {
    return "보통";
  }

  const diffMs = date.getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) {
    return "주의";
  }

  return "보통";
}

function parseDueDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function computeDueState(dDay) {
  if (!dDay) {
    return "unknown";
  }

  const date = parseDueDate(dDay);
  if (!date) {
    return "unknown";
  }

  const diffMs = date.getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) {
    return "missed";
  }
  if (diffDays <= 3) {
    return "at_risk";
  }
  return "on_track";
}

function matchInstruction(value, pattern, renderers) {
  const match = String(value).match(pattern);
  if (!match) {
    return null;
  }

  const rawTarget = match.at(-1) ?? "";
  const target = normalizeInstructionTarget(rawTarget);
  if (!target) {
    return null;
  }

  return {
    task: renderers.task(target),
    summary: renderers.summary(target),
  };
}

function stripRequestPrefix(value) {
  return String(value)
    .trim()
    .replace(/^please\s+/i, "")
    .replace(/^kindly\s+/i, "")
    .replace(/^can you\s+/i, "")
    .replace(/^could you\s+/i, "")
    .trim();
}

function normalizeSentence(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/, "");
}

function normalizeInstructionTarget(value) {
  return normalizeSentence(value)
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\bpackage\b/gi, "패키지")
    .replace(/\bdocument\b/gi, "문서")
    .replace(/\bfile\b/gi, "파일")
    .replace(/\breport\b/gi, "보고서")
    .replace(/\bchecklist\b/gi, "체크리스트")
    .replace(/\bdraft\b/gi, "초안")
    .replace(/\bsubmission\b/gi, "제출본")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateLine(value, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function stripSummaryDueHint(value) {
  return String(value ?? "")
    .replace(/\s+(by|before|until|due)\s+[^.]+$/i, "")
    .replace(/\s+기한[:\s][^.]+$/i, "")
    .trim();
}

function normalizeMonsterFamilyLabel(value) {
  if (!value) {
    return "정체 미상";
  }

  const key = String(value).trim();
  const labels = {
    slime: "슬라임",
    imp: "임프",
    goblin: "고블린",
    kobold: "코볼트",
    mimic: "미믹",
    basilisk: "바실리스크",
    harpy: "하피",
    orc: "오크",
    golem: "골렘",
    troll: "트롤",
    wyvern: "와이번",
    hydra: "히드라",
    chimera: "키메라",
    sphinx: "스핑크스",
    beholder: "비홀더",
    lich: "리치",
    wraith: "레이스",
    phoenix: "피닉스",
    dragon: "드래곤",
    unknown_monster: "정체 미상",
  };

  return labels[key] ?? humanizeLabel(key);
}

function normalizeMonsterNameLabel(value) {
  if (!value) {
    return "이름 미정";
  }
  return humanizeLabel(String(value));
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function humanizeLabel(value) {
  return String(value)
    .trim()
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}
