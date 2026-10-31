/**
 * All network calls to the backend live here.
 * One object per backend feature, so pages import just what they need.
 *
 * ISOLATION CONTRACT: every customer-specific call carries the customerId
 * the user picked. The backend re-checks it on every request — the UI
 * never trusts itself.
 *
 * VITE_API_BASE_URL comes from the .env file (see .env.example).
 * With the Vite dev-server proxy, the default "/api" just works.
 *
 * NOTE: nothing in here ever reads or prints API keys — they only ever
 * live server-side in backend/.env.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * A tiny wrapper around fetch() that:
 *  - builds the full URL
 *  - enforces a TIMEOUT, so a slow/hung AI call can never leave the UI
 *    stuck on a spinner forever
 *  - throws a clear, human-readable error if the response is not OK
 *  - parses the JSON for us
 */
async function request(path, { timeoutMs = 30000, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(
        `The request timed out after ${Math.round(timeoutMs / 1000)} seconds. ` +
          'The AI may be busy — your message was not lost, please try again.',
      );
    }
    throw new Error('Could not reach the server. Is the backend running (npm run dev)?');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // The backend always sends { message } — surface it instead of a code.
    throw new Error(data.message || `Backend responded with ${response.status}`);
  }

  return data;
}

export function fetchJson(path, timeoutMs) {
  return request(path, { timeoutMs });
}

function postJson(path, payload, timeoutMs) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs,
  });
}

function patchJson(path, payload, timeoutMs) {
  return request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs,
  });
}

// DELETE with a body (the backend needs customerId to enforce ownership).
function deleteJson(path, payload, timeoutMs) {
  return request(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs,
  });
}

export const healthApi = {
  get: () => fetchJson('/health'),
};

/** Demo customer picker (identity in demo mode — no login system). */
export const customersApi = {
  list: () => fetchJson('/customers'),
  get: (customerId) => fetchJson(`/customers/${customerId}`),
};

/** Chat sidebar + conversation history. Always scoped by customerId. */
export const conversationsApi = {
  list: (customerId) => fetchJson(`/conversations?customerId=${customerId}`),
  messages: (customerId, conversationId) =>
    fetchJson(`/conversations/${conversationId}/messages?customerId=${customerId}`),
};

/** What the AI remembers about this customer. */
export const memoriesApi = {
  list: (customerId) => fetchJson(`/memories?customerId=${customerId}`),
  update: (memoryId, customerId, content) =>
    patchJson(`/memories/${memoryId}`, { customerId, content }),
  remove: (memoryId, customerId) => deleteJson(`/memories/${memoryId}`, { customerId }),
};

/** The customer's support tickets. */
export const ticketsApi = {
  list: (customerId, status) =>
    fetchJson(`/tickets?customerId=${customerId}${status ? `&status=${status}` : ''}`),
};

/** The AI chat pipeline (calls Gemini server-side).
 *  Longer timeout: one send = retrieval + reply + memory extraction,
 *  and each of those is allowed up to ~45s server-side. */
export const chatApi = {
  send: ({ customerId, conversationId, message }) =>
    postJson('/chat', { customerId, conversationId, message }, 90000),
};

/**
 * The EMPLOYEE dashboard API (/api/employee/*) — clearly separate from the
 * customer API above. Employees are privileged (they see all customers);
 * in a real product these calls would carry an employee session.
 */
export const employeeApi = {
  overview: () => fetchJson('/employee/overview'),
  customers: () => fetchJson('/employee/customers'),
  customer: (id) => fetchJson(`/employee/customers/${id}`),
  conversation: (id) => fetchJson(`/employee/conversations/${id}`),
  takeover: (id) => postJson(`/employee/conversations/${id}/takeover`, {}),
  handback: (id) => postJson(`/employee/conversations/${id}/handback`, {}),
  reply: (id, content) => postJson(`/employee/conversations/${id}/replies`, { content }),
  updateTicket: (id, status) => patchJson(`/employee/tickets/${id}`, { status }),
  // generate=true forces a fresh Gemini summary; otherwise the cached one
  // is returned by the server (no AI call).
  summary: (id, regenerate = false) =>
    fetchJson(`/employee/conversations/${id}/summary${regenerate ? '?regenerate=true' : ''}`, 60000),
};
