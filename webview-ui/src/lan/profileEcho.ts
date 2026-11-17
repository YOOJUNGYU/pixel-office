// Whether the server's profileLoaded echoes what this page saved (else the save was rejected).
import { parseOutfit } from '../../../core/src/lan.js';
import type { ProfileMessage } from '../../../core/src/messages.js';

/** An outfit as the server stores it: its own key order (slots, colour keys), colours lower
 *  case, empty parts/colours dropped — the editor's object follows click order instead. */
const outfitKey = (o: ProfileMessage['outfit']): string => JSON.stringify(parseOutfit(o) ?? null);

/** The server echoes the saved profile; anything else means the save was rejected. */
export const sameProfile = (a: ProfileMessage, b: ProfileMessage): boolean =>
  a.nickname === b.nickname &&
  a.palette === b.palette &&
  a.hueShift === b.hueShift &&
  a.pet === b.pet &&
  outfitKey(a.outfit) === outfitKey(b.outfit) &&
  a.manualPeers.join('\n') === b.manualPeers.join('\n');
