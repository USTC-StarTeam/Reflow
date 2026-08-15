import { expect, test } from '@playwright/test';

const PRIMARY_KEY = 'reflow.demo.v1';
const RECOVERY_KEY = 'reflow.demo.v4.recovery';

test('new local storage starts empty and corrupt copies require an explicit empty start', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('quick-capture-input')).toBeVisible();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), PRIMARY_KEY)).not.toBeNull();
  const firstStart = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), PRIMARY_KEY);
  expect(firstStart).toMatchObject({ tasks: [], captures: [], proposals: [], decisions: [] });

  await page.evaluate(([primary, recovery]) => {
    window.localStorage.setItem(primary, '{broken');
    window.localStorage.setItem(recovery, JSON.stringify({ version: 99 }));
  }, [PRIMARY_KEY, RECOVERY_KEY]);
  await page.reload();

  await expect(page.getByTestId('recovery-failure')).toBeVisible();
  await expect(page.getByTestId('quick-capture-input')).toBeHidden();
  await expect.poll(() => page.evaluate(([primary, recovery]) => [window.localStorage.getItem(primary), window.localStorage.getItem(recovery)], [PRIMARY_KEY, RECOVERY_KEY]))
    .toEqual(['{broken', JSON.stringify({ version: 99 })]);

  await page.getByTestId('start-empty-personal-space').click();
  await expect(page.getByTestId('quick-capture-input')).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), PRIMARY_KEY))
    .toMatchObject({ tasks: [], captures: [], proposals: [], decisions: [] });
});
