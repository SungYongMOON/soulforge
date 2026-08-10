import assert from "node:assert/strict";
import test from "node:test";

import { monotoneAreaPath, monotoneCurveCommands } from "./monotone-area.mjs";

test("monotone curve preserves exact daily points and clamps controls within adjacent values", () => {
  const points = [{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 20 }, { x: 30, y: 5 }];
  const commands = monotoneCurveCommands(points);
  assert.equal(commands.length, 3);
  for (const point of points.slice(1)) assert.match(commands.join(" "), new RegExp(`${point.x},${point.y}(?: |$)`));
  commands.forEach((command, index) => {
    const numbers = command.match(/-?\d+(?:\.\d+)?/gu).map(Number);
    const low = Math.min(points[index].y, points[index + 1].y);
    const high = Math.max(points[index].y, points[index + 1].y);
    assert.ok(numbers[1] >= low && numbers[1] <= high);
    assert.ok(numbers[3] >= low && numbers[3] <= high);
  });
});

test("monotone stacked area closes exact upper and lower daily boundaries without interpolation data", () => {
  const upper = [{ x: 0, y: 2 }, { x: 10, y: 8 }, { x: 20, y: 4 }];
  const lower = [{ x: 0, y: 10 }, { x: 10, y: 12 }, { x: 20, y: 9 }];
  const path = monotoneAreaPath(upper, lower);
  assert.match(path, /^M 0,2 C /u);
  assert.match(path, /20,4 L 20,9 C/u);
  assert.match(path, /0,10 Z$/u);
  assert.equal(monotoneAreaPath([{ x: 0, y: 0 }], [{ x: 0, y: 1 }]), null);
});
