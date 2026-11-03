import type { Character } from '../types.js';

/** One of my characters is outlined only while its transcript is open; an agent folded
 *  into the lounge (no character) lights up my avatar instead. */
export function ownOutlined(
  ch: Character,
  characters: Character[],
  transcriptCharId: number | null,
): boolean {
  if (transcriptCharId === null) return false;
  if (ch.id === transcriptCharId) return true;
  return ch.avatarOf !== undefined && !characters.some((c) => c.id === transcriptCharId);
}
