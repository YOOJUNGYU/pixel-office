// Smoke test against a running relay: node scripts/smoke.mjs ws://127.0.0.1:8787/ws
// A and B join, A sends B one fake pub, B must receive it; C with A's id but another pk gets 4024.
const base = process.argv[2];
if (!base) {
  console.error('usage: node scripts/smoke.mjs <wsUrl>');
  process.exit(2);
}
const PK_A = 'A'.repeat(42) + 'A=';
const PK_B = 'B'.repeat(42) + 'A=';
const PK_C = 'C'.repeat(42) + 'A=';
const tag = Date.now().toString(36);
const A = `smokeA-${tag}`;
const B = `smokeB-${tag}`;

const open = (id, pk) => new WebSocket(`${base}?id=${id}&pk=${encodeURIComponent(pk)}&v=smoke`);
const fail = (why) => {
  console.error(`FAIL: ${why}`);
  process.exit(1);
};
setTimeout(() => fail('timeout (3 s)'), 3000);

const opened = (ws) =>
  new Promise((res, rej) => {
    ws.onopen = res;
    ws.onclose = (e) => rej(new Error(`closed ${e.code} ${e.reason}`));
    ws.onerror = () => rej(new Error('error'));
  });

try {
  const b = open(B, PK_B);
  await opened(b);
  const got = new Promise((res) => {
    b.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'w') res(m);
    };
  });
  const a = open(A, PK_A);
  await opened(a);
  a.send(
    JSON.stringify({ t: 'send', w: [{ v: 2, t: 'pub', from: A, to: B, n: 'AAAA', c: 'AAAA' }] }),
  );
  const m = await got;
  if (m.w[0]?.from !== A) fail(`wrong wire ${JSON.stringify(m)}`);

  const c = open(A, PK_C);
  const code = await new Promise((res) => (c.onclose = (e) => res(e.code)));
  if (code !== 4024) fail(`same id + other pk closed with ${code}, expected 4024`);
  a.close();
  b.close();
  console.log('OK');
  process.exit(0);
} catch (e) {
  fail(e.message);
}
