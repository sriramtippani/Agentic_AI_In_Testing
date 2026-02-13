import { chromium } from '@playwright/test';
import { actionHandlers } from './actionRegistry.js';

export class BrowserController {
  async start(url) {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    // stability timeouts
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(120000);

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
  }

  async execute(step) {
    const handler = actionHandlers[step.action];

    if (!handler) {
      throw new Error(`Unsupported action: ${step.action}`);
    }

    await handler(this.page, step);
  }

  async runSteps(steps = []) {
    for (const step of steps) {
      await this.execute(step);
    }
  }

  async stop() {
    await this.browser.close();
  }
}
