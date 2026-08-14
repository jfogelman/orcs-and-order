import { DIRS8, distance, idx } from './grid';

/**
 * Grid pathfinding, deliberately kept ignorant of the game.
 *
 * Callers supply a `cost` callback that returns the movement points needed to
 * enter a tile, or `null` if it cannot be entered at all. Movement rules,
 * unit stacking and diplomacy therefore all live in `sim/`, and this file
 * stays testable with a hand-written cost function.
 */
export type CostFn = (x: number, y: number, fromX: number, fromY: number) => number | null;

/** Binary min-heap keyed on a numeric priority. */
class MinHeap {
  private priority: number[] = [];
  private value: number[] = [];

  get size(): number {
    return this.value.length;
  }

  push(p: number, v: number): void {
    this.priority.push(p);
    this.value.push(v);
    let i = this.value.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priority[parent] <= this.priority[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.value[0];
    const lastP = this.priority.pop()!;
    const lastV = this.value.pop()!;
    if (this.value.length > 0) {
      this.priority[0] = lastP;
      this.value[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let small = i;
        if (l < this.value.length && this.priority[l] < this.priority[small]) small = l;
        if (r < this.value.length && this.priority[r] < this.priority[small]) small = r;
        if (small === i) break;
        this.swap(i, small);
        i = small;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const p = this.priority[a];
    this.priority[a] = this.priority[b];
    this.priority[b] = p;
    const v = this.value[a];
    this.value[a] = this.value[b];
    this.value[b] = v;
  }
}

/**
 * A* over the 8-way grid. Returns the full route including the start tile, or
 * null when the goal is unreachable.
 */
export function findPath(
  width: number,
  height: number,
  start: [number, number],
  goal: [number, number],
  cost: CostFn,
): Array<[number, number]> | null {
  const startIdx = idx(start[0], start[1], width);
  const goalIdx = idx(goal[0], goal[1], width);
  if (startIdx === goalIdx) return [start];

  const best = new Map<number, number>([[startIdx, 0]]);
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();
  open.push(distance(start[0], start[1], goal[0], goal[1]), startIdx);
  const closed = new Set<number>();

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIdx) break;
    if (closed.has(current)) continue;
    closed.add(current);

    const cx = current % width;
    const cy = Math.floor(current / width);
    const g = best.get(current)!;

    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const step = cost(nx, ny, cx, cy);
      if (step === null) continue;
      const ni = idx(nx, ny, width);
      const g2 = g + step;
      const known = best.get(ni);
      if (known !== undefined && known <= g2) continue;
      best.set(ni, g2);
      cameFrom.set(ni, current);
      open.push(g2 + distance(nx, ny, goal[0], goal[1]), ni);
    }
  }

  if (!best.has(goalIdx)) return null;

  const route: Array<[number, number]> = [];
  let node = goalIdx;
  for (;;) {
    route.push([node % width, Math.floor(node / width)]);
    if (node === startIdx) break;
    const prev = cameFrom.get(node);
    if (prev === undefined) return null;
    node = prev;
  }
  return route.reverse();
}

/**
 * Every tile reachable from `start` within `budget` movement points.
 *
 * Implements the Civ2 rule that a unit with any movement left may always
 * complete one more step, however expensive the terrain: entering a tile
 * costs at most whatever the unit has remaining.
 *
 * Returns a map of tile index to points spent, excluding the start tile.
 */
export function reachableWithin(
  width: number,
  height: number,
  start: [number, number],
  budget: number,
  cost: CostFn,
): Map<number, number> {
  const out = new Map<number, number>();
  if (budget <= 0) return out;

  const startIdx = idx(start[0], start[1], width);
  const spent = new Map<number, number>([[startIdx, 0]]);
  const open = new MinHeap();
  open.push(0, startIdx);
  const closed = new Set<number>();

  while (open.size > 0) {
    const current = open.pop();
    if (closed.has(current)) continue;
    closed.add(current);
    const g = spent.get(current)!;
    // No movement left means no further steps, even cheap ones.
    if (g >= budget) continue;

    const cx = current % width;
    const cy = Math.floor(current / width);
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const step = cost(nx, ny, cx, cy);
      if (step === null) continue;
      // The last step may cost more than remains; it simply consumes the rest.
      const g2 = Math.min(budget, g + step);
      const ni = idx(nx, ny, width);
      const known = spent.get(ni);
      if (known !== undefined && known <= g2) continue;
      spent.set(ni, g2);
      out.set(ni, g2);
      open.push(g2, ni);
    }
  }
  return out;
}
