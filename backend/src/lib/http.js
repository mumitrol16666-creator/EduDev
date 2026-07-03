function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message, details = null) {
  sendJson(res, status, {
    success: false,
    error: message,
    ...(details ? { details } : {}),
  });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const err = new Error('Invalid JSON body');
    err.status = 400;
    throw err;
  }
}

function parsePath(reqUrl) {
  const url = new URL(reqUrl, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  return { url, parts };
}

module.exports = { sendJson, sendError, readJson, parsePath };
