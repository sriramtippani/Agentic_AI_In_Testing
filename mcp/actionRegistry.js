// dynamic logic here

import { expect } from '@playwright/test';

export const actionHandlers = {
  async fill(page, step) {
    await page.fill(step.target, step.value);
  },

  async click(page, step) {
    await page.click(step.target);
  },

  async waitFor(page, step) {
    await page.waitForSelector(step.target);
  },

  async assertText(page, step) {
    await expect(page.locator(step.target))
      .toHaveText(step.expected);
  },

  async assertVisible(page, step) {
    await expect(page.locator(step.target))
      .toBeVisible();
  },

  async assertUrl(page, step) {
    await expect(page)
      .toHaveURL(new RegExp(step.expected));
  },

  async scroll(page, step) {
    await page.locator(step.target)
      .scrollIntoViewIfNeeded();
  },

  async dragAndDrop(page, step) {
    await page.dragAndDrop(step.source, step.target);
  }
};
