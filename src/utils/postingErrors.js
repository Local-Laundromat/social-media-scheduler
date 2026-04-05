/**
 * Structured errors for social posting — logs + DB error_message JSON.
 */

/**
 * Normalize axios errors from graph.facebook.com (and similar).
 * @param {Error} error
 * @returns {{ message: string, code?: number, error_subcode?: number, type?: string, fbtrace_id?: string, httpStatus?: number, isNetwork: boolean }}
 */
function normalizeAxiosGraphError(error) {
  const res = error.response;
  const graph = res?.data?.error;
  const msg =
    graph?.message ||
    res?.data?.error_message ||
    error.message ||
    String(error);

  return {
    message: msg,
    code: graph?.code,
    error_subcode: graph?.error_subcode,
    type: graph?.type,
    fbtrace_id: graph?.fbtrace_id,
    httpStatus: res?.status,
    isNetwork: !res && !!error.request,
  };
}

/**
 * Safe one-line log detail (no tokens).
 */
function logPostPipeline(postId, label, detail = {}) {
  const line = { ...detail };
  if (line.pageId) line.pageId = String(line.pageId).slice(0, 8) + '…';
  console.log(`[post:${postId}] ${label}`, JSON.stringify(line));
}

/**
 * Build JSON string for posts.error_message (structured).
 */
function stringifyPostingFailure(payload) {
  try {
    return JSON.stringify(payload, null, 0);
  } catch (_) {
    return JSON.stringify({ error: String(payload) });
  }
}

module.exports = {
  normalizeAxiosGraphError,
  logPostPipeline,
  stringifyPostingFailure,
};
