// The ? manual: every feature of the app as one entry (title + body in i18n.ts as
// `manual.<id>.title` / `.body`, its animation in ManualScenes.tsx). Pure: list + search.
import { DICT, type Key } from '../i18n.js';

export const MANUAL_CATS = [
  'basics',
  'agents',
  'sessions',
  'people',
  'offices',
  'layout',
  'system',
] as const;
export type ManualCat = (typeof MANUAL_CATS)[number];

export interface ManualEntry {
  id: string;
  cat: ManualCat;
}

const e = (cat: ManualCat, ...ids: string[]): ManualEntry[] => ids.map((id) => ({ id, cat }));

/** In the order the list shows them. */
export const MANUAL: readonly ManualEntry[] = [
  ...e('basics', 'office', 'rooms', 'serverZones', 'roomPlates', 'map', 'theme', 'language'),
  ...e(
    'agents',
    'agentTags',
    'agentBubble',
    'family',
    'waiting',
    'effects',
    'heat',
    'pcScreens',
    'othersBubbles',
  ),
  ...e('sessions', 'transcript', 'shellOutput', 'usage', 'sessionFinder', 'codexLimits'),
  ...e('people', 'avatar', 'chat', 'peoplePanel', 'selectPc', 'lounge', 'profile', 'arcade'),
  ...e('offices', 'switcher', 'personal', 'public', 'team'),
  ...e('layout', 'editFloor', 'editFurniture', 'editBackground', 'editSave', 'importExport'),
  ...e('system', 'notifications', 'tray', 'autostart', 'updates', 'installApp', 'quit', 'tour'),
];

export const titleKey = (id: string) => `manual.${id}.title` as Key;
export const bodyKey = (id: string) => `manual.${id}.body` as Key;

/** Case, width and spacing do not matter (NFKC + lower case, runs of space = one). */
const fold = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');

/**
 * The entries matching every word of `q`, in either language (an English word finds the
 * entry in a Korean page too); title hits first. Empty query = all.
 */
export function searchManual(q: string): ManualEntry[] {
  const words = fold(q).trim().split(' ').filter(Boolean);
  if (words.length === 0) return [...MANUAL];
  const text = (id: string, part: 'title' | 'body') =>
    fold(
      Object.values(DICT)
        .map((d) => d[part === 'title' ? titleKey(id) : bodyKey(id)] ?? '')
        .join('\n'),
    );
  const hits = MANUAL.map((m) => {
    const title = text(m.id, 'title');
    const all = `${title}\n${text(m.id, 'body')}\n${fold(DICT.ko[`manual.cat.${m.cat}` as Key])}\n${fold(DICT.en[`manual.cat.${m.cat}` as Key])}`;
    if (!words.every((w) => all.includes(w))) return null;
    return { m, inTitle: words.some((w) => title.includes(w)) };
  }).filter((h) => h !== null);
  return [...hits.filter((h) => h.inTitle), ...hits.filter((h) => !h.inTitle)].map((h) => h.m);
}
