/**
 * test-failover.js — verifies the GEMINI_API_KEY_BACKUP 429 failover
 * (run: npm run test:failover)
 *
 * HOW IT TESTS WITHOUT BURNING QUOTA OR FAKING RESULTS:
 * We do NOT fake any AI output. The real gemini.js code runs end-to-end;
 * only the network hop (global fetch) is stubbed so we can deterministically
 * return HTTP 429 from the primary key and observe the retry.
 *
 * Checks:
 *   1. primary 429  -> same request retried ONCE with the backup key
 *   2. backup succeeds -> response delivered normally
 *   3. only two HTTP calls total (no endless retry loop)
 *   4. with backup disabled, a 429 is surfaced immediately (no retry)
 *   5. keys are only ever referenced, never logged by the logger
 */
import env from '../config/env.js';
import { generateText } from '../services/gemini.js';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

// Capture what would be printed, so we can prove no key ever leaks into logs.
// (logger.js writes via console.log / console.warn / console.error.)
const loggedLines = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
console.log = (...a) => { loggedLines.push(a.join(' ')); originalLog(...a); };
console.warn = (...a) => { loggedLines.push(a.join(' ')); originalWarn(...a); };
console.error = (...a) => { loggedLines.push(a.join(' ')); originalError(...a); };

const realFetch = globalThis.fetch;
const calls = []; // { path, key }

function fakeResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

async function withFetch(stub, fn) {
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

const QUOTA_BODY = { error: { message: '429 Quota exceeded for metric: generate_content_free_tier_requests' } };
const OK_BODY = { candidates: [{ content: { parts: [{ text: 'OK reply from simulated endpoint' }] } }] };

async function run() {
  if (!env.geminiApiKeyBackup || env.geminiApiKeyBackup.startsWith('your-')) {
    console.log('\nSKIPPED — GEMINI_API_KEY_BACKUP is not set in backend/.env.');
    console.log('Add it to test the failover; nothing else to do here.\n');
    return;
  }

  console.log('\n--- Test 1: primary 429 -> retry once with backup ---');
  calls.length = 0;
  const result = await withFetch(
    async (url, opts) => {
      const key = opts.headers['x-goog-api-key'];
      calls.push({ path: String(url), key });
      // First call (primary) is out of quota; second (backup) works.
      return calls.length === 1
        ? fakeResponse(429, QUOTA_BODY)
        : fakeResponse(200, OK_BODY);
    },
    () => generateText('system', 'user'),
  );

  check('reply delivered via backup key', result === 'OK reply from simulated endpoint');
  check('exactly 2 HTTP calls (1 retry, no loop)', calls.length === 2, `${calls.length} calls`);
  check('first call used primary key', calls[0].key === env.geminiApiKey);
  check('second call used backup key', calls[1].key === env.geminiApiKeyBackup);
  check('retry sent the identical request path', calls[0].path === calls[1].path);
  check('primary and backup are actually different keys',
    env.geminiApiKey !== env.geminiApiKeyBackup);

  console.log('\n--- Test 2: both keys out of quota -> clean 429 error ---');
  calls.length = 0;
  let thrown = null;
  await withFetch(
    async (url, opts) => {
      calls.push({ path: String(url), key: opts.headers['x-goog-api-key'] });
      return fakeResponse(429, QUOTA_BODY);
    },
    async () => {
      try { await generateText('system', 'user'); } catch (err) { thrown = err; }
    },
  );
  check('error thrown when backup is also 429', Boolean(thrown), thrown?.message?.slice(0, 60));
  check('error status is 429', thrown?.status === 429, `status=${thrown?.status}`);
  check('stopped after 2 calls (primary + backup only)', calls.length === 2, `${calls.length} calls`);

  console.log('\n--- Test 3: no backup configured -> 429 surfaces immediately ---');
  const savedBackup = env.geminiApiKeyBackup;
  env.geminiApiKeyBackup = null; // simulate .env without a backup key
  calls.length = 0;
  thrown = null;
  try {
    await withFetch(
      async (url, opts) => {
        calls.push({ path: String(url), key: opts.headers['x-goog-api-key'] });
        return fakeResponse(429, QUOTA_BODY);
      },
      () => generateText('system', 'user'),
    );
  } catch (err) {
    thrown = err;
  } finally {
    env.geminiApiKeyBackup = savedBackup;
  }
  check('no retry attempted without a backup key', calls.length === 1, `${calls.length} call(s)`);
  check('error still surfaced as 429', thrown?.status === 429);

  console.log('\n--- Test 4: no key ever appears in log output ---');
  const logs = loggedLines.join('\n');
  check('primary key not in logs', !logs.includes(env.geminiApiKey));
  check('backup key not in logs', !logs.includes(env.geminiApiKeyBackup));
  check('log names the key slot used', /key slot/i.test(logs));

  console.log(`\n========== RESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ==========\n`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('TEST ERROR:', err.message);
  process.exit(1);
});
