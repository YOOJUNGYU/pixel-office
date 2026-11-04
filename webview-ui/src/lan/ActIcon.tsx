import { type IconId, ICONS } from './actIcons.js';

/** One rect per horizontal run of '#'. */
const runs = (rows: readonly string[]) =>
  rows.flatMap((row, y) =>
    [...row.matchAll(/#+/g)].map((m) => ({ x: m.index, y, w: m[0].length })),
  );

export function ActIcon({ icon, size, color }: { icon: IconId; size: number; color?: string }) {
  return (
    <svg
      data-icon={icon}
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className="shrink-0 block"
      style={{ color }}
      aria-hidden="true"
    >
      {runs(ICONS[icon]).map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}
