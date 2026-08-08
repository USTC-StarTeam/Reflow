import { readFile } from 'node:fs/promises';

import {
  buildJobs,
  inferDeterministicSuggestedDate,
  POSTPROCESS_VERSION,
  postprocessDraft,
  PROMPT_VERSION,
  readJson,
  SCHEMA_VERSION,
  sha256,
  validateDraft,
  validateSuite,
} from './lib.mjs';
import { readEvaluationProviderConfig } from './config.mjs';

const directory = new URL('.', import.meta.url);

const baseTask = {
  title: '整理项目说明',
  category: 'work',
  outcome: 'task',
  suggestedBucket: null,
  suggestedDate: null,
  estimatedMinutes: 45,
  nextAction: '列出说明的三个部分',
  waitingDetails: null,
  knowledgeSummary: null,
  confidence: 0.9,
  reason: '这是清晰但尚未安排日期的工作任务。',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const providerDefaults = readEvaluationProviderConfig({ env: {} });
  const cliOverrideProvider = readEvaluationProviderConfig({
    env: { DEEPSEEK_REASONING_EFFORT: 'low' },
    args: { reasoning: 'medium' },
  });
  const legacyProvider = readEvaluationProviderConfig({
    env: {
      OPENAI_API_KEY: 'offline-legacy-key',
      OPENAI_BASE_URL: 'https://legacy-offline.invalid/v1',
      OPENAI_MODEL: 'legacy-offline-model',
      OPENAI_REASONING_EFFORT: 'high',
    },
  });
  assert(providerDefaults.responsesUrl === 'https://api.deepseek.com/responses'
    && providerDefaults.model === 'deepseek-v4-flash'
    && providerDefaults.reasoningEffort === 'high'
    && cliOverrideProvider.reasoningEffort === 'medium'
    && legacyProvider.responsesUrl === 'https://legacy-offline.invalid/v1/responses', '评测 Provider 配置自检失败。');

  const [suite, schema, prompt] = await Promise.all([
    readJson(new URL('cases.json', directory)),
    readJson(new URL('cloud-proposal-schema.json', directory)),
    readFile(new URL('prompt.md', directory), 'utf8'),
  ]);
  assert(validateSuite(suite).valid && buildJobs(suite).length === 80, '历史 P0 Suite 结构自检失败。');
  assert(PROMPT_VERSION === 'reflow-proposal-conservative-v6'
    && SCHEMA_VERSION === 'reflow-cloud-proposal-draft-v4'
    && POSTPROCESS_VERSION === 'reflow-proposal-conservative-normalizer-v2'
    && prompt.includes(PROMPT_VERSION)
    && prompt.includes('“下周再整理” still names only a week range')
    && !prompt.includes('“下周再整理”, “以后有空整理”, and “有时间再整理” use `someday`')
    && schema.$id.endsWith('cloud-proposal-draft-v4.json')
    && sha256(prompt).length === 64
    && sha256(JSON.stringify(schema)).length === 64, 'Prompt/Schema 版本或 SHA 自检失败。');

  assert(validateDraft(baseTask).valid, '未决定去向的 task 应合法。');
  assert(!validateDraft({ ...baseTask, suggestedBucket: 'today' }).valid, 'today + null date 应非法。');
  assert(validateDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: '2026-07-25' }).valid, 'today + 合法日期应合法。');

  assert(inferDeterministicSuggestedDate('明天下午整理说明', '2026-07-24') === '2026-07-25', '明天日期归一化失败。');
  assert(inferDeterministicSuggestedDate('下个月3号整理说明', '2026-12-20') === '2027-01-03', '下个月具体日期归一化失败。');
  assert(inferDeterministicSuggestedDate('下个月第一个周一去银行更新预留手机号', '2026-07-24') === '2026-08-03', '下个月第一个周一归一化失败。');
  assert(inferDeterministicSuggestedDate('这周末整理说明', '2026-07-24') === null, '周末不应臆测具体日期。');
  assert(inferDeterministicSuggestedDate('月底整理说明', '2028-02-10') === null, '月底不应臆测具体日期。');

  const noDate = postprocessDraft({ ...baseTask, suggestedBucket: 'today' }, { rawText: '整理项目说明', referenceDate: '2026-07-24' });
  assert(noDate.suggestedBucket === null && noDate.suggestedDate === null, '无日期 today fallback 未移除。');
  for (const range of ['这周末整理项目说明', '下周整理项目说明', '月底整理项目说明', '下个月整理项目说明']) {
    const unresolved = postprocessDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: '2026-07-25' }, { rawText: range, referenceDate: '2026-07-24' });
    assert(unresolved.suggestedBucket === null && unresolved.suggestedDate === null, `${range} 不应补具体日期或稍后。`);
  }
  const explicitWeekendDate = postprocessDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: null }, { rawText: '周末 2026-08-15 整理项目说明', referenceDate: '2026-07-24' });
  assert(explicitWeekendDate.suggestedBucket === 'today' && explicitWeekendDate.suggestedDate === '2026-08-15', '范围词不能清空用户提供的明确日期。');
  assert(explicitWeekendDate.reason === baseTask.reason && !explicitWeekendDate.reason.includes('最近的周末日期'), '后处理不能虚构周末日期推断。');
  const nextMonthMonday = postprocessDraft({ ...baseTask, category: 'life', suggestedBucket: 'today', suggestedDate: null }, { rawText: '下个月第一个周一去银行更新预留手机号', referenceDate: '2026-07-24' });
  assert(nextMonthMonday.category === 'life' && nextMonthMonday.suggestedBucket === 'today' && nextMonthMonday.suggestedDate === '2026-08-03', 'H02 必须保留生活任务与下个月第一个周一日期。');
  const someday = postprocessDraft(baseTask, { rawText: '以后有空整理项目说明', referenceDate: '2026-07-24' });
  assert(someday.suggestedBucket === 'someday' && someday.suggestedDate === null, '明确以后有空应为 someday。');
  const explicitSomeday = postprocessDraft({ ...baseTask, suggestedBucket: 'someday' }, { rawText: '以后有空整理项目说明', referenceDate: '2026-07-24' });
  assert(explicitSomeday.suggestedBucket === 'someday' && explicitSomeday.suggestedDate === null, '明确延后应保留 someday。');
  for (const rawText of ['哪天再弄一下个人主页', '个人主页暂时不急', '回头再整理项目说明']) {
    const deferred = postprocessDraft(baseTask, { rawText, referenceDate: '2026-07-24' });
    assert(deferred.suggestedBucket === 'someday' && deferred.suggestedDate === null, `${rawText} 应识别为明确延期。`);
  }
  const rangedRetry = postprocessDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: '2026-07-25' }, { rawText: '下周再整理项目说明', referenceDate: '2026-07-24' });
  assert(rangedRetry.suggestedBucket === null && rangedRetry.suggestedDate === null, '下周再整理仍是无具体日期的范围，不应变成 someday。');
  const monthRangeWithModelSomeday = postprocessDraft({ ...baseTask, suggestedBucket: 'someday' }, { rawText: '下个月把个人主页重新整理一下', referenceDate: '2026-07-24' });
  assert(monthRangeWithModelSomeday.suggestedBucket === null && monthRangeWithModelSomeday.suggestedDate === null, '下个月不能因模型误给 someday 而变成稍后。');
  const knowledge = {
    title: '复盘目标确认原则', category: 'work', outcome: 'knowledge', suggestedBucket: null, suggestedDate: null,
    estimatedMinutes: null, nextAction: null, waitingDetails: null, knowledgeSummary: '先确认目标，再检查数据。', confidence: 0.9, reason: '这是可复用的复盘经验。',
  };
  const preservedKnowledge = postprocessDraft(knowledge, { rawText: '复盘经验：先确认目标，然后检查数据', referenceDate: '2026-07-24' });
  assert(preservedKnowledge === knowledge && validateDraft(preservedKnowledge).valid, 'knowledge 不能被 task 启发式覆盖。');
  const waiting = {
    title: '等待老师回复', category: 'communication', outcome: 'task', suggestedBucket: 'waiting', suggestedDate: null,
    estimatedMinutes: null, nextAction: null, waitingDetails: { waitingFor: '老师', waitingOn: '回复', followUpDate: '2026-07-31' }, knowledgeSummary: null, confidence: 0.9, reason: '当前需要等待老师回复。',
  };
  const preservedWaiting = postprocessDraft(waiting, { rawText: '等老师下周回复', referenceDate: '2026-07-24' });
  assert(preservedWaiting.suggestedBucket === 'waiting' && preservedWaiting.waitingDetails?.followUpDate === null && validateDraft(preservedWaiting).valid, 'waiting 的对方下周回复不能被当作用户跟进日期。');
  const noDateWaiting = postprocessDraft(waiting, { rawText: '等老师回复', referenceDate: '2026-07-24' });
  assert(noDateWaiting.waitingDetails?.followUpDate === null && validateDraft(noDateWaiting).valid, '无日期 waiting 不能保留模型臆造的跟进日期。');
  const explicitFollowUpWaiting = postprocessDraft(waiting, { rawText: '周五还没回复就提醒我', referenceDate: '2026-07-24' });
  assert(explicitFollowUpWaiting.waitingDetails?.followUpDate === '2026-07-24' && validateDraft(explicitFollowUpWaiting).valid, '明确周五提醒必须以原文确定跟进日期。');
  for (const rawText of ['等老师回复，然后提交申请', '等客户确认；再给财务开票']) {
    const waitingWithSecondAction = postprocessDraft(waiting, { rawText, referenceDate: '2026-07-24' });
    assert(waitingWithSecondAction.category === 'unknown' && waitingWithSecondAction.suggestedBucket === null && waitingWithSecondAction.title === rawText && waitingWithSecondAction.reason.includes('拆开') && validateDraft(waitingWithSecondAction).valid, `${rawText} 不能因 waiting 而静默遗漏后续行动。`);
  }
  for (const rawText of ['交电费', '取快递', '更新银行卡信息', '去医院挂号', '给猫喂药', '报名比赛', '整理参赛材料', '提交申请材料', '检查报名资料']) {
    const clearShortTask = postprocessDraft({ ...baseTask, title: rawText, suggestedBucket: 'today', suggestedDate: null }, { rawText, referenceDate: '2026-07-24' });
    assert(clearShortTask.category !== 'unknown' && clearShortTask.suggestedBucket === null && clearShortTask.estimatedMinutes === 45 && clearShortTask.nextAction === baseTask.nextAction && validateDraft(clearShortTask).valid, `${rawText} 不应被裸名词保护误判为 unknown。`);
  }
  const vague = postprocessDraft({ ...baseTask, suggestedBucket: 'today' }, { rawText: '竞赛展示材料', referenceDate: '2026-07-24' });
  assert(vague.category === 'unknown' && vague.suggestedBucket === null && vague.estimatedMinutes === null && vague.nextAction === null, '模糊名词未保守处理。');
  const competitionMaterials = postprocessDraft({ ...baseTask, suggestedBucket: 'today' }, { rawText: '参赛材料', referenceDate: '2026-07-24' });
  assert(competitionMaterials.category === 'unknown' && competitionMaterials.suggestedBucket === null && competitionMaterials.estimatedMinutes === null && competitionMaterials.nextAction === null, '参赛材料必须保持保守 unknown。');
  for (const rawText of ['交电费；', '交电费;', '了解报名时间以及要求']) {
    const singleAction = postprocessDraft(baseTask, { rawText, referenceDate: '2026-07-24' });
    assert(singleAction.category === baseTask.category && singleAction.title === baseTask.title && validateDraft(singleAction).valid, `${rawText} 不能仅因尾标点或名词并列被误判为多行动。`);
  }
  const multi = postprocessDraft(baseTask, { rawText: '整理项目周报，然后预约体检', referenceDate: '2026-07-24' });
  assert(multi.category === 'unknown' && multi.title.includes('整理项目周报') && multi.title.includes('预约体检') && multi.reason.includes('拆开'), '多意图未保留语义并提示拆分。');
  const semicolonMulti = postprocessDraft(baseTask, { rawText: '交电费；取快递', referenceDate: '2026-07-24' });
  assert(semicolonMulti.category === 'unknown' && semicolonMulti.title.includes('交电费') && semicolonMulti.title.includes('取快递'), '两个完整分号子句必须作为多行动保守提示拆分。');
  for (const rawText of ['交电费；取快递；', '交电费；取快递；报名比赛；']) {
    const trailingSemicolonMulti = postprocessDraft(baseTask, { rawText, referenceDate: '2026-07-24' });
    assert(trailingSemicolonMulti.category === 'unknown' && trailingSemicolonMulti.title === rawText && trailingSemicolonMulti.reason.includes('拆开'), `${rawText} 必须忽略尾随分号后仍识别多个独立行动。`);
  }
  const knownMulti = postprocessDraft(baseTask, { rawText: '周末把 Agent 资料整理一下，再把排协网站首页也重新整理一下', referenceDate: '2026-07-24' });
  assert(knownMulti.category === 'unknown' && knownMulti.title.includes('Agent 资料') && knownMulti.title.includes('排协网站首页'), '顺序连接的两个行动必须保留为一个待拆分 Proposal。');

  const modelInventedToday = postprocessDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: '2026-07-24' }, { rawText: '整理项目说明', referenceDate: '2026-07-24' });
  assert(modelInventedToday.suggestedBucket === null && modelInventedToday.suggestedDate === null, '无日期原文不能保留模型臆造的今天。');
  const modelWrongTomorrow = postprocessDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: '2026-07-24' }, { rawText: '明天整理项目说明', referenceDate: '2026-07-24' });
  assert(modelWrongTomorrow.suggestedBucket === 'today' && modelWrongTomorrow.suggestedDate === '2026-07-25', '明天必须以确定性日期覆盖模型错误日期。');
  const modelWrongNextWednesday = postprocessDraft({ ...baseTask, suggestedBucket: 'today', suggestedDate: '2026-07-24' }, { rawText: '下周三整理项目说明', referenceDate: '2026-07-24' });
  assert(modelWrongNextWednesday.suggestedBucket === 'today' && modelWrongNextWednesday.suggestedDate === '2026-07-29', '下周三必须以确定性日期覆盖模型错误日期。');

  console.log('Proposal 工具离线自检通过：历史 Suite 结构未改写（不声明旧预期符合当前语义），v6/v4/v2 合同与保守日期规则有效。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
