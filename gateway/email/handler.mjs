import { performance } from 'node:perf_hooks';

import { UstcEmailError, emailError, serializeEmailError } from './errors.mjs';

function safeJson(res, statusCode, body, origin = '') {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

function uidFromPath(pathname) {
  const match = /^\/messages\/([^/]+)$/.exec(pathname);
  if (!match) return undefined;
  let raw;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    throw emailError('message_not_found');
  }
  const uid = Number(raw);
  if (!Number.isSafeInteger(uid) || uid <= 0 || String(uid) !== raw) throw emailError('message_not_found');
  return uid;
}

export function createEmailHandler({ config, adapter, logger = console }) {
  const allowedOrigins = new Set(config.allowedOrigins);
  return async function emailHandler(req, res) {
    const started = performance.now();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : '';
    let resultStatus = 'unknown';
    try {
      if (origin && !allowedOrigin) {
        const failure = serializeEmailError(emailError('email_unavailable'));
        safeJson(res, 403, { ...failure.body, error: { ...failure.body.error, retryable: false } });
        resultStatus = 'origin_rejected';
        return;
      }
      if (req.method === 'OPTIONS') {
        if (allowedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        }
        res.statusCode = 204;
        res.end();
        resultStatus = 'preflight';
        return;
      }
      if (req.method !== 'GET') throw emailError('message_not_found');

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.search) throw emailError('message_not_found');
      if (url.pathname === '/messages') {
        safeJson(res, 200, { status: 'success', messages: await adapter.listRecent() }, allowedOrigin);
        resultStatus = 'list';
        return;
      }
      const uid = uidFromPath(url.pathname);
      if (uid !== undefined) {
        safeJson(res, 200, { status: 'success', message: await adapter.getDetail(uid) }, allowedOrigin);
        resultStatus = 'detail';
        return;
      }
      throw emailError('message_not_found');
    } catch (error) {
      const failure = serializeEmailError(error);
      if (!res.headersSent) safeJson(res, failure.statusCode, failure.body, allowedOrigin);
      else res.end();
      resultStatus = error instanceof UstcEmailError ? error.code : 'email_unavailable';
    } finally {
      logger.info?.({
        event: 'email_request',
        status: resultStatus,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  };
}
