import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:8082' });

async function resetDemo(page: Page) {
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('reset-demo')).toBeHidden();
}

async function browserLocalDateAfter(page: Page, days: number) {
  return page.evaluate((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, days);
}

test('Cloud Capture 进入收件箱，编辑确认后建议日期写入任务并刷新保留', async ({ page }) => {
  const input = '明天整理云端验收说明';
  const editedTitle = '整理云端验收说明并核对';
  await page.goto('/');
  await resetDemo(page);
  const tomorrow = await browserLocalDateAfter(page, 1);
  const [, month, day] = tomorrow.split('-').map(Number);
  const tomorrowLabel = `${month}月${day}日`;

  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await expect(page.getByText('已交给云端 AI 整理，请到收件箱确认。')).toBeVisible();
  await page.getByTestId('nav-收件箱').click();

  let proposal = page.locator('[data-testid^="proposal-"]', { hasText: '整理云端验收说明' });
  await expect(proposal).toContainText(tomorrowLabel);

  // Pending Proposal 属于领域数据，刷新后仍应存在，但正式任务尚未出现。
  await page.reload();
  proposal = page.locator('[data-testid^="proposal-"]', { hasText: '整理云端验收说明' });
  await expect(proposal).toHaveCount(1);
  await proposal.getByRole('button', { name: '修改', exact: true }).click();
  await page.locator('[data-testid^="proposal-title-"]:visible').fill(editedTitle);
  await page.locator('[data-testid^="proposal-minutes-"]:visible').fill('50');
  await page.locator('[data-testid^="proposal-next-action-"]:visible').fill('列出三个验收章节');
  await page.getByRole('button', { name: '保存修改' }).click();
  await proposal.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await expect(page.locator('[data-testid^="recent-decision-"]', { hasText: editedTitle }))
    .toContainText(`已安排到 ${month}月${day}日`);

  await page.reload();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.getByTestId('nav-日历').click();
  await page.getByTestId(`calendar-day-${tomorrow}`).click();
  await expect(page.getByText(`选中 · ${tomorrowLabel}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="calendar-entry-"]', { hasText: editedTitle })).toBeVisible();
});

test('Cloud Knowledge Proposal 只在用户确认后创建知识卡片', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill('经验：评审前先确认验收口径');
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();

  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: '评审前确认验收口径' });
  await expect(proposal).toContainText('知识沉淀');
  await proposal.getByRole('button', { name: '保存为知识' }).click();
  await page.getByTestId('nav-回顾').click();
  await expect(page.getByTestId('review-knowledge')).toContainText('当前已保存 3 张知识卡片');
});

test('Cloud UI 保留 Gateway 返回的模糊 Proposal，补充后仍需主动选择日期', async ({ page }) => {
  const input = '竞赛展示材料';
  const editedTitle = '整理竞赛展示材料';
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();

  let proposal = page.locator('[data-testid^="proposal-"]', { hasText: input });
  await expect(proposal).toContainText('未识别');
  await expect(proposal.getByRole('button', { name: '补充信息' })).toBeVisible();

  // Pending Proposal 尚未转成正式任务。
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText('待补充的事项', { exact: true })).toHaveCount(0);
  await page.getByTestId('nav-收件箱').click();

  proposal = page.locator('[data-testid^="proposal-"]', { hasText: input });
  await proposal.getByRole('button', { name: '补充信息' }).click();
  const dateButton = page.locator('[data-testid^="proposal-date-"]:visible');
  await expect(dateButton).toContainText('选择日期');

  await page.locator('[data-testid^="proposal-classification-"]:visible').click();
  await page.getByTestId('classification-option-work').click();
  await page.locator('[data-testid^="proposal-title-"]:visible').fill(editedTitle);
  await page.locator('[data-testid^="proposal-minutes-"]:visible').fill('30');
  await page.locator('[data-testid^="proposal-next-action-"]:visible').fill('确认背景并完成处理');
  const tomorrow = await browserLocalDateAfter(page, 1);
  await dateButton.click();
  await page.getByTestId(`proposal-date-option-${tomorrow}`).click();
  await expect(page.locator('[data-testid^="proposal-date-"]:visible')).toContainText(/月.*日/);
  await expect(page.locator('[data-testid^="recent-decision-"]')).toHaveCount(0);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(proposal).toContainText(/月.*日/);
  await expect(page.locator('[data-testid^="recent-decision-"]')).toHaveCount(0);
  await proposal.getByRole('button', { name: '确认', exact: true }).click();

  await page.getByTestId('nav-日历').click();
  await page.getByTestId(`calendar-day-${tomorrow}`).click();
  await expect(page.locator('[data-testid^="calendar-entry-"]', { hasText: editedTitle })).toBeVisible();
});

test('Cloud 清晰无日期任务不默认 today，选择日期前不创建 Task', async ({ page }) => {
  const input = '整理项目复盘提纲';
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();

  let proposal = page.locator('[data-testid^="proposal-"]', { hasText: input });
  await expect(proposal).toContainText('工作推进');
  await expect(proposal.getByRole('button', { name: '选择日期', exact: true })).toBeVisible();
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText(input, { exact: true })).toHaveCount(0);
  await page.getByTestId('nav-收件箱').click();

  proposal = page.locator('[data-testid^="proposal-"]', { hasText: input });
  const tomorrow = await browserLocalDateAfter(page, 1);
  await proposal.getByRole('button', { name: '选择日期', exact: true }).click();
  await page.getByTestId(`proposal-date-option-${tomorrow}`).click();
  await expect(proposal.getByRole('button', { name: '确认', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="recent-decision-"]')).toHaveCount(0);
  await proposal.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByTestId('undo-decision')).toBeVisible();
  await page.getByTestId('nav-日历').click();
  await page.getByTestId(`calendar-day-${tomorrow}`).click();
  await expect(page.locator('[data-testid^="calendar-entry-"]', { hasText: input })).toBeVisible();
});

test('Cloud 明确今天使用本地今天并可确认', async ({ page }) => {
  const input = '今天整理项目周报';
  await page.goto('/');
  await resetDemo(page);
  const today = await browserLocalDateAfter(page, 0);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: '整理项目周报' });
  const [, month, day] = today.split('-').map(Number);
  await expect(proposal).toContainText(`${month}月${day}日`);
  await proposal.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText('整理项目周报', { exact: true })).toBeVisible();
});

test('Cloud 模糊未来范围不补具体日期，确认前不创建 Task', async ({ page }) => {
  const input = '这周末梳理学习笔记';
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: input });
  await expect(proposal.getByRole('button', { name: '选择日期', exact: true })).toBeVisible();
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText(input, { exact: true })).toHaveCount(0);
});

test('Cloud UI 展示 Gateway 返回的多意图拆分提示且确认前不创建任务', async ({ page }) => {
  const input = '周末把 Agent 资料整理一下，再把排协网站首页也重新整理一下';
  await page.goto('/');
  await resetDemo(page);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: '请拆开' });
  await expect(proposal).toHaveCount(1);
  await expect(proposal).toContainText('请拆开');
  await expect(proposal).toContainText('未识别');
  await expect(proposal.getByRole('button', { name: '补充信息' })).toBeVisible();
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText('Agent 资料', { exact: false })).toHaveCount(0);
  await expect(page.getByText('排协网站首页', { exact: false })).toHaveCount(0);
});

test('Cloud 下个月不是稍后，明确以后有空才保存到稍后', async ({ page }) => {
  await page.goto('/');
  await resetDemo(page);

  await page.getByTestId('quick-capture-input').fill('下个月把个人主页重新整理一下');
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  let proposal = page.locator('[data-testid^="proposal-"]', { hasText: '下个月把个人主页重新整理一下' });
  await expect(proposal.getByRole('button', { name: '保存到稍后' })).toHaveCount(0);

  await page.getByTestId('nav-今天').click();
  await page.getByTestId('quick-capture-input').fill('以后有空把个人主页重新弄一下');
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  proposal = page.locator('[data-testid^="proposal-"]', { hasText: '个人主页重新弄一下' });
  await expect(proposal).toContainText('稍后处理');
  await expect(proposal).toContainText('预计 60 分');
  await expect(proposal.getByRole('button', { name: '保存到稍后' })).toBeVisible();
});

test('Cloud 明天加明确 60 分钟保留日期、时长与可编辑确认边界', async ({ page }) => {
  const input = '明天下午把 Reflow 目前的进度整理一下，准备一份给师兄看的简要汇报，大概一个小时';
  await page.goto('/');
  await resetDemo(page);
  const tomorrow = await browserLocalDateAfter(page, 1);
  const [, month, day] = tomorrow.split('-').map(Number);
  await page.getByTestId('quick-capture-input').fill(input);
  await page.getByTestId('quick-capture-submit').click();
  await page.getByTestId('nav-收件箱').click();
  const proposal = page.locator('[data-testid^="proposal-"]', { hasText: '整理 Reflow 进度' });
  await expect(proposal).toContainText(`${month}月${day}日`);
  await expect(proposal).toContainText('预计 60 分');
  await expect(proposal.getByRole('button', { name: '确认', exact: true })).toBeVisible();
  await page.getByTestId('nav-今天').click();
  await expect(page.getByText('整理 Reflow 进度并准备简要汇报', { exact: true })).toHaveCount(0);
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
  await expect(recovered).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-testid^="proposal-"]', { hasText: input })).toBeVisible();
});
