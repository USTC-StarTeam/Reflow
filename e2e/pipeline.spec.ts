import { expect, test, type Page } from '@playwright/test';

const taskText = '推进季度预算口径整理';

async function resetDemo(page: Page) {
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('reset-demo')).toBeHidden();
}

test('Web 文本捕捉经过 Proposal、决定、执行日志、回顾和刷新后保持可追踪', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);

  await page.getByTestId('quick-capture-input').fill(taskText);
  await page.getByTestId('quick-capture-submit').click();
  await expect(page.getByText('已交给 Mock AI 整理，请到收件箱确认。')).toBeVisible();

  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: taskText });
  await expect(proposal).toHaveCount(1);
  await proposal.getByRole('button', { name: '确认并加入今天' }).click();
  await expect(page.getByTestId('undo-decision')).toBeVisible();

  // UserDecision 是领域数据，接受后立即刷新仍应保留并可撤销。
  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();

  // 决策事件持久化前，允许撤销并恢复同一条 Proposal。
  await page.getByTestId('undo-decision').click();
  await expect(proposal).toHaveCount(1);
  await proposal.getByRole('button', { name: '确认并加入今天' }).click();

  await page.getByTestId('nav-今天').click();
  const todayTask = page.locator('[data-testid^="task-"]', { hasText: taskText });
  await todayTask.getByRole('button', { name: `开始 ${taskText}` }).click();

  await page.getByTestId('nav-进行中').click();
  await expect(page.getByTestId('current-task-card')).toContainText(taskText);
  await page.getByTestId('progress-input').fill('已核对预算假设');
  await page.getByTestId('record-progress').click();
  await page.getByTestId('record-time').click();
  await page.getByTestId('complete-task').click();

  await page.getByTestId('nav-回顾').click();
  await expect(page.getByTestId('review-summary')).toContainText('记录');

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
  await expect(page.getByText('最近处理')).toBeVisible();
  await expect(waitingProposal).toContainText('等师兄回复比赛方向');
  await expect(waitingProposal).toContainText('AI 归类结果');
  await expect(waitingProposal).toContainText('目前无需你行动，等对方回复或处理后再继续。');
  await expect(waitingProposal).toContainText('师兄');
  await expect(waitingProposal).toContainText('确认比赛方向');

  await waitingProposal.getByRole('button', { name: '设置跟进时间' }).click();
  await page.getByTestId('follow-up-date-proposal-waiting').fill('2026-07-24');
  await page.getByRole('button', { name: '保存日期' }).click();
  await expect(waitingProposal).toContainText('2026-07-24');

  const contractProposal = page.getByTestId('proposal-proposal-contract');
  await contractProposal.getByTestId('proposal-classification-proposal-contract').click();
  for (const classification of ['work', 'communication', 'learning', 'life', 'health', 'waiting', 'someday', 'knowledge', 'unknown']) {
    await expect(page.getByTestId(`classification-option-${classification}`)).toBeVisible();
  }
  await page.getByTestId('classification-option-someday').click();
  await expect(contractProposal.getByRole('button', { name: '保存到稍后' })).toBeVisible();
  await contractProposal.getByTestId('proposal-classification-proposal-contract').click();
  await page.getByTestId('classification-option-knowledge').click();
  await expect(contractProposal.getByRole('button', { name: '保存为知识' })).toBeVisible();

  await waitingProposal.getByRole('button', { name: '放入等待列表' }).click();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.getByTestId('undo-decision').click();
  await expect(page.getByTestId('proposal-proposal-waiting')).toBeVisible();
});
