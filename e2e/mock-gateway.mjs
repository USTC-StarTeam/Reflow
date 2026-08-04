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

function draftFor(request) {
  const rawText = request.capture.rawText;
  if (/信息不足/u.test(rawText)) {
    return {
      title: '待补充的事项',
      category: 'unknown',
      outcome: 'task',
      suggestedBucket: 'today',
      suggestedDate: null,
      estimatedMinutes: null,
      nextAction: null,
      waitingDetails: null,
      knowledgeSummary: null,
      confidence: 0.35,
      reason: '信息不足，需要补充具体行动和背景。',
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
  return {
    title: rawText.replace(/^(?:明天|今天)/u, '').trim(),
    category: 'work',
    outcome: 'task',
    suggestedBucket: 'today',
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
