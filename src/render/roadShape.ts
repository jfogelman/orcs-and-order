import { DIRS8 } from '../engine/grid';

/**
 * Which of a road tile's eight spokes to draw, as `DIRS8` indices.
 *
 * Every road neighbour joins for movement -- a diagonal step along a road costs
 * a third like any other, and that stays. But a diagonal is only *drawn* when it
 * is the only way the two tiles meet. When either tile beside the diagonal is a
 * road too, the corner is already joined through it, and drawing the diagonal as
 * well puts a brace across every bend and a diamond round every crossroads --
 * which is what the first real road art showed, plainly.
 *
 * The same test the terrain blend uses for a genuine corner poke, and for the
 * same reason.
 */
export function roadLinks(
  isRoad: (x: number, y: number) => boolean,
  x: number,
  y: number,
): number[] {
  const out: number[] = [];
  DIRS8.forEach(([dx, dy], d) => {
    if (!isRoad(x + dx, y + dy)) return;
    if (dx !== 0 && dy !== 0 && (isRoad(x + dx, y) || isRoad(x, y + dy))) return;
    out.push(d);
  });
  return out;
}
