import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const PROMPT_VERSION = 'reflow-proposal-conservative-v7';
export const SCHEMA_VERSION = 'reflow-cloud-proposal-draft-v4';
export const SUITE_VERSION = 'reflow-proposal-cases-v1';
export const POSTPROCESS_VERSION = 'reflow-proposal-conservative-normalizer-v3';

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

function addLocalDays(referenceDate, amount) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return formatLocalDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function weekdayDate(text, referenceDate) {
  const match = text.match(/(下周|下星期|本周|这周|本星期|这星期|星期|周)([一二三四五六日天])/u);
  if (!match) return null;
  const weekdays = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const target = weekdays[match[2]];
  const [year, month, day] = referenceDate.split('-').map(Number);
  const rawWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const current = rawWeekday === 0 ? 7 : rawWeekday;
  const delta = match[1].startsWith('下')
    ? 7 - current + target
    : match[1].startsWith('本') || match[1].startsWith('这')
      ? target - current
      : (target - current + 7) % 7;
  return addLocalDays(referenceDate, delta);
}

function nextMonthDate(text, referenceDate) {
  const match = text.match(/下个月(?:的)?(\d{1,2})[日号]/u);
  if (!match) return null;
  const [year, month] = referenceDate.split('-').map(Number);
  const value = new Date(Date.UTC(year, month, Number(match[1])));
  const candidate = formatLocalDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  return Number(match[1]) === value.getUTCDate() ? candidate : null;
}

function nextMonthNthWeekday(text, referenceDate) {
  const match = text.match(/下个月第([一二三四五六七八九十\d]+)个?(?:周|星期)([一二三四五六日天])/u);
  if (!match) return null;
  const ordinalNames = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const ordinal = /^\d+$/u.test(match[1]) ? Number(match[1]) : ordinalNames[match[1]];
  const weekdays = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const target = weekdays[match[2]];
  if (!Number.isInteger(ordinal) || ordinal < 1 || !target) return null;

  const [year, month] = referenceDate.split('-').map(Number);
  const firstOfNextMonth = new Date(Date.UTC(year, month, 1));
  const firstWeekday = firstOfNextMonth.getUTCDay() || 7;
  const day = 1 + ((target - firstWeekday + 7) % 7) + ((ordinal - 1) * 7);
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getUTCMonth() !== firstOfNextMonth.getUTCMonth()) return null;
  return formatLocalDate(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
}

export function inferDeterministicSuggestedDate(rawText, referenceDate) {
  if (typeof rawText !== 'string' || !isLocalDate(referenceDate)) return null;
  const text = rawText.trim();
  const isoDate = text.match(/(?:^|\D)(\d{4}-\d{2}-\d{2})(?:\D|$)/u)?.[1];
  if (isoDate && isLocalDate(isoDate)) return isoDate;
  const chineseDate = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/u);
  if (chineseDate) {
    const referenceYear = Number(referenceDate.slice(0, 4));
    const month = Number(chineseDate[2]);
    const day = Number(chineseDate[3]);
    let year = chineseDate[1] ? Number(chineseDate[1]) : referenceYear;
    let candidate = formatLocalDate(year, month, day);
    if (!isLocalDate(candidate)) return null;
    if (!chineseDate[1] && candidate < referenceDate) candidate = formatLocalDate(year + 1, month, day);
    return isLocalDate(candidate) ? candidate : null;
  }
  const nextMonthOrdinalWeekday = nextMonthNthWeekday(text, referenceDate);
  if (nextMonthOrdinalWeekday) return nextMonthOrdinalWeekday;
  const nextMonth = nextMonthDate(text, referenceDate);
  if (nextMonth) return nextMonth;
  if (/明天/u.test(text)) return addLocalDays(referenceDate, 1);
  if (/(?:今天|今晚|今早|今晨|今儿)/u.test(text)) return referenceDate;
  const weekday = weekdayDate(text, referenceDate);
  if (weekday) return weekday;
  return null;
}

function hasHighConfidenceMultipleActions(text) {
  const hasSubstantiveClause = (value) => value
    .replace(/[\s，,。！？!?、]/gu, '')
    .length >= 2;

  // This is intentionally a limited, high-confidence safeguard rather than a
  // general Chinese multi-intent parser. A trailing semicolon is punctuation,
  // and conjunctions such as “并” or “以及” can join steps or objects inside one
  // task. Fuzzy intent boundaries remain the model's responsibility.
  const semicolonClauses = text.split(/[；;]/u).filter(hasSubstantiveClause);
  if (semicolonClauses.length >= 2) return true;

  for (const match of text.matchAll(/(?:然后|接着|随后|再(?:把|去))/gu)) {
    const before = text.slice(0, match.index);
    const after = text.slice((match.index ?? 0) + match[0].length);
    if (hasSubstantiveClause(before) && hasSubstantiveClause(after)) return true;
  }
  return false;
}

function conservativeUnknownDraft(draft, title, reason) {
  return {
    ...draft,
    title: title.slice(0, 80),
    category: 'unknown',
    outcome: 'task',
    suggestedBucket: null,
    suggestedDate: null,
    estimatedMinutes: null,
    nextAction: null,
    waitingDetails: null,
    knowledgeSummary: null,
    confidence: Math.min(typeof draft.confidence === 'number' ? draft.confidence : 0.35, 0.35),
    reason,
  };
}

function hasBroadFutureRange(text, referenceDate) {
  return /(?:这周末|本周末|周末|下周(?![一二三四五六日天])|下星期(?![一二三四五六日天])|月底)/u.test(text)
    || (/下个月/u.test(text) && nextMonthDate(text, referenceDate) === null && nextMonthNthWeekday(text, referenceDate) === null);
}

function isExplicitlyDeferred(text) {
  return /(?:以后有空|以后再|有空再|有时间再|将来再说|稍后再|暂缓|哪天再|回头再|暂时不急)/u.test(text);
}

function hasExplicitFollowUpIntent(text) {
  return /(?:提醒(?:我)?|跟进|催(?:一下)?|再联系|再问)/u.test(text);
}

function normalizeWaitingFollowUpDate(draft, text, referenceDate) {
  if (!isPlainObject(draft.waitingDetails)) return draft;
  // A date attached to the other party's expected reply is not automatically
  // the user's follow-up date. Preserve or derive one only when the capture
  // explicitly asks the user to follow up and has a uniquely resolvable day.
  const followUpDate = hasExplicitFollowUpIntent(text)
    ? inferDeterministicSuggestedDate(text, referenceDate)
    : null;
  return {
    ...draft,
    waitingDetails: { ...draft.waitingDetails, followUpDate },
  };
}

export function postprocessDraft(draft, { rawText, referenceDate } = {}) {
  if (!isPlainObject(draft) || typeof rawText !== 'string') return draft;
  if (!OUTCOMES.includes(draft.outcome)
    || !CATEGORIES.includes(draft.category)
    || !(draft.suggestedBucket === null || BUCKETS.includes(draft.suggestedBucket))
    || !(draft.suggestedDate === null || isLocalDate(draft.suggestedDate))) {
    return draft;
  }
  const text = rawText.trim();
  // Knowledge may describe a sequence of explanatory steps; it is not a
  // collection of task actions and must remain intact.
  if (draft.outcome === 'knowledge') return draft;
  if (hasHighConfidenceMultipleActions(text)) {
    return conservativeUnknownDraft(draft, text || '多个事项待拆分', '检测到多个独立行动，请拆开后逐条输入，避免遗漏其中任一事项。');
  }
  // A single waiting item is already a valid workflow state. Only preserve it
  // after the multi-action safeguard, so a later action is never silently
  // discarded because a model chose waiting for the first clause.
  if (draft.suggestedBucket === 'waiting') return normalizeWaitingFollowUpDate(draft, text, referenceDate);
  if (draft.category === 'unknown') return conservativeUnknownDraft(draft, draft.title, draft.reason);
  if (isExplicitlyDeferred(text)) {
    return { ...draft, suggestedBucket: 'someday', suggestedDate: null };
  }
  const inferredDate = inferDeterministicSuggestedDate(text, referenceDate);
  if (hasBroadFutureRange(text, referenceDate) && !inferredDate) {
    return { ...draft, suggestedBucket: null, suggestedDate: null };
  }
  if (draft.suggestedBucket === 'someday') {
    return inferredDate
      ? { ...draft, suggestedBucket: 'today', suggestedDate: inferredDate }
      : { ...draft, suggestedBucket: null, suggestedDate: null };
  }
  if (inferredDate) {
    return { ...draft, suggestedBucket: 'today', suggestedDate: inferredDate };
  }
  return draft.suggestedBucket === 'today'
    ? { ...draft, suggestedBucket: null, suggestedDate: null }
    : draft;
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
  const schemaIssues = [];
  const addSchemaIssue = (path, code, expected, message) => {
    schemaIssues.push({ path, code, expected });
    errors.push(message);
  };
  if (!isPlainObject(value)) {
    return {
      valid: false,
      schemaValid: false,
      domainValid: false,
      errors: ['Draft 必须是对象。'],
      issues: [{ path: '$', code: 'object_required', expected: 'object' }],
    };
  }
  if (!hasExactKeys(value, draftKeys)) addSchemaIssue('$', 'exact_field_set', 'exact Cloud Proposal Draft fields', 'Draft 字段集合与 Schema 不一致。');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 80) addSchemaIssue('$.title', 'non_empty_string_1_80', 'non-empty string with 1–80 characters', 'title 必须是 1–80 字符的非空字符串。');
  if (!CATEGORIES.includes(value.category)) addSchemaIssue('$.category', 'category_enum', 'work | communication | learning | life | health | unknown', 'category 非法。');
  if (!OUTCOMES.includes(value.outcome)) addSchemaIssue('$.outcome', 'outcome_enum', 'task | knowledge', 'outcome 非法。');
  if (!(value.suggestedBucket === null || BUCKETS.includes(value.suggestedBucket))) addSchemaIssue('$.suggestedBucket', 'bucket_enum_or_null', 'today | waiting | someday | null', 'suggestedBucket 非法。');
  if (!(value.suggestedDate === null || isLocalDate(value.suggestedDate))) addSchemaIssue('$.suggestedDate', 'local_date_or_null', 'YYYY-MM-DD local date or null', 'suggestedDate 必须是合法 LocalDate 或 null。');
  if (!(value.estimatedMinutes === null || (Number.isInteger(value.estimatedMinutes) && value.estimatedMinutes >= 5 && value.estimatedMinutes <= 480))) addSchemaIssue('$.estimatedMinutes', 'integer_5_480_or_null', 'integer from 5 to 480 or null', 'estimatedMinutes 必须是 5–480 的整数或 null。');
  if (!nullableNonEmptyString(value.nextAction, 240)) addSchemaIssue('$.nextAction', 'non_empty_string_240_or_null', 'non-empty string up to 240 characters or null', 'nextAction 必须是非空字符串或 null。');
  if (!nullableNonEmptyString(value.knowledgeSummary, 600)) addSchemaIssue('$.knowledgeSummary', 'non_empty_string_600_or_null', 'non-empty string up to 600 characters or null', 'knowledgeSummary 必须是非空字符串或 null。');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) addSchemaIssue('$.confidence', 'number_0_1', 'finite number from 0 to 1', 'confidence 必须位于 0–1。');
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 240) addSchemaIssue('$.reason', 'non_empty_string_1_240', 'non-empty string with 1–240 characters', 'reason 必须是 1–240 字符的非空字符串。');

  if (value.waitingDetails !== null) {
    if (!isPlainObject(value.waitingDetails) || !hasExactKeys(value.waitingDetails, waitingKeys)) {
      addSchemaIssue('$.waitingDetails', 'waiting_details_shape_or_null', 'null or object with waitingFor, waitingOn, and followUpDate', 'waitingDetails 必须是 null 或包含全部三个键的对象。');
    } else {
      if (!nullableNonEmptyString(value.waitingDetails.waitingFor, 120)) addSchemaIssue('$.waitingDetails.waitingFor', 'non_empty_string_120_or_null', 'non-empty string up to 120 characters or null', 'waitingFor 必须是非空字符串或 null。');
      if (!nullableNonEmptyString(value.waitingDetails.waitingOn, 240)) addSchemaIssue('$.waitingDetails.waitingOn', 'non_empty_string_240_or_null', 'non-empty string up to 240 characters or null', 'waitingOn 必须是非空字符串或 null。');
      if (!(value.waitingDetails.followUpDate === null || isLocalDate(value.waitingDetails.followUpDate))) addSchemaIssue('$.waitingDetails.followUpDate', 'local_date_or_null', 'YYYY-MM-DD local date or null', 'followUpDate 必须是合法 LocalDate 或 null。');
    }
  }

  const schemaValid = errors.length === 0;
  const domainErrors = [];
  const domainIssues = [];
  const addDomainIssue = (path, code, expected, message) => {
    domainIssues.push({ path, code, expected });
    domainErrors.push(message);
  };
  if (schemaValid) {
    const visibleFields = [
      ['$.title', value.title],
      ['$.nextAction', value.nextAction],
      ['$.reason', value.reason],
      ['$.knowledgeSummary', value.knowledgeSummary],
      ['$.waitingDetails.waitingFor', value.waitingDetails?.waitingFor],
      ['$.waitingDetails.waitingOn', value.waitingDetails?.waitingOn],
    ];
    const internalField = visibleFields.find(([, fieldValue]) => containsInternalTerm(fieldValue));
    if (internalField) {
      addDomainIssue(internalField[0], 'internal_term_forbidden', 'user-visible text without internal schema or protocol terms', '用户可见字段包含内部 Schema、类型或字段名称。');
    }
    if (value.outcome === 'knowledge') {
      if (value.suggestedBucket !== null) addDomainIssue('$.suggestedBucket', 'knowledge_bucket_null', 'null when outcome is knowledge', 'knowledge 的 suggestedBucket 必须是 null。');
      if (value.suggestedDate !== null) addDomainIssue('$.suggestedDate', 'knowledge_date_null', 'null when outcome is knowledge', 'knowledge 的 suggestedDate 必须是 null。');
      if (value.estimatedMinutes !== null) addDomainIssue('$.estimatedMinutes', 'knowledge_estimate_null', 'null when outcome is knowledge', 'knowledge 的 estimatedMinutes 必须是 null。');
      if (value.nextAction !== null) addDomainIssue('$.nextAction', 'knowledge_next_action_null', 'null when outcome is knowledge', 'knowledge 的 nextAction 必须是 null。');
      if (value.waitingDetails !== null) addDomainIssue('$.waitingDetails', 'knowledge_waiting_details_null', 'null when outcome is knowledge', 'knowledge 的 waitingDetails 必须是 null。');
      if (value.knowledgeSummary === null) addDomainIssue('$.knowledgeSummary', 'knowledge_summary_required', 'non-empty string when outcome is knowledge', 'knowledge 必须提供 knowledgeSummary。');
    } else {
      if (value.knowledgeSummary !== null) addDomainIssue('$.knowledgeSummary', 'task_knowledge_summary_null', 'null when outcome is task', 'task 的 knowledgeSummary 必须是 null。');
      if (value.suggestedBucket === null && value.suggestedDate !== null) addDomainIssue('$.suggestedDate', 'undecided_task_date_null', 'null when task destination is undecided', '未决定去向的 task 日期必须为 null。');
      if (value.suggestedBucket === 'today' && value.suggestedDate === null) addDomainIssue('$.suggestedDate', 'today_date_required', 'valid local date when suggestedBucket is today', 'today 必须包含合法 suggestedDate。');
      if (value.category === 'unknown'
        && (value.suggestedBucket !== null || value.suggestedDate !== null || value.estimatedMinutes !== null || value.nextAction !== null || value.waitingDetails !== null || value.confidence > 0.5)) {
        addDomainIssue('$', 'unknown_task_conservative', 'unknown task with null workflow/execution fields and low confidence', 'unknown task 必须保守并保持执行字段为空。');
      }
    }
    if (value.suggestedBucket === 'waiting') {
      if (value.suggestedDate !== null) addDomainIssue('$.suggestedDate', 'waiting_date_null', 'null when suggestedBucket is waiting', 'waiting 的 suggestedDate 必须是 null。');
      if (value.waitingDetails === null) addDomainIssue('$.waitingDetails', 'waiting_details_required', 'complete nullable object when suggestedBucket is waiting', 'waiting 必须返回完整 nullable waitingDetails 对象。');
    } else if (value.waitingDetails !== null) {
      addDomainIssue('$.waitingDetails', 'non_waiting_details_null', 'null unless suggestedBucket is waiting', '非 waiting Proposal 的 waitingDetails 必须是 null。');
    }
    if (value.suggestedBucket === 'someday' && value.suggestedDate !== null) {
      addDomainIssue('$.suggestedDate', 'someday_date_null', 'null when suggestedBucket is someday', 'someday 的 suggestedDate 必须是 null。');
    }
  }
  const domainValid = schemaValid && domainErrors.length === 0;
  return {
    valid: schemaValid && domainValid,
    schemaValid,
    domainValid,
    errors: [...errors, ...domainErrors],
    issues: [...schemaIssues, ...domainIssues],
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
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value === null || typeof value !== 'object') return value;
    const normalized = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalize(child)]),
    );
    const enumValues = Array.isArray(normalized.enum) ? normalized.enum : null;
    const nonNullEnumValues = enumValues?.filter((item) => item !== null) ?? [];
    if (normalized.type === undefined
      && enumValues?.includes(null)
      && nonNullEnumValues.length > 0
      && nonNullEnumValues.every((item) => typeof item === 'string')) {
      normalized.type = ['string', 'null'];
    }
    return normalized;
  };
  return normalize(supported);
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
