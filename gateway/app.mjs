import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  extractRefusal,
  extractResponseText,
  isLocalDate,
  postprocessDraft,
  schemaForOpenAI,
  validateDraft,
} from '../tools/proposal-eval/lib.mjs';

const [prompt, schema] = await Promise.all([
  readFile(new URL('../tools/proposal-eval/prompt.md', import.meta.url), 'utf8'),
  readFile(new URL('../tools/proposal-eval/cloud-proposal-schema.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const captureSources = new Set(['webText', 'voice', 'email', 'feishu', 'calendar', 'shareExtension', 'mobileShortcut']);

function safeJson(res, status, body, origin) {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function failure(code, message, retryable) {
  return { status: 'failure', error: { code, message, retryable } };
}

function validTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateGatewayRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, message: '请求必须是对象。' };
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'capture,context,schemaVersion' || value.schemaVersion !== 1) return { valid: false, message: '请求版本或字段无效。' };
  const capture = value.capture;
  const context = value.context;
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)
    || Object.keys(capture).sort().join(',') !== 'rawText,source'
    || typeof capture.rawText !== 'string'
    || !capture.rawText.trim()
    || capture.rawText.length > 1_000
    || !captureSources.has(capture.source)) {
    return { valid: false, message: 'Capture 字段无效。' };
  }
  if (!context || typeof context !== 'object' || Array.isArray(context)
    || Object.keys(context).sort().join(',') !== 'locale,referenceDate,timeZone'
    || !isLocalDate(context.referenceDate)
    || !validTimeZone(context.timeZone)
    || context.locale !== 'zh-CN') {
    return { valid: false, message: 'Context 字段无效。' };
  }
  return {
    valid: true,
    value: {
      schemaVersion: 1,
      capture: { rawText: capture.rawText.trim(), source: capture.source },
      context: {
        referenceDate: context.referenceDate,
        timeZone: context.timeZone,
        locale: context.locale,
      },
    },
  };
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('body_too_large');
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeUpstreamFailure(status) {
  if (status === 429) return { status: 429, body: failure('proposal_rate_limited', '云端模型请求较多，请稍后重试。', true) };
  if (status === 408 || status === 504) return { status: 504, body: failure('proposal_timeout', '云端模型响应超时。', true) };
  return { status: 503, body: failure('proposal_unavailable', '云端模型暂时不可用。', true) };
}

export function createGatewayHandler({ config, fetchImpl = fetch, logger = console }) {
  const allowedOrigins = new Set(config.allowedOrigins);
  return async function gatewayHandler(req, res) {
    const requestId = randomUUID();
    const started = performance.now();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : '';
    let resultStatus = 'unknown';
    try {
      if (origin && !allowedOrigin) {
        resultStatus = 'origin_rejected';
        safeJson(res, 403, failure('proposal_unavailable', '请求来源不受允许。', false));
        return;
      }
      if (req.method === 'OPTIONS') {
        if (allowedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }
        res.statusCode = 204;
        res.end();
        resultStatus = 'preflight';
        return;
      }
      if (req.url === '/health' && req.method === 'GET') {
        safeJson(res, 200, { status: 'ok', aiEnabled: config.enabled }, allowedOrigin);
        resultStatus = 'health';
        return;
      }
      if (req.url !== '/v1/proposals') {
        safeJson(res, 404, failure('proposal_unavailable', '接口不存在。', false), allowedOrigin);
        resultStatus = 'not_found';
        return;
      }
      if (req.method !== 'POST') {
        safeJson(res, 405, failure('proposal_unavailable', '仅支持 POST 请求。', false), allowedOrigin);
        resultStatus = 'method_rejected';
        return;
      }
      if (!String(req.headers['content-type'] ?? '').toLowerCase().includes('application/json')) {
        safeJson(res, 415, failure('invalid_proposal', '请求必须使用 application/json。', false), allowedOrigin);
        resultStatus = 'content_type_rejected';
        return;
      }
      if (!config.enabled) {
        safeJson(res, 503, failure('proposal_unavailable', '云端整理当前已关闭。', true), allowedOrigin);
        resultStatus = 'disabled';
        return;
      }
      if (!config.apiKey) {
        safeJson(res, 503, failure('proposal_unavailable', '本地 Gateway 尚未配置模型密钥。', true), allowedOrigin);
        resultStatus = 'missing_key';
        return;
      }

      let rawBody;
      try {
        rawBody = await readBody(req, config.maxBodyBytes);
      } catch (error) {
        if (error?.code === 'BODY_TOO_LARGE') {
          safeJson(res, 413, failure('invalid_proposal', '请求正文过大。', false), allowedOrigin);
          resultStatus = 'body_too_large';
          return;
        }
        throw error;
      }
      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        safeJson(res, 400, failure('invalid_proposal', '请求 JSON 无效。', false), allowedOrigin);
        resultStatus = 'invalid_json';
        return;
      }
      const validatedRequest = validateGatewayRequest(parsedBody);
      if (!validatedRequest.valid) {
        safeJson(res, 400, failure('invalid_proposal', validatedRequest.message, false), allowedOrigin);
        resultStatus = 'invalid_request';
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
      let upstream;
      try {
        upstream = await fetchImpl(config.responsesUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            store: false,
            reasoning: { effort: config.reasoningEffort },
            max_output_tokens: config.maxOutputTokens,
            input: [
              { role: 'developer', content: prompt },
              {
                role: 'user',
                content: JSON.stringify({
                  referenceDate: validatedRequest.value.context.referenceDate,
                  timeZone: validatedRequest.value.context.timeZone,
                  locale: validatedRequest.value.context.locale,
                  capture: validatedRequest.value.capture,
                }),
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'reflow_cloud_proposal_draft',
                strict: true,
                schema: schemaForOpenAI(schema),
              },
            },
          }),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          safeJson(res, 504, failure('proposal_timeout', '云端模型响应超时。', true), allowedOrigin);
          resultStatus = 'timeout';
          return;
        }
        safeJson(res, 503, failure('proposal_unavailable', '云端模型暂时不可用。', true), allowedOrigin);
        resultStatus = 'network_error';
        return;
      } finally {
        clearTimeout(timeout);
      }

      const upstreamBody = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        const mapped = safeUpstreamFailure(upstream.status);
        safeJson(res, mapped.status, mapped.body, allowedOrigin);
        resultStatus = `upstream_${upstream.status}`;
        return;
      }
      const refusal = extractRefusal(upstreamBody);
      if (refusal) {
        safeJson(res, 422, failure('proposal_refused', '模型无法整理这条输入，请修改内容或使用本地规则。', false), allowedOrigin);
        resultStatus = 'refused';
        return;
      }
      let draft;
      try {
        draft = JSON.parse(extractResponseText(upstreamBody));
      } catch {
        safeJson(res, 502, failure('invalid_proposal', '模型返回的建议格式无效。', true), allowedOrigin);
        resultStatus = 'invalid_json_output';
        return;
      }
      draft = postprocessDraft(draft, {
        rawText: validatedRequest.value.capture.rawText,
        referenceDate: validatedRequest.value.context.referenceDate,
      });
      const validation = validateDraft(draft);
      if (!validation.valid) {
        safeJson(res, 502, failure('invalid_proposal', '模型返回的建议未通过安全校验。', true), allowedOrigin);
        resultStatus = 'invalid_output';
        return;
      }
      safeJson(res, 200, { status: 'success', schemaVersion: 1, draft }, allowedOrigin);
      resultStatus = 'success';
    } catch {
      if (!res.headersSent) safeJson(res, 500, failure('proposal_unavailable', '本地 Gateway 处理失败。', true), allowedOrigin);
      else res.end();
      resultStatus = 'internal_error';
    } finally {
      logger.info?.({
        event: 'proposal_request',
        requestId,
        status: resultStatus,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  };
}
