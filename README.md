# Agentic_AI_In_Testing
# 🤖 Agentic AI Test Automation Framework (Playwright + JavaScript + Gemini)

This project is a Proof of Concept (POC) demonstrating **Agentic AI-based UI Test Automation** using:
- **Playwright (UI automation)**
- **JavaScript (Node.js)**
- **Gemini AI (Google Generative AI API)**

The framework runs **multiple AI agents** in sequence:
1. **Agent-1** analyzes the website and generates test scenarios.
2. **Agent-2** converts scenarios into Playwright test scripts and executes them.
3. **Agent-3** debugs failures using AI and retries tests (auto-debug flow).
---

## ✅ Requirements (Install Before Running)

### 1) Install Node.js
Recommended: **Node.js 20**
Check:
```bash
node -v
npm -v

▶️ How to Run the Project
1) Install dependencies
npm install

2) Install Playwright browsers (one-time)
npx playwright install

3) Run all agents with a URL
npm start -- https://practicetestautomation.com/practice-test-login/

✅ Why npm start -- URL ?

Your package.json contains:

"scripts": {
  "start": "node runners/run-all.js"
}

So when you run: npm start -- https://example.com

The URL is passed to Node.js as: process.argv[2]

Your runners/run-all.js reads this URL and triggers Agent-1 → Agent-2 → Agent-3.

📌 Where Reports Are Generated?
Playwright HTML Report
After execution, report will be available at: reports/playwright-report/

To open the report: npx playwright show-report reports/playwright-report

📌 Where Logs Are Stored?
Logs will be stored inside: logs/ folder


⚠️ Common Issues & Fixes
1) Gemini key not found

Make sure .env exists and contains:

GEMINI_API_KEY=xxxx

2) Playwright browsers missing

Run: npx playwright install

3) Dependency issues

Clean install:

rm -rf node_modules package-lock.json
npm install
