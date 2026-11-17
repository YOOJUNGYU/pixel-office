import assert from 'node:assert/strict';

import { test } from 'vitest';

import { parseOutfit } from '../../core/src/lan.js';
import type { ProfileMessage } from '../../core/src/messages.js';
import { sameProfile } from '../src/lan/profileEcho.js';

const base: ProfileMessage = { nickname: '', palette: 0, hueShift: 0, manualPeers: [] };

test("an outfit saved in click order matches the server's normalized echo", () => {
  // The editor: shoes picked before hair, a colour in upper case, an emptied colours map.
  const sent = {
    ...base,
    outfit: {
      body: 'flat',
      parts: { shoes: 'sneakers', hair: 'short' },
      // eslint-disable-next-line pixel-agents/no-inline-colors -- a received colour, upper case
      colors: { hair: '#AA3300' },
      eyes: 'plain',
    },
  } as ProfileMessage;
  const echo = { ...base, outfit: parseOutfit(sent.outfit) } as ProfileMessage;
  assert.notEqual(JSON.stringify(sent.outfit), JSON.stringify(echo.outfit)); // the old check failed here
  assert.equal(sameProfile(echo, sent), true);
  // A real difference still counts as rejected.
  const other = { ...base, outfit: { body: 'flat', parts: { hair: 'long' } } } as ProfileMessage;
  assert.equal(sameProfile(echo, other), false);
});
