function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function tangents(points) {
  if (points.length < 2) return [];
  const slopes = points.slice(1).map((point, index) => (
    (point.y - points[index].y) / (point.x - points[index].x)
  ));
  return points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1);
    const before = slopes[index - 1];
    const after = slopes[index];
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  });
}

export function monotoneCurveCommands(points) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(finitePoint)) return null;
  const direction = Math.sign(points[1].x - points[0].x);
  if (direction === 0 || points.slice(1).some((point, index) => Math.sign(point.x - points[index].x) !== direction)) return null;
  const tangent = tangents(points);
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const dx = point.x - previous.x;
    const low = Math.min(previous.y, point.y);
    const high = Math.max(previous.y, point.y);
    const control1Y = Math.min(high, Math.max(low, previous.y + (tangent[index] * dx) / 3));
    const control2Y = Math.min(high, Math.max(low, point.y - (tangent[index + 1] * dx) / 3));
    return `C ${previous.x + dx / 3},${control1Y} ${point.x - dx / 3},${control2Y} ${point.x},${point.y}`;
  });
}

export function monotoneAreaPath(upper, lower) {
  const upperCommands = monotoneCurveCommands(upper);
  const reversedLower = Array.isArray(lower) ? [...lower].reverse() : null;
  const lowerCommands = monotoneCurveCommands(reversedLower);
  if (upperCommands === null || lowerCommands === null || upper.length !== lower.length) return null;
  return `M ${upper[0].x},${upper[0].y} ${upperCommands.join(" ")} L ${reversedLower[0].x},${reversedLower[0].y} ${lowerCommands.join(" ")} Z`;
}
