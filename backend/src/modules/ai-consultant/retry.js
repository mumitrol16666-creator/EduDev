async function withRetry(fn, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 2));
  const delayMs = Math.max(0, Number(options.delayMs || 100));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await fn(attempt);
      return { ok: true, attempts: attempt, result };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  return {
    ok: false,
    attempts,
    error: lastError?.message || 'Unknown retry failure',
    details: lastError?.details || null,
  };
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withRetry };
