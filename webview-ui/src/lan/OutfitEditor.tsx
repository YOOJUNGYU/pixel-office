// The profile's wardrobe: one tab per slot (pixel-agents' TABS), each a row of part thumbnails
// (None first where a slot may be empty) and the colour squares of the worn part (its
// category palette, else the shared swatches). Edits a core Outfit (part ids + '#rrggbb').
import { useEffect, useState } from 'react';

import type { Outfit, OutfitColorKey, OutfitSlot } from '../../../core/src/lan.js';
import { SWATCHES } from '../characters/art/artColors.js';
import { onWardrobe, outfitProfile, wardrobeRenderer } from '../characters/outfit.js';
import { ACCESSORIES, colorArt, type ColorKey, EYE_SHAPES, TABS } from '../characters/slots.js';
import {
  OUTFIT_EYES_CROP,
  OUTFIT_EYES_SCALE,
  OUTFIT_THUMB_CROP,
  OUTFIT_THUMB_SCALE,
} from '../constants.js';
import { type Key, t, useLang } from '../i18n.js';
import { CharacterPreview } from './ProfileModal.js';

/** Slots that may be left empty (a None thumbnail first). */
const OPTIONAL = new Set<string>(['beard', 'top', 'jacket', 'pants', 'shoes', 'full', 'hat']);

/** Re-render once the wardrobe has loaded. */
function useWardrobe() {
  const [, setTick] = useState(0);
  useEffect(() => onWardrobe(() => setTick((n) => n + 1)), []);
  return wardrobeRenderer();
}

/** `o` with `slot` set to `id` (undefined = taken off). An outfit replaces top and pants; a top
 *  or pants replaces the outfit. */
function wear(o: Outfit, slot: OutfitSlot, id: string | undefined): Outfit {
  const parts = { ...o.parts };
  if (id) parts[slot] = id;
  else delete parts[slot];
  if (id && slot === 'full') {
    delete parts.top;
    delete parts.pants;
  }
  if (id && (slot === 'top' || slot === 'pants')) delete parts.full;
  return { ...o, parts };
}

function paint(o: Outfit, key: OutfitColorKey, hex: string): Outfit {
  return { ...o, colors: { ...o.colors, [key]: hex.toLowerCase() } };
}

type TabKey = (typeof TABS)[number]['key'];

export function OutfitEditor({ outfit, onChange }: { outfit: Outfit; onChange(o: Outfit): void }) {
  useLang();
  const r = useWardrobe();
  const [tab, setTab] = useState<TabKey>('hair');
  if (!r) return <div className="text-xs text-text-muted">{t('outfit.loading')}</div>;
  const parts = r.wardrobe.manifest.parts;
  const profile = outfitProfile(r, outfit);

  /** A row of part thumbnails for one slot (or the body). */
  const partRow = (slot: OutfitSlot | 'body', optional: boolean) => {
    const ids = parts[slot]?.map((p) => p.id) ?? [];
    const current = slot === 'body' ? outfit.body : outfit.parts?.[slot];
    const options: (string | undefined)[] = [...(optional ? [undefined] : []), ...ids];
    return (
      <div className="flex gap-4 flex-wrap" data-outfit-parts={slot}>
        {options.map((id) => {
          const next: Outfit =
            slot === 'body' ? { ...outfit, body: id ?? outfit.body } : wear(outfit, slot, id);
          const label = id
            ? (parts[slot]?.find((p) => p.id === id)?.label ?? id)
            : t('outfit.none');
          return (
            <button
              key={id ?? 'none'}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={current === id}
              onClick={() => onChange(next)}
              className={`p-2 rounded-none cursor-pointer bg-bg-dark border-2 ${current === id ? 'border-accent-bright' : 'border-border'}`}
            >
              <CharacterPreview
                palette={0}
                hueShift={0}
                outfit={next}
                scale={OUTFIT_THUMB_SCALE}
                crop={OUTFIT_THUMB_CROP}
              />
            </button>
          );
        })}
      </div>
    );
  };

  /** The colour squares for a colour key, when something wears it. */
  const colorRow = (key: ColorKey & OutfitColorKey) => {
    const art = colorArt(profile, key);
    if (!art) return null;
    const pal = r.paletteFor(art);
    const squares =
      pal?.squares ??
      (key === 'eyes' || key === 'lashes' ? SWATCHES[key] : SWATCHES.default).map((hex) => ({
        label: hex,
        hex,
      }));
    const current = outfit.colors?.[key];
    return (
      <div className="flex gap-2 flex-wrap" data-outfit-colors={key}>
        {squares.map((sq) => (
          <button
            key={sq.hex}
            type="button"
            title={sq.label}
            aria-label={sq.label}
            aria-pressed={current === sq.hex.toLowerCase()}
            onClick={() => onChange(paint(outfit, key, sq.hex))}
            className={`w-16 h-16 rounded-none cursor-pointer border-2 ${current === sq.hex.toLowerCase() ? 'border-accent-bright' : 'border-border'}`}
            style={{ background: sq.hex }}
          />
        ))}
      </div>
    );
  };

  const def = TABS.find((x) => x.key === tab)!;
  return (
    <div className="flex flex-col gap-6" data-outfit-editor>
      <div className="flex gap-2 flex-wrap" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={x.key === tab}
            onClick={() => setTab(x.key)}
            className={`border-2 rounded-none px-6 py-1 text-xs cursor-pointer ${x.key === tab ? 'bg-active-bg border-accent' : 'bg-btn-bg border-transparent hover:bg-btn-hover'}`}
          >
            {t(`outfit.tab.${x.key}` as Key)}
          </button>
        ))}
      </div>
      {tab === 'eyes' ? (
        <div className="flex gap-4 flex-wrap" data-outfit-parts="eyes">
          {EYE_SHAPES.map((s) => {
            const next = { ...outfit, eyes: s.id };
            const on = (outfit.eyes ?? profile.eyeShape) === s.id;
            return (
              <button
                key={s.id}
                type="button"
                title={s.label}
                aria-pressed={on}
                onClick={() => onChange(next)}
                className={`p-2 rounded-none cursor-pointer bg-bg-dark border-2 ${on ? 'border-accent-bright' : 'border-border'}`}
              >
                <CharacterPreview
                  palette={0}
                  hueShift={0}
                  outfit={next}
                  scale={OUTFIT_EYES_SCALE}
                  crop={OUTFIT_EYES_CROP}
                />
              </button>
            );
          })}
        </div>
      ) : tab === 'acc' ? (
        ACCESSORIES.map((acc) => (
          <div key={acc.key} className="flex flex-col gap-2">
            <div className="text-xs text-text-muted">{t(`outfit.acc.${acc.key}` as Key)}</div>
            {partRow(acc.key, true)}
            {colorRow(acc.key)}
          </div>
        ))
      ) : (
        <>
          {partRow(def.key === 'body' ? 'body' : (def.key as OutfitSlot), OPTIONAL.has(def.key))}
          {def.pickers.map((pk) => {
            // Only while something wears that colour (an outfit's tie: one with a tie).
            const row = colorRow(pk.key as ColorKey & OutfitColorKey);
            return (
              row && (
                <div key={pk.key} className="flex flex-col gap-2">
                  {def.pickers.length > 1 && (
                    <div className="text-xs text-text-muted">
                      {t(`outfit.color.${pk.key}` as Key)}
                    </div>
                  )}
                  {row}
                </div>
              )
            );
          })}
          {def.inner && (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-text-muted">{t(`outfit.tab.${def.inner}` as Key)}</div>
              {partRow(def.inner as OutfitSlot, true)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
