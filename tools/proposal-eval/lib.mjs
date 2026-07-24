import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const PROMPT_VERSION = 'reflow-proposal-final-v5';
export const SCHEMA_VERSION = 'reflow-cloud-proposal-draft-v3';
export const SUITE_VERSION = 'reflow-proposal-cases-v1';
export const POSTPROCESS_VERSION = 'reflow-proposal-date-normalizer-v1';

export const CATEGORIES = ['work', 'communication', 'learning', 'life', 'health', 'unknown'];
export const OUTCOMES = ['task', 'knowledge'];
export const BUCKETS = ['today', 'waiting', 'someday'];

const draftKeys = [
  'title',
  'category',
  'outcome',
  'suggestedBucket',
  'suggestedDate',
  'estimatedMinutes',
  'nextAction',
  'waitingDetails',
  'knowledgeSummary',
  'confidence',
  'reason',
];
const waitingKeys = ['waitingFor', 'waitingOn', 'followUpDate'];
const internalTermPattern = /\b(?:CloudProposalDraft|AIProposal|suggestedBucket|estimatedMinutes|waitingFor|waitingOn|followUpDate|knowledgeSummary|JSON\s*Schema)\b/i;

export function containsInternalTerm(value) {
  return typeof value === 'string' && internalTermPattern.test(value);
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function formatLocalDate(year, month, day) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

export function inferDeterministicSuggestedDate(rawText, referenceDate) {
  if (typeof rawText !== 'string' || !isLocalDate(referenceDate)) return null;
  const text = rawText.trim();
  const [year, month] = referenceDate.split('-').map(Number);

  if (/(?:今天|今晚|今早|今晨|今儿|上午|中午|下午)/u.test(text)) {
    return referenceDate;
  }
  if (/(?:本月)?月底(?:前|之前)?/u.test(text)) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return formatLocalDate(year, month, lastDay);
  }
  return null;
}

export function postprocessDraft(draft, { rawText, referenceDate } = {}) {
  if (!isPlainObject(draft)
    || draft.outcome !== 'task'
    || draft.suggestedBucket !== 'today'
    || draft.suggestedDate !== null) {
    return draft;
  }
  const suggestedDate = inferDeterministicSuggestedDate(rawText, referenceDate);
  return suggestedDate ? { ...draft, suggestedDate } : draft;
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nullableNonEmptyString(value, maxLength) {
  return value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength);
}

export function validateDraft(value) {
  const errors = [];
  if (!isPlainObject(value)) return { valid: false, schemaValid: false, domainValid: false, errors: ['Draft 必须是对象。'] };
  if (!hasExactKeys(value, draftKeys)) errors.push('Draft 字段集合与 Schema 不一致。');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 80) errors.push('title 必须是 1–80 字符的非空字符串。');
  if (!CATEGORIES.includes(value.category)) errors.push('category 非法。');
  if (!OUTCOMES.includes(value.outcome)) errors.push('outcome 非法。');
  if (!(value.suggestedBucket === null || BUCKETS.includes(value.suggestedBucket))) errors.push('suggestedBucket 非法。');
  if (!(value.suggestedDate === null || isLocalDate(value.suggestedDate))) errors.push('suggestedDate 必须是合法 LocalDate 或 null。');
  if (!(value.estimatedMinutes === null || (Number.isInteger(value.estimatedMinutes) && value.estimatedMinutes >= 5 && value.estimatedMinutes <= 480))) errors.push('estimatedMinutes 必须是 5–480 的整数或 null。');
  if (!nullableNonEmptyString(value.nextAction, 240)) errors.push('nextAction 必须是非空字符串或 null。');
  if (!nullableNonEmptyString(value.knowledgeSummary, 600)) errors.push('knowledgeSummary 必须是非空字符串或 null。');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('confidence 必须位于 0–1。');
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 240) errors.push('reason 必须是 1–240 字符的非空字符串。');

  if (value.waitingDetails !== null) {
    if (!isPlainObject(value.waitingDetails) || !hasExactKeys(value.waitingDetails, waitingKeys)) {
      errors.push('waitingDetails 必须是 null 或包含全部三个键的对象。');
    } else {
      if (!nullableNonEmptyString(value.waitingDetails.waitingFor, 120)) errors.push('waitingFor 必须是非空字符串或 null。');
      if (!nullableNonEmptyString(value.waitingDetails.waitingOn, 240)) errors.push('waitingOn 必须是非空字符串或 null。');
      if (!(value.waitingDetails.followUpDate === null || isLocalDate(value.waitingDetails.followUpDate))) errors.push('followUpDate 必须是合法 LocalDate 或 null。');
    }
  }

  const schemaValid = errors.length === 0;
  const domainErrors = [];
  if (schemaValid) {
    const visibleValues = [
      value.title,
      value.nextAction,
      value.reason,
      value.knowledgeSummary,
      value.waitingDetails?.waitingFor,
      value.waitingDetails?.waitingOn,
    ];
    if (visibleValues.some(containsInternalTerm)) {
      domainErrors.push('用户可见字段包含内部 Schema、类型或字段名称。');
    }
    if (value.outcome === 'knowledge') {
      if (value.suggestedBucket !== null) domainErrors.push('knowledge 的 suggestedBucket 必须是 null。');
      if (value.suggestedDate !== null) domainErrors.push('knowledge 的 suggestedDate 必须是 null。');
      if (value.estimatedMinutes !== null) domainErrors.push('knowledge 的 estimatedMinutes 必须是 null。');
      if (value.nextAction !== null) domainErrors.push('knowledge 的 nextAction 必须是 null。');
      if (value.waitingDetails !== null) domainErrors.push('knowledge 的 waitingDetails 必须是 null。');
      if (value.knowledgeSummary === null) domainErrors.push('knowledge 必须提供 knowledgeSummary。');
    } else {
      if (value.suggestedBucket === null) domainErrors.push('task 必须提供 suggestedBucket。');
      if (value.knowledgeSummary !== null) domainErrors.push('task 的 knowledgeSummary 必须是 null。');
    }
    if (value.suggestedBucket === 'waiting') {
      if (value.suggestedDate !== null) domainErrors.push('waiting 的 suggestedDate 必须是 null。');
      if (value.waitingDetails === null) domainErrors.push('waiting 必须返回完整 nullable waitingDetails 对象。');
    } else if (value.waitingDetails !== null) {
      domainErrors.push('非 waiting Proposal 的 waitingDetails 必须是 null。');
    }
    if (value.suggestedBucket === 'someday' && value.suggestedDate !== null) {
      domainErrors.push('someday 的 suggestedDate 必须是 null。');
    }
  }
  const domainValid = schemaValid && domainErrors.length === 0;
  return {
    valid: schemaValid && domainValid,
    schemaValid,
    domainValid,
    errors: [...errors, ...domainErrors],
  };
}

export function validateSuite(suite) {
  const errors = [];
  if (!isPlainObject(suite) || !Array.isArray(suite.cases)) return { valid: false, errors: ['cases.json 顶层结构无效。'] };
  if (suite.suiteVersion !== SUITE_VERSION) errors.push(`suiteVersion 应为 ${SUITE_VERSION}。`);
  if (!isLocalDate(suite.referenceDate)) errors.push('referenceDate 无效。');
  if (suite.timeZone !== 'Asia/Shanghai') errors.push('P0 时区必须固定为 Asia/Shanghai。');
  if (suite.locale !== 'zh-CN') errors.push('P0 locale 必须固定为 zh-CN。');
  if (suite.cases.length !== 48) errors.push(`必须包含 48 条唯一输入，当前为 ${suite.cases.length}。`);
  const ids = suite.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('评测用例 ID 必须唯一。');
  if (!Array.isArray(suite.estimableCaseIds) || !suite.estimableCaseIds.length) {
    errors.push('必须人工标记可合理估时案例。');
  } else {
    const estimableIds = new Set(suite.estimableCaseIds);
    const knownIds = new Set(ids);
    if (estimableIds.size !== suite.estimableCaseIds.length) errors.push('estimableCaseIds 不能重复。');
    for (const id of estimableIds) {
      if (!knownIds.has(id)) errors.push(`estimableCaseIds 包含未知案例：${id}`);
    }
  }
  const standard = suite.cases.filter((item) => item.difficulty === 'standard');
  const hard = suite.cases.filter((item) => item.difficulty === 'hard');
  const injections = suite.cases.filter((item) => item.injection === true);
  if (standard.length !== 32) errors.push(`必须包含 32 条常规案例，当前为 ${standard.length}。`);
  if (hard.length !== 16) errors.push(`必须包含 16 条困难案例，当前为 ${hard.length}。`);
  if (injections.length < 4 || injections.length > 6) errors.push(`Prompt 注入案例应为 4–6 条，当前为 ${injections.length}。`);
  for (const item of suite.cases) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || typeof item.input !== 'string' || !item.input.trim()) {
      errors.push('存在缺少 id 或 input 的案例。');
      continue;
    }
    if (!['standard', 'hard'].includes(item.difficulty)) errors.push(`${item.id}: difficulty 非法。`);
    if (!isPlainObject(item.expected)) {
      errors.push(`${item.id}: expected 缺失。`);
      continue;
    }
    if (!CATEGORIES.includes(item.expected.category)) errors.push(`${item.id}: expected.category 非法。`);
    if (!OUTCOMES.includes(item.expected.outcome)) errors.push(`${item.id}: expected.outcome 非法。`);
    if (!(item.expected.suggestedBucket === null || BUCKETS.includes(item.expected.suggestedBucket))) errors.push(`${item.id}: expected.suggestedBucket 非法。`);
    if (!(item.expected.suggestedDate === null || isLocalDate(item.expected.suggestedDate))) errors.push(`${item.id}: expected.suggestedDate 非法。`);
    if (!(item.expected.followUpDate === null || isLocalDate(item.expected.followUpDate))) errors.push(`${item.id}: expected.followUpDate 非法。`);
    if (!Array.isArray(item.expected.titleKeywords)) errors.push(`${item.id}: titleKeywords 必须是数组。`);
    if (suite.estimableCaseIds?.includes(item.id)
      && (item.expected.outcome !== 'task'
        || item.expected.suggestedBucket === 'waiting'
        || item.expected.category === 'unknown')) {
      errors.push(`${item.id}: 知识、纯等待或未识别案例不能标记为可合理估时。`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function buildJobs(suite) {
  return suite.cases.flatMap((item) => {
    const repeats = item.difficulty === 'hard' ? 3 : 1;
    return Array.from({ length: repeats }, (_, index) => ({
      jobId: `${item.id}-R${index + 1}`,
      caseId: item.id,
      repeat: index + 1,
      difficulty: item.difficulty,
      injection: item.injection === true,
      input: item.input,
    }));
  });
}

export function schemaForOpenAI(schema) {
  const { $schema: _schema, $id: _id, ...supported } = schema;
  return supported;
}

export function extractResponseText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const parts = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('');
}

export function extractRefusal(response) {
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'refusal') return typeof content.refusal === 'string' ? content.refusal : 'model_refusal';
    }
  }
  return null;
}

export function calculateCost(usage, inputPricePerMillion, outputPricePerMillion) {
  if (!usage) return null;
  const inputTokens = Number(usage.input_tokens);
  const outputTokens = Number(usage.output_tokens);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return (inputTokens / 1_000_000) * inputPricePerMillion
    + (outputTokens / 1_000_000) * outputPricePerMillion;
}

export function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

export function formatPercent(value) {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

export function parseCliArgs(argv) {
  const result = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      result.positional.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      result[rawKey] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      result[rawKey] = argv[index + 1];
      index += 1;
    } else {
      result[rawKey] = true;
    }
  }
  return result;
}
