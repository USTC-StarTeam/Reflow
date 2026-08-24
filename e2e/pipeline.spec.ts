import { expect, test, type Page } from '@playwright/test';

const taskText = '推进季度预算口径整理';

async function resetDemo(page: Page) {
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByTestId('reset-demo').click();
  await page.getByTestId('confirm-demo-reset-action').click();
  await expect(page.getByTestId('confirm-demo-reset')).toBeHidden();
}

async function selectTodayForProposal(page: Page, proposal: ReturnType<Page['locator']>) {
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await proposal.getByRole('button', { name: '选择日期', exact: true }).click();
  await page.getByTestId(`proposal-date-option-${today}`).click();
  await expect(page.getByTestId('proposal-date-picker')).toBeHidden();
  await proposal.getByRole('button', { name: '确认', exact: true }).click();
}

test('Web 文本捕捉经过 Proposal、决定、执行日志、回顾和刷新后保持可追踪', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);

  await page.getByTestId('quick-capture-input').fill(taskText);
  await page.getByTestId('quick-capture-submit').click();
  await expect(page.getByText('已保存，正在用本地规则整理，可以继续记录。')).toBeVisible();

  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: taskText });
  await expect(proposal).toHaveCount(1);
  await selectTodayForProposal(page, proposal);
  await expect(page.getByTestId('undo-decision')).toBeVisible();

  // UserDecision 是领域数据，接受后立即刷新仍应保留并可撤销。
  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();

  // 决策事件持久化前，允许撤销并恢复同一条 Proposal。
  await page.getByTestId('undo-decision').click();
  await expect(proposal).toHaveCount(1);
  await selectTodayForProposal(page, proposal);

  await page.getByTestId('nav-日历').click();
  const calendarEntry = page.locator('[data-testid^="calendar-entry-"]', { hasText: taskText });
  await expect(page.getByText('当天事项', { exact: true })).toBeVisible();
  await expect(calendarEntry).toBeVisible();

  // Today 一级不再承载执行操作；先完成唯一的 seed 当前任务，再从既有 Active 候选列表开始新任务。
  await page.getByTestId('nav-进行中').click();
  const currentTask = page.getByTestId('current-task-card');
  if (await currentTask.isVisible() && !await currentTask.getByText(taskText).isVisible()) {
    await page.getByTestId('complete-task').click();
  }
  await expect(currentTask).toBeHidden();
  const activeCandidate = page.locator('[data-testid^="active-candidate-"]', { hasText: taskText });
  await expect(activeCandidate).toBeVisible();
  await activeCandidate.getByRole('button', { name: '开始' }).click();
  await expect(page.getByTestId('current-task-card')).toContainText(taskText);
  await page.getByTestId('progress-input').fill('已核对预算假设');
  await page.getByTestId('record-progress').click();
  await page.getByTestId('pause-task').click();
  const pausedCandidate = page.locator('[data-testid^="active-candidate-"]', { hasText: taskText });
  await expect(pausedCandidate).toContainText('已暂停');
  await pausedCandidate.getByRole('button', { name: '继续' }).click();
  await expect(page.getByTestId('current-task-card')).toContainText(taskText);
  await page.getByTestId('complete-task').click();
  await expect(page.getByTestId('active-empty-state')).toBeVisible();
  await expect(page.locator('[data-testid^="active-candidate-"]', { hasText: taskText })).toHaveCount(0);

  await page.getByTestId('nav-日历').click();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible();
  await expect(calendarEntry).toBeVisible();
  await page.reload();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible();
  await expect(calendarEntry).toBeVisible();

  await page.getByTestId('nav-回顾').click();
  await expect(page.getByTestId('review-nightly')).toContainText('记录时间');

  await page.reload();
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText(taskText)).toBeVisible();
});

test('收件箱清晰展示等待建议、九种归类和可撤销的等待决定', async ({ page }) => {
  await page.goto('/inbox');
  await resetDemo(page);
  await page.getByTestId('nav-收件箱').click();

  const waitingProposal = page.getByTestId('proposal-proposal-waiting');
  await expect(page.getByText('待你确认')).toBeVisible();
  await expect(page.getByText('最近处理')).toBeHidden();
  await expect(waitingProposal).toContainText('等待供应商确认送货时间');
  await expect(waitingProposal).toContainText('等待他人 · 预计 10 分');
  await waitingProposal.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByTestId('follow-up-date-proposal-waiting').fill('2026-07-24');
  await page.getByRole('button', { name: '保存修改' }).last().click();
  await expect(page.getByTestId('follow-up-date-proposal-waiting')).toBeHidden();

  const contractProposal = page.getByTestId('proposal-proposal-contract');
  await contractProposal.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByTestId('proposal-classification-proposal-contract').click();
  for (const classification of ['work', 'communication', 'learning', 'life', 'health', 'waiting', 'someday', 'knowledge', 'unknown']) {
    await expect(page.getByTestId(`classification-option-${classification}`)).toBeVisible();
  }
  await page.getByTestId('classification-option-someday').click();
  await page.getByRole('button', { name: '保存修改' }).last().click();
  await expect(page.getByTestId('proposal-title-proposal-contract')).toBeHidden();
  await expect(contractProposal.getByRole('button', { name: '保存到稍后' })).toBeVisible();
  await contractProposal.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByTestId('proposal-classification-proposal-contract').click();
  await page.getByTestId('classification-option-knowledge').click();
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(contractProposal.getByRole('button', { name: '保存为知识' })).toBeVisible();

  await waitingProposal.getByRole('button', { name: '放入等待列表' }).click();
  await expect(page.getByText('最近处理')).toBeVisible();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.getByTestId('undo-decision').click();
  await expect(page.getByTestId('proposal-proposal-waiting')).toBeVisible();
});

test('已排期任务完成后在同一天合并展示计划与实际完成', async ({ page }) => {
  await page.goto('/active');
  await resetDemo(page);

  await expect(page.getByTestId('current-task-card')).toContainText('完成 Reflow Demo 页面结构');
  await page.getByTestId('complete-task').click();
  await page.getByTestId('nav-日历').click();

  const calendarEntry = page.getByTestId('calendar-entry-task-reflow-demo');
  await expect(page.getByText('已完成', { exact: true })).toBeVisible();
  await expect(calendarEntry).toContainText('完成 Reflow Demo 页面结构');
});

test('Today 任务详情可编辑、取消具体时间并开始执行', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);

  await page.getByTestId('open-today-task-task-client-quote').click();
  await expect(page.getByTestId('today-task-detail')).toBeVisible();
  await page.getByTestId('task-detail-title').fill('复核客户报价');
  await page.getByTestId('task-detail-duration').fill('45');
  await page.getByTestId('task-detail-next-action').fill('确认预算口径并回复客户');
  await page.getByTestId('open-task-schedule').click();
  await expect(page.getByTestId('discard-task-changes')).toBeVisible();
  await expect(page.getByTestId('schedule-date')).toBeHidden();
  await page.getByTestId('continue-editing-task').click();
  await page.getByTestId('save-task-details').click();

  await page.getByTestId('open-task-schedule').click();
  await expect(page.getByTestId('today-task-detail')).toBeHidden();
  await expect(page.getByTestId('schedule-date')).toBeVisible();
  await page.getByLabel('关闭排期').click();
  await expect(page.getByTestId('today-task-detail')).toBeVisible();

  await page.getByTestId('unschedule-task').click();
  await expect(page.getByTestId('task-detail-time')).toContainText('尚未安排具体时间');
  await page.getByRole('button', { name: '关闭' }).click();
  const dateOnlyTask = page.getByTestId('task-task-client-quote');
  await expect(dateOnlyTask).toContainText('复核客户报价');
  await expect(dateOnlyTask).toContainText('预计 45 分');
  await expect(dateOnlyTask).not.toContainText('16:00');

  await page.getByTestId('open-today-task-task-client-quote').click();
  await page.getByTestId('start-task-from-detail').click();
  await page.getByTestId('confirm-task-switch-action').click();
  await expect(page).toHaveURL(/\/active$/);
  await expect(page.getByTestId('current-task-card')).toContainText('复核客户报价');
});

test('Today 跨日期排期返回详情后保存日期不会清除具体时间', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await page.getByTestId('open-today-task-task-client-quote').click();
  await page.getByTestId('open-task-schedule').click();
  await page.getByTestId('schedule-date').fill(tomorrow);
  await page.getByTestId('schedule-time').fill('14:00');
  await page.getByTestId('schedule-duration').fill('45');
  await page.getByTestId('confirm-schedule').click();

  await expect(page.getByTestId('today-task-detail')).toBeVisible();
  await expect(page.getByTestId('task-detail-date')).toHaveValue(tomorrow);
  await expect(page.getByTestId('task-detail-time')).toContainText('14:00–14:45');
  await page.getByTestId('save-task-date').click();
  await expect(page.getByTestId('task-detail-time')).toContainText('14:00–14:45');
  await expect(page.getByTestId('discard-task-changes')).toBeHidden();
});

test('Today exact-time 跨日修改必须显式选择清除或重新排期', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await page.getByTestId('open-today-task-task-client-quote').click();
  await page.getByTestId('task-detail-date').fill(tomorrow);
  await page.getByTestId('save-task-date').click();
  await expect(page.getByTestId('confirm-task-date-change')).toBeVisible();
  const beforeConfirmation = await page.evaluate(() => JSON.parse(localStorage.getItem('reflow.demo.v1') ?? '{}').tasks.find((task: { id: string }) => task.id === 'task-client-quote'));
  expect(beforeConfirmation.plannedDate).not.toBe(tomorrow);
  expect(beforeConfirmation.plannedStartAt).toBeTruthy();

  await page.getByTestId('continue-editing-task-date').click();
  await expect(page.getByTestId('task-detail-date')).toHaveValue(tomorrow);
  await expect(page.getByTestId('task-detail-time')).toContainText('16:00–16:30');
  await page.getByTestId('save-task-date').click();
  await page.getByTestId('reschedule-task-date').click();
  await expect(page.getByTestId('schedule-date')).toHaveValue(tomorrow);
  await expect(page.getByTestId('schedule-time')).toHaveValue('16:00');
  await expect(page.getByTestId('schedule-duration')).toHaveValue('30');
  await page.getByTestId('confirm-schedule').click();

  await expect(page.getByTestId('today-task-detail')).toBeVisible();
  await expect(page.getByTestId('task-detail-date')).toHaveValue(tomorrow);
  await expect(page.getByTestId('task-detail-time')).toContainText('16:00–16:30');
  const afterSchedule = await page.evaluate(() => JSON.parse(localStorage.getItem('reflow.demo.v1') ?? '{}').tasks.find((task: { id: string }) => task.id === 'task-client-quote'));
  expect(afterSchedule.plannedDate).toBe(tomorrow);
  expect(afterSchedule.plannedStartAt).toContain(`${tomorrow}T16:00:00`);
  expect(afterSchedule.plannedEndAt).toContain(`${tomorrow}T16:30:00`);
});

test('点击排期先阻止冲突，用户明确确认后才写入并刷新保留', async ({ page }) => {
  const text = '推进时间规划验收说明';
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill(text);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: text });
  await selectTodayForProposal(page, proposal);
  await page.getByTestId('nav-今天').click();
  await expect(page.locator('[data-testid^="task-"]', { hasText: text })).toBeVisible();
  await page.getByTestId('nav-日历').click();
  const task = page.locator('[data-testid^="calendar-entry-"]', { hasText: text });
  await task.getByLabel(`安排 ${text}`, { exact: true }).click();
  await page.getByTestId('schedule-time').fill('10:30');
  await page.getByTestId('schedule-duration').fill('30');
  await page.getByTestId('confirm-schedule').click();
  await expect(page.getByTestId('schedule-conflict')).toContainText('完成 Reflow Demo 页面结构');
  await page.getByTestId('confirm-schedule-conflict').click();

  await page.getByTestId('nav-日历').click();
  const entry = page.locator('[data-testid^="calendar-entry-"]', { hasText: text });
  await expect(entry).toContainText('10:30');
  await page.reload();
  await expect(entry).toContainText('10:30');
});

test('本地备份通过验证预览后可以恢复', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);
  await page.getByRole('button', { name: '打开设置' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  if (!backupPath) throw new Error('expected a downloaded backup');

  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '打开设置' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-backup').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(backupPath);
  await expect(page.getByTestId('import-preview')).toContainText('条计划事件');
  await page.getByTestId('confirm-import-backup').click();
  await expect(page.getByText('备份已恢复，替换前的数据已保存为本地恢复副本。')).toBeVisible();
});

test('顺延后原日期回顾保留历史结果并在刷新后稳定', async ({ page }) => {
  await page.goto('/review');
  await resetDemo(page);
  await page.getByTestId('nav-回顾').click();
  const nightlySummary = page.getByTestId('review-nightly').getByText(/^回顾今天：/);
  const originalSummary = await nightlySummary.innerText();
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await page.getByTestId('nav-今天').click();
  await page.getByTestId('open-today-task-task-client-quote').click();
  await page.getByTestId('task-detail-date').fill(tomorrow);
  await page.getByTestId('save-task-date').click();
  await page.getByTestId('confirm-unscheduled-date-change').click();
  await page.getByRole('button', { name: '关闭' }).click();

  await page.getByTestId('nav-日历').click();
  await page.getByTestId(`calendar-day-${tomorrow}`).click();
  await expect(page.getByTestId('calendar-entry-task-client-quote')).toBeVisible();

  await page.getByTestId('nav-回顾').click();
  await expect(page.getByTestId('review-nightly').getByText(originalSummary, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('review-nightly').getByText(originalSummary, { exact: true })).toBeVisible();
});

test('Mock 模式不会请求 Cloud Gateway', async ({ page }) => {
  await fetch('http://127.0.0.1:8788/__reset', { method: 'POST' });
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill('验证本地规则不会访问网关');
  await page.getByTestId('quick-capture-submit').click();
  await expect(page.getByText('已保存，正在用本地规则整理，可以继续记录。')).toBeVisible();
  const count = await fetch('http://127.0.0.1:8788/__count').then((response) => response.json());
  expect(count.proposalRequests).toBe(0);
});
