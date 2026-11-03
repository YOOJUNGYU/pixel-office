import type { Character } from '../types.js';

/** One of my characters is outlined only while its transcript is open; an open agent
 *  folded into the lounge (no character) lights up my avatar instead. */
export function ownOutlined(
  ch: Character,
  characters: Character[],
  open: ReadonlySet<number>,
): boolean {
  if (open.size === 0) return false;
  if (open.has(ch.id)) return true;
  if (ch.avatarOf === undefined) return false;
  const shown = new Set(characters.map((c) => c.id));
  return [...open].some((id) => !shown.has(id));
}
