import { createServer } from 'node:http';

let proposalRequests = 0;
let preflightRequests = 0;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.end(JSON.stringify(body));
}

function addLocalDay(date, amount) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return value.toISOString().slice(0, 10);
}

// These deterministic fixtures validate the Web pipeline and rendering only.
// They are not evidence of general Chinese ambiguity or multi-intent detection;
// fuzzy semantics belong to the real model and its acceptance tests.
function draftFor(request) {
  const rawText = request.capture.rawText;
  if (/(?:然后|并且|另外|再把|再去)/u.test(rawText)) {
    return {
      title: '请拆开输入多个事项',
      category: 'unknown',
      outcome: 'task',
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.35,
      reason: '检测到多个独立行动，请拆开后逐条输入。',
    };
  }
  if (/参赛材料|竞赛展示材料|信息不足/u.test(rawText)) {
    return {
      title: rawText,
      category: 'unknown',
      outcome: 'task',
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.3,
      reason: '信息不足，请补充要做的动作、时间或具体含义。',
    };
  }
  if (/经验|结论|记住/u.test(rawText)) {
    return {
      title: '评审前确认验收口径',
      category: 'work',
      outcome: 'knowledge',
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      waitingDetails: null,
      knowledgeSummary: '评审前先确认验收口径，可以减少返工。',
      confidence: 0.96,
      reason: '这是一条可复用的工作经验。',
    };
  }
  if (/以后有空|以后再|有空再|有时间再/u.test(rawText)) {
    return {
      title: rawText.replace(/^(?:以后有空|以后再|有空再|有时间再)/u, '').trim() || rawText,
      category: 'work',
      outcome: 'task',
      suggestedBucket: 'someday',
      suggestedDate: null,
      estimatedMinutes: 60,
      nextAction: '之后再明确安排时间',
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.9,
      reason: '输入明确表示以后有空再处理，建议保存到稍后。',
    };
  }
  if (/这周末|周末|下周|月底|下个月/u.test(rawText)) {
    return {
      title: rawText,
      category: 'learning',
      outcome: 'task',
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: 60,
      nextAction: '按主题整理学习笔记',
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.92,
      reason: '这是学习整理任务，但时间范围没有给出具体日期。',
    };
  }
  if (/整理项目复盘提纲/u.test(rawText)) {
    return {
      title: '整理项目复盘提纲',
      category: 'work',
      outcome: 'task',
      suggestedBucket: null,
      suggestedDate: null,
      estimatedMinutes: 45,
      nextAction: '列出复盘提纲的三个部分',
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.93,
      reason: '这是清晰的工作任务，但没有指定计划日期。',
    };
  }
  if (/明天下午.*Reflow.*进度.*汇报.*(?:一个小时|1小时|60分钟)/u.test(rawText)) {
    return {
      title: '整理 Reflow 进度并准备简要汇报',
      category: 'work',
      outcome: 'task',
      suggestedBucket: 'today',
      suggestedDate: addLocalDay(request.context.referenceDate, 1),
      estimatedMinutes: 60,
      nextAction: '汇总当前进度并列出给师兄的汇报要点',
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.94,
      reason: '包含明确的明天和一小时，以及可执行的汇报准备动作。',
    };
  }
  return {
    title: rawText.replace(/^(?:明天|今天)/u, '').trim(),
    category: 'work',
    outcome: 'task',
    suggestedBucket: rawText.includes('明天') || rawText.includes('今天') ? 'today' : null,
    suggestedDate: rawText.includes('明天')
      ? addLocalDay(request.context.referenceDate, 1)
      : rawText.includes('今天') ? request.context.referenceDate : null,
    estimatedMinutes: 45,
    nextAction: '列出验收说明的三个章节',
    waitingDetails: null,
    knowledgeSummary: null,
    confidence: 0.94,
    reason: '这是一个可执行的工作事项。',
  };
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { status: 'ok' });
    return;
  }
  if (req.method === 'GET' && req.url === '/__count') {
    json(res, 200, { proposalRequests, preflightRequests });
    return;
  }
  if (req.method === 'POST' && req.url === '/__reset') {
    proposalRequests = 0;
    preflightRequests = 0;
    json(res, 200, { status: 'ok' });
    return;
  }
  if (req.method === 'OPTIONS') {
    preflightRequests += 1;
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/proposals') {
    json(res, 404, { status: 'failure' });
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    proposalRequests += 1;
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.capture.rawText.includes('云端失败')) {
      json(res, 503, {
        status: 'failure',
        error: {
          code: 'proposal_unavailable',
          message: '模拟云端暂时不可用。',
          retryable: true,
        },
      });
      return;
    }
    json(res, 200, {
      status: 'success',
      schemaVersion: 1,
      draft: draftFor(request),
    });
  });
});

server.listen(8788, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
