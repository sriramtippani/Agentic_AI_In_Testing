// Import Node.js file system module for file operations
import fs from 'fs';

// Import Google Generative AI SDK for Gemini API
import { GoogleGenerativeAI } from '@google/generative-ai';

// Import Gemini model configuration
import { GEMINI_MODEL } from '../config/geminiConfig.js';

// Import child_process to execute Playwright tests
import { execSync } from 'child_process';

// Import agent3 for failure debugging
import { agent3 } from './agent3_failure_debugger.js';

// Check if GEMINI_API_KEY exists in environment variables
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY missing. Add it in .env file in project root.');
}

// Initialize Google Generative AI client with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper: safe delete folder
function safeDeleteFolder(folderPath) {
  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`🧹 Deleted old folder: ${folderPath}`);
    }
  } catch (err) {
    console.log(`⚠️ Could not delete folder: ${folderPath}`);
    console.log(err.message);
  }
}

// Export async function agent2 - main test generator function
export async function agent2() {
  console.log('\n========================================');
  console.log('Testing Agent-2...');
  console.log('========================================\n');

  // ✅ Clean old report before execution
  safeDeleteFolder('reports/playwright-report');

  // ✅ Clean old screenshots
  safeDeleteFolder('screenshots');

  // ✅ Clean old test-results (Playwright keeps last-failed here)
  safeDeleteFolder('test-results');

  // ✅ Ensure folders exist
  fs.mkdirSync('tests', { recursive: true });
  fs.mkdirSync('logs', { recursive: true });
  fs.mkdirSync('screenshots', { recursive: true });

  // Read all files from 'doc' folder and filter only .txt files
  const allFiles = fs.readdirSync('doc').filter(f => f.endsWith('.txt'));

  if (allFiles.length === 0) {
    console.log('❌ No test case files found in doc/ folder');
    return;
  }

  // Sort files by modified time
  const fileStats = allFiles.map(f => ({
    name: f,
    mtime: fs.statSync(`doc/${f}`).mtime
  }));

  fileStats.sort((a, b) => b.mtime - a.mtime);

  // Latest file only
  const latestFile = fileStats[0].name;

  console.log('---');
  console.log(`Found ${allFiles.length} file(s), processing latest: ${latestFile}`);

  // ✅ IMPORTANT: declare testFileName OUTSIDE if block
  const testFileName = latestFile.replace('_testcases.txt', '.spec.js');
  const testFilePath = `tests/${testFileName}`;

  // Check if spec exists
  const testFileExists = fs.existsSync(testFilePath);

  // Generate spec if missing
  if (!testFileExists) {
    console.log(`\n⚠️  Test file not found: ${testFilePath}`);
    console.log('Generating test file from test cases...\n');

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const content = fs.readFileSync(`doc/${latestFile}`, 'utf-8');
    const testCases = content.split(/(?=TestCase ID:)/i).filter(tc => tc.trim());

    const batchPrompt = `
                            Convert ALL these test cases into standard Playwright JavaScript code.

                            CRITICAL REQUIREMENTS:
                            1. Use Playwright's page fixture
                            2. Use expect for assertions
                            3. Return ONLY test() functions
                            4. NO markdown
                            5. NO explanations
                            6. Generate one test() function per test case
                            7. Always do page.goto(process.env.TEST_URL) inside each test
                            8. Always end every JS line with semicolon
                            9. Never join two strings accidentally

                            Test Cases:
                            ${testCases.join('\n---\n')}

                            Generate code in this format for EACH test case:

                            test('TC001: Description', async ({ page }) => {
                              await page.goto(process.env.TEST_URL);
                              await page.fill('#username', 'student');
                              await page.click('#submit');
                              await expect(page).toHaveURL(/success/);
                            });

                            Output ALL test functions:
                        `;

    console.log(`Processing ${testCases.length} test cases in batch (1 API call)...`);

    const res = await model.generateContent(batchPrompt);
    let raw = res.response.text().trim();

    // Remove markdown blocks if Gemini adds
    raw = raw
      .replace(/```javascript\n?/gi, '')
      .replace(/```js\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    if (!raw.includes('test(')) {
      console.log('❌ No valid test code generated. Raw response preview:');
      console.log(raw.substring(0, 800));
      return;
    }

    // Extract test blocks
    const testPattern = /test\([^)]+\)[^{]*\{[\s\S]*?^\}\);/gm;
    let allTestBlocks = Array.from(raw.matchAll(testPattern), m => m[0]);

    // Fallback extraction
    if (allTestBlocks.length === 0) {
      console.log('⚠️ No valid test blocks extracted. Trying alternative extraction...');
      allTestBlocks = raw.split(/(?=test\()/g).filter(p => p.trim().startsWith('test('));
    }

    if (allTestBlocks.length === 0) {
      console.log('❌ No valid test code extracted');
      return;
    }

    console.log(`✓ Generated ${allTestBlocks.length} test cases`);

    const suiteName = latestFile.replace('_testcases.txt', '').replace(/_/g, ' ');

    // Final spec file content
    const testFileContent = `import { test, expect } from '@playwright/test';

test.describe('${suiteName}', () => {

  test.beforeAll(async () => {
    console.log('\\n Suite Setup: ${suiteName}\\n');
  });

  test.afterAll(async () => {
    console.log('\\n Suite Teardown: ${suiteName}\\n');
  });

  test.afterEach(async ({ page }, testInfo) => {
    const status = testInfo.status === 'passed' ? '✅' : '❌';
    console.log(\`\${status} \${testInfo.title} - \${testInfo.status}\`);

    if (testInfo.status !== testInfo.expectedStatus) {
      const cleanTitle = testInfo.title.replace(/[^a-zA-Z0-9]/g, '_');
      await page.screenshot({ path: \`screenshots/\${cleanTitle}.png\` });
    }
  });

${allTestBlocks.join('\n\n')}

});
`;

    fs.writeFileSync(testFilePath, testFileContent);
    console.log(`✓ Test file created: ${testFilePath}\n`);
  } else {
    console.log(`✓ Using existing test file: ${testFilePath}`);
  }

  // Execute the generated test file
  console.log('\n========================================');
  console.log('Executing Test Suite...');
  console.log('========================================\n');

  try {
    // IMPORTANT:
    // - Use config file to ensure report goes into reports/playwright-report
    // - Use pipe so we capture output for logs
    const result = execSync(
      `npx playwright test --config=playwright.config.js ${testFilePath}`,
      {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: 'pipe'
      }
    );

    console.log(result);

    console.log('\n========================================');
    console.log('✓ All Tests Passed Successfully!');
    console.log('========================================\n');

    console.log('✓ HTML report generated in: reports/playwright-report');
    console.log('Open: reports/playwright-report/index.html\n');

  } catch (error) {
    console.log('\n========================================');
    console.log('❌ Some Tests Failed');
    console.log('Triggering Agent-3 for failure analysis...');
    console.log('========================================\n');

    // capture full failure output
    const failureOutput =
      error.stdout?.toString() ||
      error.stderr?.toString() ||
      error.message ||
      'Unknown failure';

    console.log('\n=== CAPTURED FAILURE OUTPUT ===\n');
    console.log(failureOutput);
    console.log('\n=== END FAILURE OUTPUT ===\n');

    // save failure log for Agent-3
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const logEntry = `
========================================
FAILURE LOG
Timestamp: ${new Date().toLocaleString()}
========================================

${failureOutput}
`;

    fs.writeFileSync('logs/playwright-failures.log', logEntry);
    fs.writeFileSync(`logs/failure-history-${timestamp}.log`, logEntry);

    console.log('✓ Failure log written: logs/playwright-failures.log');

    // Trigger Agent-3
    console.log('🚀 Agent-2: Calling Agent-3 now...\n');
    await agent3();

    console.log('\n✓ HTML report available in: reports/playwright-report');
    console.log('Open: reports/playwright-report/index.html\n');
  }

  console.log('---');
  console.log('Agent-2 complete.');
}
