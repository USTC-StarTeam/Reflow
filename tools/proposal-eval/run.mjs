import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildJobs,
  calculateCost,
  extractRefusal,
  extractResponseText,
  parseCliArgs,
  POSTPROCESS_VERSION,
  postprocessDraft,
  PROMPT_VERSION,
  readJson,
  SCHEMA_VERSION,
  schemaForOpenAI,
  sha256,
  validateDraft,
  validateSuite,
} from './lib.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '..', '..');
const args = parseCliArgs(process.argv.slice(2));
const suitePath = resolve(directory, 'cases.json');
const schemaPath = resolve(directory, 'cloud-proposal-schema.json');
const promptPath = resolve(directory, 'prompt.md');

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function numberOption(name, fallback) {
  const value = args[name] ?? process.env[`REFLOW_EVAL_${name.replaceAll('-', '_').toUpperCase()}`];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} 必须是正数。`);
  return parsed;
}

function resolveResponsesUrl() {
  const direct = args['responses-url'] ?? process.env.OPENAI_RESPONSES_URL;
  if (direct) return String(direct);
  const base = args['base-url']
    ?? process.env.OPENAI_BASE_URL
    ?? process.env.OPENAI_API_BASE;
  if (!base) return 'https://api.openai.com/v1/responses';
  return `${String(base).replace(/\/+$/, '')}/responses`;
}

function safeApiError(status, body) {
  const code = typeof body?.error?.code === 'string' ? body.error.code : `http_${status}`;
  const type = typeof body?.error?.type === 'string' ? body.error.type : 'api_error';
  const messages = {
    400: 'OpenAI 拒绝了评测请求，请检查请求格式。',
    401: 'OpenAI 认证失败，请检查本地 API Key。',
    403: '当前 API Key 无权访问所请求的模型或接口。',
    404: '未找到所请求的模型或接口。',
    409: 'OpenAI 请求发生冲突，请稍后重试。',
    429: 'OpenAI 请求达到速率或配额限制。',
    500: 'OpenAI 服务暂时异常。',
    502: 'OpenAI 上游网关暂时异常。',
    503: 'OpenAI 服务暂时不可用。',
    504: 'OpenAI 请求超时。',
  };
  const message = messages[status] ?? 'OpenAI API 请求失败。';
  return { code, type, message };
}

async function loadCompletedJobs(path) {
  try {
    const content = await readFile(path, 'utf8');
    return new Set(content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).jobId));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function loadExistingManifest(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertCompatibleManifest(existing, current) {
  const immutableFields = [
    'requestedModel',
    'reasoningEffort',
    'promptVersion',
    'promptSha256',
    'schemaVersion',
    'schemaSha256',
    'postprocessVersion',
    'suiteVersion',
    'referenceDate',
    'timeZone',
    'locale',
    'maxOutputTokens',
    'timeoutMs',
    'apiHost',
    'apiProvider',
    'costCurrency',
    'selectedJobsSha256',
  ];
  const differences = immutableFields.filter((field) => existing[field] !== current[field]);
  const oldPricing = JSON.stringify(existing.pricingPerMillionTokens);
  const newPricing = JSON.stringify(current.pricingPerMillionTokens);
  if (oldPricing !== newPricing) differences.push('pricingPerMillionTokens');
  const oldTargets = JSON.stringify(existing.operationalTargets);
  const newTargets = JSON.stringify(current.operationalTargets);
  if (oldTargets !== newTargets) differences.push('operationalTargets');
  if (differences.length) {
    throw new Error(
      `输出目录已有不同配置的结果（${differences.join(', ')}）。`
      + '请使用新的 --output 目录，禁止把不同 Prompt、Schema、模型或参数混写。',
    );
  }
}

async function main() {
  const [suite, schema, prompt] = await Promise.all([
    readJson(suitePath),
    readJson(schemaPath),
    readFile(promptPath, 'utf8'),
  ]);
  const suiteValidation = validateSuite(suite);
  if (!suiteValidation.valid) throw new Error(`评测集无效：\n${suiteValidation.errors.join('\n')}`);

  const allJobs = buildJobs(suite);
  let jobs = allJobs;
  if (args.case) jobs = jobs.filter((job) => job.caseId === args.case);
  if (args.cases) {
    const selectedCases = new Set(String(args.cases).split(',').map((value) => value.trim()).filter(Boolean));
    jobs = jobs.filter((job) => selectedCases.has(job.caseId));
  }
  if (args.limit) jobs = jobs.slice(0, numberOption('limit', allJobs.length));
  if (!jobs.length) throw new Error('没有匹配的评测任务。');

  const model = String(args.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.6-terra');
  const reasoningEffort = String(args.reasoning ?? process.env.OPENAI_REASONING_EFFORT ?? 'high');
  const timeoutMs = numberOption('timeout-ms', 30_000);
  const maxOutputTokens = numberOption('max-output-tokens', 4_096);
  const inputPrice = numberOption('input-price', 5);
  const outputPrice = numberOption('output-price', 30);
  const apiUrl = resolveResponsesUrl();
  const apiHost = new URL(apiUrl).host;
  const apiProvider = String(
    args.provider
      ?? process.env.REFLOW_EVAL_PROVIDER
      ?? (apiHost === 'api.openai.com' ? 'openai' : 'third-party-compatible'),
  );
  const costCurrency = String(
    args['cost-currency'] ?? process.env.REFLOW_EVAL_COST_CURRENCY ?? 'USD',
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(costCurrency)) throw new Error('--cost-currency 必须是三个大写字母的货币代码。');
  const defaultCostScale = costCurrency === 'CNY' ? 7 : 1;
  const operationalTargets = {
    averageLatencyMs: numberOption('average-latency-target-ms', 4_000),
    p95LatencyMs: numberOption('p95-latency-target-ms', 8_000),
    medianCost: numberOption('median-cost-target', 0.005 * defaultCostScale),
    p95Cost: numberOption('p95-cost-target', 0.01 * defaultCostScale),
  };
  const promptHash = sha256(prompt);
  const schemaHash = sha256(JSON.stringify(schema));

  if (args['dry-run']) {
    console.log(JSON.stringify({
      status: 'ready',
      suiteVersion: suite.suiteVersion,
      uniqueCases: suite.cases.length,
      standardCases: suite.cases.filter((item) => item.difficulty === 'standard').length,
      hardCases: suite.cases.filter((item) => item.difficulty === 'hard').length,
      injectionCases: suite.cases.filter((item) => item.injection === true).length,
      totalPlannedRequests: allJobs.length,
      selectedRequests: jobs.length,
      model,
      reasoningEffort,
      promptVersion: PROMPT_VERSION,
      promptSha256: promptHash,
      schemaVersion: SCHEMA_VERSION,
      schemaSha256: schemaHash,
      apiHost,
      apiProvider,
      costCurrency,
      pricingPerMillionTokens: { input: inputPrice, output: outputPrice },
      operationalTargets,
    }, null, 2));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 OPENAI_API_KEY。请只在本地环境变量中配置，不要写入仓库或对话。');
  }

  const outputDirectory = resolve(root, String(args.output ?? `artifacts/proposal-eval/${timestampForPath()}`));
  const runsPath = resolve(outputDirectory, 'runs.jsonl');
  const manifestPath = resolve(outputDirectory, 'manifest.json');
  await mkdir(outputDirectory, { recursive: true });

  const manifestConfig = {
    evalRunId: outputDirectory.split(/[\\/]/).at(-1),
    requestedModel: model,
    reasoningEffort,
    promptVersion: PROMPT_VERSION,
    promptSha256: promptHash,
    schemaVersion: SCHEMA_VERSION,
    schemaSha256: schemaHash,
    postprocessVersion: POSTPROCESS_VERSION,
    suiteVersion: suite.suiteVersion,
    referenceDate: suite.referenceDate,
    timeZone: suite.timeZone,
    locale: suite.locale,
    maxOutputTokens,
    timeoutMs,
    pricingPerMillionTokens: { input: inputPrice, output: outputPrice },
    apiHost,
    apiProvider,
    costCurrency,
    operationalTargets,
    plannedRequests: jobs.length,
    selectedJobsSha256: sha256(JSON.stringify(jobs.map((job) => job.jobId))),
  };
  const existingManifest = await loadExistingManifest(manifestPath);
  if (existingManifest) {
    assertCompatibleManifest(existingManifest, manifestConfig);
  } else {
    const manifest = { ...manifestConfig, createdAt: new Date().toISOString() };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  const completedJobs = await loadCompletedJobs(runsPath);

  const apiSchema = schemaForOpenAI(schema);
  let finished = jobs.filter((job) => completedJobs.has(job.jobId)).length;
  for (const job of jobs) {
    if (completedJobs.has(job.jobId)) continue;
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let record;
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: reasoningEffort },
          max_output_tokens: maxOutputTokens,
          input: [
            { role: 'developer', content: prompt },
            {
              role: 'user',
              content: JSON.stringify({
                referenceDate: suite.referenceDate,
                timeZone: suite.timeZone,
                locale: suite.locale,
                capture: { rawText: job.input, source: 'webText' },
              }),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'reflow_cloud_proposal_draft',
              strict: true,
              schema: apiSchema,
            },
          },
        }),
      });
      const body = await response.json().catch(() => null);
      const latencyMs = Math.round(performance.now() - started);
      if (!response.ok) {
        record = {
          ...job,
          startedAt,
          latencyMs,
          requestedModel: model,
          resolvedModel: body?.model ?? null,
          promptVersion: PROMPT_VERSION,
          promptSha256: promptHash,
          schemaVersion: SCHEMA_VERSION,
          schemaSha256: schemaHash,
          reasoningEffort,
          referenceDate: suite.referenceDate,
          timeZone: suite.timeZone,
          apiProvider,
          apiHost,
          costCurrency,
          resultStatus: 'api_error',
          apiStatus: response.status,
          error: safeApiError(response.status, body),
          usage: body?.usage ?? null,
          estimatedCost: calculateCost(body?.usage, inputPrice, outputPrice),
        };
      } else {
        const refusal = extractRefusal(body);
        const outputText = extractResponseText(body);
        let rawDraft = null;
        let draft = null;
        let parseError = null;
        if (!refusal) {
          try {
            rawDraft = JSON.parse(outputText);
            draft = postprocessDraft(rawDraft, {
              rawText: job.input,
              referenceDate: suite.referenceDate,
            });
          } catch (error) {
            parseError = error instanceof Error ? error.message : 'invalid_json';
          }
        }
        const validation = draft === null
          ? { valid: false, schemaValid: false, domainValid: false, errors: [refusal ? '模型拒绝。' : `JSON 解析失败：${parseError}`] }
          : validateDraft(draft);
        record = {
          ...job,
          startedAt,
          latencyMs,
          requestedModel: model,
          resolvedModel: body?.model ?? null,
          responseId: body?.id ?? null,
          promptVersion: PROMPT_VERSION,
          promptSha256: promptHash,
          schemaVersion: SCHEMA_VERSION,
          schemaSha256: schemaHash,
          reasoningEffort,
          referenceDate: suite.referenceDate,
          timeZone: suite.timeZone,
          apiProvider,
          apiHost,
          costCurrency,
          resultStatus: refusal ? 'refusal' : validation.valid ? 'success' : 'invalid_output',
          responseStatus: body?.status ?? null,
          incompleteReason: body?.incomplete_details?.reason ?? null,
          refusal,
          rawDraft,
          draft,
          validation,
          usage: body?.usage ?? null,
          estimatedCost: calculateCost(body?.usage, inputPrice, outputPrice),
        };
      }
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      record = {
        ...job,
        startedAt,
        latencyMs,
        requestedModel: model,
        resolvedModel: null,
        promptVersion: PROMPT_VERSION,
        promptSha256: promptHash,
        schemaVersion: SCHEMA_VERSION,
        schemaSha256: schemaHash,
        reasoningEffort,
        referenceDate: suite.referenceDate,
        timeZone: suite.timeZone,
        apiProvider,
        apiHost,
        costCurrency,
        resultStatus: error?.name === 'AbortError' ? 'timeout' : 'network_error',
        error: {
          code: error?.name === 'AbortError' ? 'timeout' : 'network_error',
          message: error instanceof Error ? error.message.slice(0, 300) : '未知网络错误',
        },
        usage: null,
        estimatedCost: null,
      };
    } finally {
      clearTimeout(timeout);
    }
    await appendFile(runsPath, `${JSON.stringify(record)}\n`, 'utf8');
    finished += 1;
    console.log(`[${finished}/${jobs.length}] ${job.jobId}: ${record.resultStatus} (${record.latencyMs}ms)`);
  }

  console.log(`P0 原始结果已写入：${runsPath}`);
  console.log(`下一步：node tools/proposal-eval/score.mjs --input "${runsPath}"`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
