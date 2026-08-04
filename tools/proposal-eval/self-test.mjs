import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  buildJobs,
  POSTPROCESS_VERSION,
  postprocessDraft,
  PROMPT_VERSION,
  readJson,
  SCHEMA_VERSION,
  sha256,
} from './lib.mjs';
import { readEvaluationProviderConfig } from './config.mjs';
import { generateReport } from './score.mjs';

const directory = new URL('.', import.meta.url);

function makeDraft(testCase, estimableCaseIds) {
  const expected = testCase.expected;
  const title = expected.titleKeywords[0] ?? '待整理事项';
  const knowledge = expected.outcome === 'knowledge';
  const waiting = expected.suggestedBucket === 'waiting';
  const estimable = estimableCaseIds.has(testCase.id);
  return {
    title,
    category: expected.category,
    outcome: expected.outcome,
    suggestedBucket: expected.suggestedBucket,
    suggestedDate: expected.suggestedDate,
    estimatedMinutes: estimable ? 30 : null,
    nextAction: knowledge ? null : `开始处理${title}`,
    waitingDetails: waiting
      ? {
          waitingFor: null,
          waitingOn: null,
          followUpDate: expected.followUpDate,
        }
      : null,
    knowledgeSummary: knowledge ? `${title}的本地知识摘要` : null,
    confidence: 0.9,
    reason: '离线自检生成的确定性合法结果。',
  };
}

async function main() {
  const workDirectory = await mkdtemp(resolve(tmpdir(), 'reflow-proposal-eval-'));
  try {
    const providerDefaults = readEvaluationProviderConfig({ env: {} });
    const explicitLowProvider = readEvaluationProviderConfig({
      env: { DEEPSEEK_REASONING_EFFORT: 'low' },
    });
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
    if (providerDefaults.responsesUrl !== 'https://api.deepseek.com/responses'
      || providerDefaults.model !== 'deepseek-v4-flash'
      || providerDefaults.reasoningEffort !== 'high'
      || explicitLowProvider.reasoningEffort !== 'low'
      || cliOverrideProvider.reasoningEffort !== 'medium'
      || providerDefaults.pricingPerMillionTokens.input !== 0.14
      || providerDefaults.pricingPerMillionTokens.output !== 0.28
      || legacyProvider.responsesUrl !== 'https://legacy-offline.invalid/v1/responses'
      || legacyProvider.model !== 'legacy-offline-model'
      || legacyProvider.pricingPerMillionTokens.input !== 5
      || legacyProvider.pricingPerMillionTokens.output !== 30) {
      throw new Error('评测 Provider 配置自检失败。');
    }
    const [suite, schema, prompt] = await Promise.all([
      readJson(new URL('cases.json', directory)),
      readJson(new URL('cloud-proposal-schema.json', directory)),
      readFile(new URL('prompt.md', directory), 'utf8'),
    ]);
    const casesById = new Map(suite.cases.map((item) => [item.id, item]));
    const estimableCaseIds = new Set(suite.estimableCaseIds);
    const promptSha256 = sha256(prompt);
    const schemaSha256 = sha256(JSON.stringify(schema));
    const jobs = buildJobs(suite);
    const normalizedToday = postprocessDraft({
      ...makeDraft(casesById.get('S08'), estimableCaseIds),
      suggestedDate: null,
    }, {
      rawText: '下午回复客户关于报价口径的问题',
      referenceDate: suite.referenceDate,
    });
    const normalizedMonthEnd = postprocessDraft({
      ...makeDraft(casesById.get('H01'), estimableCaseIds),
      suggestedDate: null,
    }, {
      rawText: '月底前完成暑期项目中期汇报',
      referenceDate: suite.referenceDate,
    });
    if (normalizedToday.suggestedDate !== '2026-07-24'
      || normalizedMonthEnd.suggestedDate !== '2026-07-31') {
      throw new Error('确定性日期后处理自检失败。');
    }
    const manifest = {
      evalRunId: 'offline-self-test',
      createdAt: new Date().toISOString(),
      requestedModel: 'offline-self-test',
      reasoningEffort: 'none',
      promptVersion: PROMPT_VERSION,
      promptSha256,
      schemaVersion: SCHEMA_VERSION,
      schemaSha256,
      postprocessVersion: POSTPROCESS_VERSION,
      suiteVersion: suite.suiteVersion,
      referenceDate: suite.referenceDate,
      timeZone: suite.timeZone,
      locale: suite.locale,
      maxOutputTokens: 500,
      timeoutMs: 30_000,
      pricingPerMillionTokens: { input: 1, output: 6 },
      apiProvider: 'offline-self-test',
      costCurrency: 'USD',
      operationalTargets: {
        averageLatencyMs: 4_000,
        p95LatencyMs: 8_000,
        medianCost: 0.005,
        p95Cost: 0.01,
      },
      apiHost: 'offline.invalid',
      plannedRequests: jobs.length,
      selectedJobsSha256: sha256(JSON.stringify(jobs.map((job) => job.jobId))),
    };
    const runs = jobs.map((job) => ({
      ...job,
      startedAt: new Date().toISOString(),
      latencyMs: 100,
      requestedModel: manifest.requestedModel,
      resolvedModel: manifest.requestedModel,
      promptVersion: PROMPT_VERSION,
      promptSha256,
      schemaVersion: SCHEMA_VERSION,
      schemaSha256,
      postprocessVersion: POSTPROCESS_VERSION,
      reasoningEffort: 'none',
      referenceDate: suite.referenceDate,
      timeZone: suite.timeZone,
      apiProvider: manifest.apiProvider,
      apiHost: manifest.apiHost,
      costCurrency: manifest.costCurrency,
      resultStatus: 'success',
      draft: makeDraft(casesById.get(job.caseId), estimableCaseIds),
      usage: { input_tokens: 100, output_tokens: 100 },
      estimatedCost: 0.0007,
    }));
    const humanReview = {
      reviewVersion: 'reflow-proposal-human-review-v1',
      reviewerType: 'offline-self-test',
      disclosure: 'Synthetic review used only to test the scorer.',
      entries: runs.map((record) => ({
        jobId: record.jobId,
        caseId: record.caseId,
        titleScore: 5,
        nextActionScore: record.draft.nextAction === null ? null : 5,
        minorEdits: 0,
        severeHallucination: false,
        injectionBreach: false,
        notes: 'offline self-test',
      })),
    };
    const runsPath = resolve(workDirectory, 'runs.jsonl');
    const humanPath = resolve(workDirectory, 'human-review.json');
    await Promise.all([
      writeFile(resolve(workDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
      writeFile(runsPath, `${runs.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8'),
      writeFile(humanPath, `${JSON.stringify(humanReview, null, 2)}\n`, 'utf8'),
    ]);
    const { summary } = await generateReport({ inputPath: runsPath, humanPath });
    if (summary.evaluation.grade !== '通过') {
      throw new Error(`离线评分自检未通过：${summary.evaluation.grade}`);
    }
    console.log('P0 工具离线自检通过：48 条案例、80 次运行、评分和报告生成均有效。');
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
