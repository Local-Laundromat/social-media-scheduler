/**
 * Runs supabase.auth.getUser(jwt) with a deadline so stalled Supabase Auth
 * does not leave API requests pending forever from the browser.
 */

function jwtVerifyTimeoutMs() {
  const n = Number.parseInt(process.env.SUPABASE_AUTH_TIMEOUT_MS ?? '12000', 10);
  return Number.isFinite(n) && n > 500 ? n : 12000;
}

/**
 * @returns Promise resolving to the same shape as supabase.auth.getUser(jwt)
 */
async function verifySupabaseJwt(supabaseAuthClient, jwt) {
  const ms = jwtVerifyTimeoutMs();
  let timeoutId;

  const timeoutReject = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('SUPABASE_AUTH_TIMEOUT')), ms);
  });

  try {
    return await Promise.race([
      supabaseAuthClient.auth.getUser(jwt).finally(() => clearTimeout(timeoutId)),
      timeoutReject
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { verifySupabaseJwt, jwtVerifyTimeoutMs };
