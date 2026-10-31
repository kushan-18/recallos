/**
 * ============================================================================
 * gemini.js — our single wrapper around the Gemini REST API.
 * ============================================================================
 * Why raw fetch instead of an SDK? One file, no extra dependency,
 * and you can see exactly what gets sent. Two capabilities live here:
 *
 *   generateText()  -> chat replies + memory extraction (JSON)
 *   embedText()     -> turns text into a 3072-number vector
 *                      (vectors power semantic search: "dropping out"
 *                       can still match a memory that says "disconnecting")
 *
 * QUOTA FAILOVER: Gemini's free tier allows a limited number of generation
 * calls per day. If the PRIMARY key returns HTTP 429 (quota exceeded), the
 * SAME request is retried exactly once with the optional BACKUP key
 * (GEMINI_API_KEY_BACKUP). We log which key SLOT was used — 'primary' or
 * 'backup' — never the key itself.
 *
 * Keys and model names come from .env — never hardcoded, never printed.
 * ============================================================================
 */
import env from '../config/env.js';
import logger from '../utils/logger.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Safety timeout: if Gemini hangs (e.g. model under high demand),
 * we abort instead of leaving the customer staring at a spinner.
 * 45s is generous — normal replies take 2–8s.
 */
const REQUEST_TIMEOUT_MS = 45000;

/** A key counts as usable only if it exists and is not the template value. */
function isUsable(key) {
  return Boolean(key) && !key.startsWith('your-');
}

/**
 * Ordered key slots for this request: primary first,
 * then backup (if configured). Returns [{ slot, key }, ...].
 */
function keySlots() {
  const slots = [];
  if (isUsable(env.geminiApiKey)) slots.push({ slot: 'primary', key: env.geminiApiKey });
  if (isUsable(env.geminiApiKeyBackup)) slots.push({ slot: 'backup', key: env.geminiApiKeyBackup });
  return slots;
}

/** Fails fast with a clear message if no key is configured. */
function requireKey() {
  if (keySlots().length === 0) {
    const err = new Error(
      'GEMINI_API_KEY is not configured. Put your real key in backend/.env (see .env.example).',
    );
    err.status = 503;
    throw err;
  }
}

/**
 * One POST to a Gemini endpoint, with 429 failover.
 *
 * @param {string} path        e.g. 'models/gemini-3.5-flash:generateContent'
 * @param {object} body        JSON payload (built once — the retry sends the SAME body)
 * @param {object} opts
 * @param {'generate'|'embed'} opts.kind   - picks error wording + log labels
 * @param {string} opts.timeoutMessage     - friendly text when we abort on timeout
 * @returns {Promise<object>} parsed JSON response
 */
async function postJson(path, body, { kind, timeoutMessage }) {
  const slots = keySlots();
  const errorPrefix = kind === 'embed' ? 'Embedding API error' : 'Gemini API error';

  for (let i = 0; i < slots.length; i++) {
    const { slot, key } = slots[i];

    let res;
    try {
      res = await fetch(`${API_BASE}/${path}`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Network/timeout problems are NOT a quota problem — no point
      // switching keys (they would hit the same network path).
      const e = new Error(
        err.name === 'TimeoutError'
          ? timeoutMessage
          : `Could not reach the Gemini API: ${err.message}`,
      );
      e.status = 504;
      throw e;
    }

    // 429 quota exceeded on this slot → retry the same call once with the next slot.
    if (res.status === 429 && i < slots.length - 1) {
      logger.warn(
        `${errorPrefix} 429 (quota exceeded) on key slot "${slot}" — retrying same call with backup key slot`,
      );
      continue;
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const e = new Error(`${errorPrefix} ${res.status}: ${errorBody.error?.message || 'unknown error'}`);
      e.status = res.status === 429 ? 429 : 502;
      logger.warn(`${errorPrefix} ${res.status} on key slot "${slot}" — giving up`);
      throw e;
    }

    logger.info(`${kind === 'embed' ? 'Embedding' : 'Generation'} call OK — key slot used: "${slot}"`);
    return res.json();
  }

  // Unreachable in practice (requireKey() ran first) — kept as a safety net.
  const e = new Error('No usable Gemini API key is configured.');
  e.status = 503;
  throw e;
}

/**
 * Ask Gemini to complete a prompt.
 * @param {string} systemPrompt - rules for the model (never invent facts, etc.)
 * @param {string} userText - the actual content to process
 * @param {object} [opts]
 * @param {boolean} [opts.json=false] - ask for strict JSON output
 * @returns {Promise<string>} the model's text reply
 */
export async function generateText(systemPrompt, userText, { json = false } = {}) {
  requireKey();

  const data = await postJson(
    `models/${env.geminiModel}:generateContent`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.2, // low = consistent, factual answers
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    },
    {
      kind: 'generate',
      timeoutMessage:
        'The AI model did not respond in time (it may be under high demand). Please try again.',
    },
  );

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

  if (!text) {
    const err = new Error('Gemini returned an empty response.');
    err.status = 502;
    throw err;
  }
  return text;
}

/**
 * Like generateText(), but parses the reply as JSON and
 * defends against occasional ```json fences around the output.
 */
export async function generateJson(systemPrompt, userText) {
  const raw = await generateText(systemPrompt, userText, { json: true });
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    return JSON.parse(cleaned);
  }
}

/**
 * Turn a piece of text into an embedding vector (number[]).
 * Length is controlled by EMBEDDING_DIM in .env (3072 for
 * gemini-embedding-001) so it always matches our Atlas index.
 */
export async function embedText(text) {
  requireKey();

  const data = await postJson(
    `models/${env.geminiEmbeddingModel}:embedContent`,
    {
      model: `models/${env.geminiEmbeddingModel}`,
      content: { parts: [{ text }] },
      outputDimensionality: env.embeddingDim,
    },
    {
      kind: 'embed',
      timeoutMessage: 'The embedding service did not respond in time. Please try again.',
    },
  );

  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    const err = new Error('Embedding API returned no values.');
    err.status = 502;
    throw err;
  }
  return values;
}
