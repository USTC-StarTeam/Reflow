import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import {
  CATEGORIES,
  extractRefusal,
  extractResponseText,
  isLocalDate,
  isPlainObject,
  schemaForOpenAI,
} from '../tools/proposal-eval/lib.mjs';
import { failure, readBody, safeJson, safeUpstreamFailure, validTimeZone } from './app.mjs';

export const REVIEW_PROPOSALS_PATH = '/v1/review-proposals';

const SCHEMA_VERSION = 1;
const MAX_SUGGESTIONS = 2;
const MAX_FACT_IDS = 3;
const FACT_IDS = new Set([
  'plannedCount',
  'completedAsPlannedCount',
  'completedTotalCount',
  'recordedMinutes',
  'interruptions',
  'categoryMinutes',
  'recordsComplete',
]);
const SNAPSHOT_KEYS = 'categoryMinutes,completedAsPlannedCount,completedTotalCount,date,interruptions,plannedCount,recordedMinutes,recordsComplete,timeZone';
// 指标数字一律由程序从快照渲染，模型给出的文本里出现数字即视为越界。
const NUMERIC_PATTERN = /[0-9０-９%％]/u;
const internalTermPattern = /\b(?:DailyReviewSnapshot|ReviewSuggestionDraft|ReviewFactId|factIds|recordedMinutes|categoryMinutes|recordsComplete|JSON\s*Schema)\b/i;

const [prompt, schema] = await Promise.all([
  readFile(new URL('./review-prompt.md', import.meta.url), 'utf8'),
  readFile(new URL('./review-proposal-schema.json', import.meta.url), 'utf8').then(JSON.parse),
]);

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function isActionText(value, maxLength) {
  return typeof value === 'string'
    && Boolean(value.trim())
    && value.length <= maxLength
    && !NUMERIC_PATTERN.test(value)
    && !internalTermPattern.test(value);
}

function exactKeys(value, keys) {
  return Object.keys(value).sort().join(',') === keys;
}

export function validateReviewProposalsRequest(value) {
  if (!isPlainObject(value)) return { valid: false, message: '请求必须是对象。' };
  if (!exactKeys(value, 'schemaVersion,snapshot') || value.schemaVersion !== SCHEMA_VERSION) {
    return { valid: false, message: '请求版本或字段无效。' };
  }
  const snapshot = value.snapshot;
  if (!isPlainObject(snapshot)
    || !exactKeys(snapshot, SNAPSHOT_KEYS)
    || !isLocalDate(snapshot.date)
    || !validTimeZone(snapshot.timeZone)
    || !isCount(snapshot.plannedCount)
    || !isCount(snapshot.completedAsPlannedCount)
    || !isCount(snapshot.completedTotalCount)
    || !isCount(snapshot.recordedMinutes)
    || !isCount(snapshot.interruptions)
    || typeof snapshot.recordsComplete !== 'boolean'
    || !Array.isArray(snapshot.categoryMinutes)) {
    return { valid: false, message: 'Snapshot 字段无效。' };
  }
  const categoryMinutes = [];
  for (const item of snapshot.categoryMinutes) {
    if (!isPlainObject(item)
      || !exactKeys(item, 'category,minutes')
      || !CATEGORIES.includes(item.category)
      || !isCount(item.minutes)) {
      return { valid: false, message: 'categoryMinutes 字段无效。' };
    }
    categoryMinutes.push({ category: item.category, minutes: item.minutes });
  }
  return {
    valid: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      snapshot: {
        date: snapshot.date,
        timeZone: snapshot.timeZone,
        plannedCount: snapshot.plannedCount,
        completedAsPlannedCount: snapshot.completedAsPlannedCount,
        completedTotalCount: snapshot.completedTotalCount,
        recordedMinutes: snapshot.recordedMinutes,
        interruptions: snapshot.interruptions,
        categoryMinutes,
        recordsComplete: snapshot.recordsComplete,
      },
    },
  };
}

export function validateReviewSuggestions(value) {
  if (!isPlainObject(value) || !exactKeys(value, 'suggestions')) return { valid: false, message: '模型返回的结构无效。' };
  if (!Array.isArray(value.suggestions) || value.suggestions.length > MAX_SUGGESTIONS) {
    return { valid: false, message: '模型返回的建议数量无效。' };
  }
  const suggestions = [];
  for (const item of value.suggestions) {
    if (!isPlainObject(item) || !exactKeys(item, 'action,factIds,title')) return { valid: false, message: '建议字段集合无效。' };
    if (!isActionText(item.title, 40)) return { valid: false, message: '建议标题无效。' };
    if (!isActionText(item.action, 120)) return { valid: false, message: '建议行动无效。' };
    if (!Array.isArray(item.factIds) || !item.factIds.length || item.factIds.length > MAX_FACT_IDS) {
      return { valid: false, message: '建议事实引用数量无效。' };
    }
    const seen = new Set();
    for (const factId of item.factIds) {
      if (typeof factId !== 'string' || !FACT_IDS.has(factId)) return { valid: false, message: '建议引用了未知事实。' };
      if (seen.has(factId)) return { valid: false, message: '建议引用了重复事实。' };
      seen.add(factId);
    }
    suggestions.push({ title: item.title, factIds: [...item.factIds], action: item.action });
  }
  return { valid: true, suggestions };
}

export function createReviewProposalsHandler({ config, fetchImpl = fetch, logger = console }) {
  const allowedOrigins = new Set(config.allowedOrigins);
  return async function reviewProposalsHandler(req, res) {
    const requestId = randomUUID();
    const started = performance.now();
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : '';
    let resultStatus = 'unknown';
    try {
      if (origin && !allowedOrigin) {
        safeJson(res, 403, failure('proposal_unavailable', '请求来源不受允许。', false));
        resultStatus = 'origin_rejected';
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
        safeJson(res, 503, failure('proposal_unavailable', '云端复盘当前已关闭。', true), allowedOrigin);
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
      const validatedRequest = validateReviewProposalsRequest(parsedBody);
      if (!validatedRequest.valid) {
        safeJson(res, 400, failure('invalid_proposal', validatedRequest.message, false), allowedOrigin);
        resultStatus = 'invalid_request';
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
      let upstream;
      let upstreamBody = null;
      try {
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
                { role: 'user', content: JSON.stringify(validatedRequest.value.snapshot) },
              ],
              text: {
                format: {
                  type: 'json_schema',
                  name: 'reflow_review_proposal_draft',
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
        }
        try {
          upstreamBody = await upstream.json();
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            safeJson(res, 504, failure('proposal_timeout', '云端模型响应超时。', true), allowedOrigin);
            resultStatus = 'timeout';
            return;
          }
        }
      } finally {
        clearTimeout(timeout);
      }

      if (!upstream.ok) {
        const mapped = safeUpstreamFailure(upstream.status);
        safeJson(res, mapped.status, mapped.body, allowedOrigin);
        resultStatus = `upstream_${upstream.status}`;
        return;
      }
      if (upstreamBody === null) {
        safeJson(res, 502, failure('invalid_proposal', '模型返回的复盘建议格式无效。', true), allowedOrigin);
        resultStatus = 'invalid_response_envelope';
        return;
      }
      if (extractRefusal(upstreamBody)) {
        safeJson(res, 422, failure('proposal_refused', '模型无法根据这些统计事实给出复盘建议。', false), allowedOrigin);
        resultStatus = 'refused';
        return;
      }
      let parsed;
      const responseText = extractResponseText(upstreamBody);
      try {
        parsed = JSON.parse(responseText);
      } catch {
        safeJson(res, 502, failure('invalid_proposal', '模型返回的复盘建议格式无效。', true), allowedOrigin);
        resultStatus = 'invalid_json_output';
        return;
      }
      const validated = validateReviewSuggestions(parsed);
      if (!validated.valid) {
        safeJson(res, 502, failure('invalid_proposal', '模型返回的复盘建议未通过安全校验。', true), allowedOrigin);
        resultStatus = 'invalid_output';
        return;
      }
      safeJson(res, 200, { status: 'success', schemaVersion: SCHEMA_VERSION, suggestions: validated.suggestions }, allowedOrigin);
      resultStatus = 'success';
    } catch {
      if (!res.headersSent) safeJson(res, 500, failure('proposal_unavailable', '本地 Gateway 处理失败。', true), allowedOrigin);
      else res.end();
      resultStatus = 'internal_error';
    } finally {
      logger.info?.({
        event: 'review_proposal_request',
        requestId,
        status: resultStatus,
        latencyMs: Math.round(performance.now() - started),
      });
    }
  };
}
