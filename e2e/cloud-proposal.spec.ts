import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:8082' });

async function resetDemo(page: Page) {
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('reset-demo')).toBeHidden();
}

test('Cloud Capture 进入收件箱，编辑确认后建议日期写入任务并刷新保留', async ({ page }) => {
  const input = '明天整理云端验收说明';
  const editedTitle = '整理云端验收说明并核对';
  await page.goto('/');
  await resetDemo(page);

  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await expect(page.getByText('已交给云端 AI 整理，请到收件箱确认。')).toBeVisible();
  await page.getByTestId('nav-收件箱').click();

  let proposal = page.locator('[data-testid^="proposal-"]', { hasText: '整理云端验收说明' });
  await expect(proposal).toContainText('云端 AI');
  await expect(proposal).toContainText('2026-07-25');

  // Pending Proposal 属于领域数据，刷新后仍应存在，但正式任务尚未出现。
  await page.reload();
  proposal = page.locator('[data-testid^="proposal-"]', { hasText: '整理云端验收说明' });
  await expect(proposal).toHaveCount(1);
  await proposal.getByRole('button', { name: '修改', exact: true }).click();
  await proposal.locator('[data-testid^="proposal-title-"]').fill(editedTitle);
  await proposal.locator('[data-testid^="proposal-minutes-"]').fill('50');
  await proposal.locator('[data-testid^="proposal-next-action-"]').fill('列出三个验收章节');
  await proposal.getByRole('button', { name: '完成修改' }).click();
  await proposal.getByRole('button', { name: '确认并安排到 2026-07-25' }).click();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await expect(page.locator('[data-testid^="recent-decision-"]', { hasText: editedTitle }))
    .toContainText('已安排到 7月25日');

  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.getByTestId('nav-日历').click();
  await page.getByTestId('calendar-day-2026-07-25').click();
  await expect(page.locator('[data-testid^="calendar-entry-"]', { hasText: editedTitle }))
    .toContainText('2026-07-25');
});

test('Cloud Knowledge Proposal 只在用户确认后创建知识卡片', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill('经验：评审前先确认验收口径');
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();

  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: '评审前确认验收口径' });
  await expect(proposal).toContainText('知识沉淀');
  await expect(proposal).toContainText('云端 AI');
  await proposal.getByRole('button', { name: '保存为知识' }).click();
  await page.getByTestId('nav-回顾').click();
  await expect(page.getByText('评审前确认验收口径', { exact: true })).toBeVisible();
  await expect(page.getByText('评审前先确认验收口径，可以减少返工。')).toBeVisible();
});

test('Cloud 失败保留 Capture，用户明确选择本地规则后恢复', async ({ page }) => {
  const input = '云端失败测试事项';
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await expect(page.getByTestId('quick-capture-error')).toContainText('模拟云端暂时不可用');

  await page.getByTestId('nav-收件箱').click();
  const failed = page.locator('[data-testid^="failed-capture-"]', { hasText: input });
  await expect(failed).toContainText('暂未能整理这条输入');
  await failed.getByRole('button', { name: '使用本地规则整理' }).click();

  const recovered = page.locator('[data-testid^="proposal-"]', { hasText: input });
  await expect(recovered).toContainText('本地规则');
  await page.reload();
  await expect(page.locator('[data-testid^="proposal-"]', { hasText: input })).toContainText('本地规则');
});
