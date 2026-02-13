import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '../config/geminiConfig.js';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY missing. Add it in .env file in project root.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MAX_RETRY = 1;

// Helper: delete folder recursively
function deleteFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

// Helper: delete file safely
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Helper: keep only logs/index.txt and delete rest logs/*
function cleanLogsKeepIndexOnly() {
  const logsDir = 'logs';

  if (!fs.existsSync(logsDir)) return;

  const files = fs.readdirSync(logsDir);

  for (const file of files) {
    const fullPath = path.join(logsDir, file);

    // keep only index.txt
    if (file !== 'index.txt') {
      try {
        fs.rmSync(fullPath, { force: true });
      } catch (e) {
        // ignore
      }
    }
  }
}

// Extract failing spec file path from Playwright log
function extractSpecFilePath(logText) {
  const match = logText.match(/tests[\\/][^\s]+\.spec\.js/);
  return match ? match[0].replace(/\\/g, '/') : null;
}

export async function agent3() {
  const logPath = 'logs/playwright-failures.log';
  const retryFile = 'logs/retry-count.txt';

  // If no failure log => nothing to do
  if (!fs.existsSync(logPath)) {
    console.log('Agent-3: No failures detected. All tests passed');
    return;
  }

  let retryCount = 0;
  if (fs.existsSync(retryFile)) {
    retryCount = Number(fs.readFileSync(retryFile, 'utf-8'));
  }

  const failureLog = fs.readFileSync(logPath, 'utf-8');

  console.log('\n========================================');
  console.log('Agent-3: Failure detected');
  console.log('========================================\n');
  console.log(`Agent-3: Retry count = ${retryCount}`);

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  // Gemini structured analysis
  const analysisPrompt = `
You are a Senior QA Automation Engineer.

Analyze this Playwright failure log and respond in EXACT format:

Failure Type: <Locator Issue | Assertion Failure | Application Bug | Test Data Issue | Environment / Timing Issue>
Reason: <1 line>
Retry: <YES or NO>
FixTest: <YES or NO>

Rules:
- Retry means rerun without changes.
- FixTest means rewrite the test code.
- Return plain text only.

Failure Log:
${failureLog}
`;

  const analysisRes = await model.generateContent(analysisPrompt);
  const analysis = analysisRes.response.text().trim();

  fs.mkdirSync('logs', { recursive: true });

  fs.appendFileSync(
    'logs/agent3-decisions.log',
    `\n--- FAILURE ANALYSIS ---\n${analysis}\n`
  );

  console.log('\nAgent-3 Analysis:\n');
  console.log(analysis);

  // Decide FixTest
  const fixTest =
    analysis.toLowerCase().includes('fixtest: yes') ||
    analysis.toLowerCase().includes('failure type: assertion failure') ||
    analysis.toLowerCase().includes('failure type: locator issue');

  // Extract failing spec file
  const testFilePath = extractSpecFilePath(failureLog);

  if (!testFilePath) {
    console.log('Agent-3: Could not find failing spec file in log. Stopping.');
    return;
  }

  console.log(`\nAgent-3: Failing file = ${testFilePath}`);

  if (!fs.existsSync(testFilePath)) {
    console.log(`Agent-3: Spec file does not exist: ${testFilePath}`);
    return;
  }

  // 4) If fix needed => rewrite spec
  if (fixTest) {
    console.log('\nAgent-3: FixTest = YES → rewriting spec file...');

    const currentCode = fs.readFileSync(testFilePath, 'utf-8');

    const fixPrompt = `
You are a Playwright JavaScript automation expert.

Fix the failing test file below using the failure log.

FAILURE LOG:
${failureLog}

CURRENT TEST CODE:
${currentCode}

IMPORTANT:
- Return ONLY the full corrected JavaScript code
- No markdown
- No explanation
- Keep imports + describe + hooks
- Fix only the failing assertion/locator
`;

    const fixRes = await model.generateContent(fixPrompt);
    let fixedCode = fixRes.response.text().trim();

    fixedCode = fixedCode
      .replace(/```javascript/gi, '')
      .replace(/```js/gi, '')
      .replace(/```/g, '')
      .trim();

    if (!fixedCode.includes('test(') || !fixedCode.includes('import')) {
      console.log('Agent-3: Gemini returned invalid code. Skipping rewrite.');
      return;
    }

    // backup
    fs.writeFileSync(`${testFilePath}.backup`, currentCode);

    // rewrite
    fs.writeFileSync(testFilePath, fixedCode);

    console.log('Agent-3: ✅ Spec file rewritten successfully');
  } else {
    console.log('\nAgent-3: FixTest = NO → not rewriting spec file');
  }

  // Retry once
  if (retryCount < MAX_RETRY) {
    console.log('\nAgent-3: Retrying failed tests once...\n');
    fs.writeFileSync(retryFile, String(retryCount + 1));

    try {
      execSync('npx playwright test --last-failed', { stdio: 'inherit' });

      console.log('\nAgent-3: ✅ Retry SUCCESS');

      // Cleanup logs on success
      deleteFile(logPath);
      deleteFile(retryFile);

      // Write final summary
      fs.writeFileSync(
        'logs/index.txt',
        `Execution Summary
-----------------
Retry Attempts Used: ${retryCount + 1}
Final Status: PASSED_AFTER_RETRY

Failure Analysis:
${analysis}
`
      );

      // ==============================
      // ✅ NEW CLEANUP LOGIC (YOUR REQUIREMENT)
      // ==============================

      console.log('\nAgent-3: Cleanup started...');

      // delete screenshots folder (if you created it)
      deleteFolder('screenshots');

      // delete logs folder files EXCEPT index.txt
      cleanLogsKeepIndexOnly();

      console.log('Agent-3: Cleanup completed.');
      console.log('Only HTML report + logs/index.txt kept.');

    } catch (e) {
      console.log('\nAgent-3: ❌ Retry FAILED');

      const retryOutput =
        e.stdout?.toString() || e.stderr?.toString() || e.message;

      fs.appendFileSync(
        logPath,
        `\n\n=== RETRY FAILED OUTPUT ===\n${retryOutput}\n`
      );

      fs.writeFileSync(
        'logs/index.txt',
        `Execution Summary
-----------------
Retry Attempts Used: ${retryCount + 1}
Final Status: FAILED

Failure Analysis:
${analysis}

Retry Output:
${retryOutput}
`
      );

      // Do NOT cleanup on failure (we need logs + screenshots)
      console.log('\nAgent-3: Keeping logs + screenshots for debugging.');
    }
  }
}