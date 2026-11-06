// Same-network numbers for the public area: who reaches whom directly (UDP) vs only over the relay.

/**
 * net → badge number. Empty unless ≥ 2 distinct nets are listed. Mine = 1, the
 * rest by people count (desc), ties by net string. Rows without a net get none.
 */
export function netNumbers(
  rows: readonly { net?: string }[],
  selfNet: string | undefined,
): Map<string, number> {
  const count = new Map<string, number>();
  for (const { net } of rows) if (net !== undefined) count.set(net, (count.get(net) ?? 0) + 1);
  if (count.size < 2) return new Map();
  const nets = [...count.keys()].sort(
    (a, b) =>
      Number(b === selfNet) - Number(a === selfNet) ||
      count.get(b)! - count.get(a)! ||
      a.localeCompare(b),
  );
  return new Map(nets.map((n, i) => [n, i + 1]));
}
