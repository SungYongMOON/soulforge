export const MOBILE_DETAIL_MAX_WIDTH = 760;
export const MOBILE_DETAIL_MEDIA_QUERY = `(max-width: ${MOBILE_DETAIL_MAX_WIDTH}px)`;

export function isMobileDetailViewport(width) {
  return Number.isFinite(width) && width >= 0 && width <= MOBILE_DETAIL_MAX_WIDTH;
}

export function isFocusRestoreCandidate({
  exists = true,
  isConnected,
  disabled = false,
  hidden = false,
  inert = false
}) {
  return Boolean(exists && isConnected && !disabled && !hidden && !inert);
}

export function pickFocusRestoreIndex(candidates) {
  return candidates.findIndex(isFocusRestoreCandidate);
}

export function getMobileDialogFocusCycleKey({
  open,
  taskId,
  taskStatus
}) {
  if (!open || !taskId || !taskStatus) {
    return null;
  }

  return `${taskId}:${taskStatus}`;
}

export function resolveMobileDialogKey({
  key,
  shiftKey = false,
  activeIndex = -1,
  focusableCount
}) {
  if (key === "Escape") {
    return { action: "close" };
  }

  if (key !== "Tab" || focusableCount <= 0) {
    return { action: "native" };
  }

  if (activeIndex < 0) {
    return {
      action: "focus",
      index: shiftKey ? focusableCount - 1 : 0
    };
  }

  if (shiftKey && activeIndex === 0) {
    return { action: "focus", index: focusableCount - 1 };
  }

  if (!shiftKey && activeIndex === focusableCount - 1) {
    return { action: "focus", index: 0 };
  }

  return { action: "native" };
}
