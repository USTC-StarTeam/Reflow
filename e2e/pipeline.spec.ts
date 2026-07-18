import { expect, test, type Page } from '@playwright/test';

const taskText = '整理季度预算口径';

async function resetDemo(page: Page) {
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
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
  await proposal.getByRole('button', { name: '加入今天' }).click();
  await expect(page.getByTestId('undo-decision')).toBeVisible();

  // UserDecision 是领域数据，接受后立即刷新仍应保留并可撤销。
  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();

  // 决策事件持久化前，允许撤销并恢复同一条 Proposal。
  await page.getByTestId('undo-decision').click();
  await expect(proposal).toHaveCount(1);
  await proposal.getByRole('button', { name: '加入今天' }).click();

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
