// REQUIRED: File system operations (create folders, read/write files)
import fs from 'fs';

// REQUIRED: Gemini AI SDK to generate test cases
import { GoogleGenerativeAI } from '@google/generative-ai';

// REQUIRED: Browser automation to scrape UI elements
import { BrowserController } from '../mcp/browserController.js';

// REQUIRED: Gemini model configuration
import { GEMINI_MODEL } from '../config/geminiConfig.js';

// REQUIRED: Validate API key exists before execution
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY missing. Add it in .env file in project root.');
}

// REQUIRED: Initialize Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// REQUIRED: Read positive test data from testdata/data.txt
let positiveTestData = '';
try {
  positiveTestData = fs.readFileSync('testdata/data.txt', 'utf-8');
} catch (error) {
  console.log('Warning: testdata/data.txt not found. Test cases will be generated without reference data.');
}

export async function agent1(url) {
  const browser = new BrowserController();
  
  try {
    // REQUIRED: Launch browser with timeout handling
    await browser.start(url);
    console.log(`Page loaded: ${url}`);

    // REQUIRED: Wait for DOM content to fully load with 30s timeout
    await browser.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    console.log('DOM content loaded');
    
    // REQUIRED: Additional wait for dynamic content (AJAX, React, etc.)
    await browser.page.waitForTimeout(2000);
    console.log('Dynamic content loaded');

  } catch (error) {
    await browser.stop();
    throw new Error(`Page failed to load within 30 seconds. URL: ${url}\nReason: ${error.message}`);
  }

  // REQUIRED: Extract UI elements (inputs, buttons, links) for Gemini to analyze
  const ui = await browser.page.evaluate(() => ({
    title: document.title, // REQUIRED: Used for unique filename
    url: window.location.href, // REQUIRED: Context for test cases
    inputs: [...document.querySelectorAll('input')].map(i => ({
      id: i.id, // REQUIRED: Element identifier for test steps
      name: i.name, // REQUIRED: Alternative identifier
      type: i.type, // REQUIRED: Input type (text, password, email, etc.)
      placeholder: i.placeholder // REQUIRED: Hints about expected input
    })),
    buttons: [...document.querySelectorAll('button,input[type=submit]')].map(b => ({
      text: b.innerText, // REQUIRED: Button label for test steps
      id: b.id, // REQUIRED: Element identifier
      type: b.type // REQUIRED: Button type
    })),
    links: [...document.querySelectorAll('a')].map(a => ({
      text: a.innerText, // REQUIRED: Link text
      href: a.href // REQUIRED: Link destination
    }))
  }));

  // REQUIRED: Close browser to free resources
  await browser.stop();

  // REQUIRED: Create doc folder if not exists
  fs.mkdirSync('doc', { recursive: true });

  // REQUIRED: Generate unique filename from page title
  const cleanTitle = ui.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const filename = `doc/${cleanTitle}_testcases.txt`;

  // REQUIRED: Check if file exists to handle append vs create
  let existingContent = '';
  let existingScenarios = [];
  
  if (fs.existsSync(filename)) {
    console.log(`File exists: ${filename}`);
    console.log('Reading existing test cases to avoid duplicates...');
    
    // REQUIRED: Read existing file content
    existingContent = fs.readFileSync(filename, 'utf-8');
    
    // REQUIRED: Extract existing scenarios to prevent duplicates
    const scenarioMatches = existingContent.matchAll(/Scenario: (.+)/g);
    existingScenarios = Array.from(scenarioMatches, m => m[1].trim().toLowerCase());
    
    console.log(`Found ${existingScenarios.length} existing test cases`);
  }

  // REQUIRED: Build duplicate prevention section for Gemini prompt
  const duplicateCheckPrompt = existingScenarios.length > 0 
    ? `\n\nEXISTING TEST SCENARIOS (DO NOT DUPLICATE THESE):\n${existingScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nGenerate ONLY NEW test cases that are different from the above.`
    : '';

  // REQUIRED: Create prompt instructing Gemini how to generate test cases
  const promptText = `
                      You are a Senior QA Engineer responsible for QA sign-off.

                      Analyze the UI elements provided and generate COMPREHENSIVE FUNCTIONAL TEST CASES covering ALL scenarios for production readiness.

                      CRITICAL RULES:
                      1. Generate AT LEAST 5 test cases (maximum requirement)
                      2. NO DUPLICATE test cases - each test case must be UNIQUE
                      3. Generate test cases in this STRICT ORDER:
                        - First: ALL Positive scenarios (use EXACT positive test data provided below)
                        - Second: ALL Negative scenarios (analyze positive data and create INVALID variations)
                        - Third: ALL Edge cases (analyze positive data and create BOUNDARY values)
                      4. Each test case MUST start with "TestCase ID: TC" followed by 3-digit number (TC001, TC002, etc.)
                      5. NO JSON, NO markdown, NO code blocks, NO extra formatting
                      6. Plain English only
                      7. EMBED test data directly in test steps
                      8. Analyze UI elements and map test data fields dynamically

                      Test Case Categories:
                      - Positive scenarios: Use EXACT positive test data, successful flows, expected behavior
                      - Negative scenarios: Invalid data (empty, wrong format, SQL injection(only if required), XSS(only if required), special chars)
                      - Edge cases: Boundary data (min/max length, special chars, unicode(only if required), whitespace, null)

                      POSITIVE TEST DATA (use exactly as-is for positive scenarios):
                      ${positiveTestData}

                      For Negative & Edge cases, intelligently generate variations based on field types:
                      - Text fields: empty, SQL injection(only if required), XSS(only if required), special chars, very long strings
                      - Password fields: empty, weak passwords, mismatched passwords, special chars
                      - Email fields: invalid format, missing @, multiple @, no domain
                      - Number fields: negative, zero, decimal, very large, non-numeric
                      - Date fields: invalid format, past dates, future dates, leap year edge cases
                      - Dropdowns: unselected, invalid options
                      - Checkboxes: unchecked when required
                      - Any field: null, undefined, whitespace only, unicode, boundary values

                      MANDATORY FORMAT:

                      TestCase ID: TC001
                      Scenario: [clear unique description based on UI functionality]
                      Type: Positive
                      Test Data: [field1]: [value1], [field2]: [value2], ...

                      Steps:
                      1. [action step with embedded data from UI elements]
                      2. [action step]

                      Expected Result: [what should happen]

                      ---

                      TestCase ID: TC002
                      Scenario: [clear unique description for negative case]
                      Type: Negative
                      Test Data: [field1]: [invalid_value1], [field2]: [invalid_value2], ...

                      Steps:
                      1. [action step with invalid data]
                      2. [action step]

                      Expected Result: [error message or validation failure]

                      ---

                      TestCase ID: TC003
                      Scenario: [clear unique description for edge case]
                      Type: Edge
                      Test Data: [field1]: [boundary_value1], [field2]: [boundary_value2], ...

                      Steps:
                      1. [action step with boundary data]
                      2. [action step]

                      Expected Result: [expected behavior at boundaries]

                      ---
                      ${duplicateCheckPrompt}

                      UI Snapshot (analyze these elements to generate test cases):
                      ${JSON.stringify(ui, null, 2)}
                    `;

  // REQUIRED: Call Gemini API to generate test cases
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const response = await model.generateContent(promptText);
  let generatedText = response.response.text().trim();
  
  // REQUIRED: Remove markdown code blocks (```) that Gemini sometimes adds
  generatedText = generatedText.replace(/```[a-z]*\n?/g, '').trim();

  // REQUIRED: Validate that test cases were generated
  if (!generatedText || generatedText.length === 0) {
    console.log(' Agent-1: No testcases generated. Raw response:');
    console.log(generatedText);
    return;
  }

  // REQUIRED: Renumber test cases sequentially (Gemini sometimes skips numbers)
  let tcCounter = existingScenarios.length + 1;
  generatedText = generatedText.replace(/TestCase ID: TC\d{3}/g, () => {
    return `TestCase ID: TC${String(tcCounter++).padStart(3, '0')}`;
  });

  // REQUIRED: Handle append vs create based on file existence
  if (existingContent) {
    // REQUIRED: Append new test cases to existing file
    fs.appendFileSync(filename, `\n\n${generatedText}`);
    console.log(`Appended to: ${filename}`);
  } else {
    // REQUIRED: Create new file with test cases
    fs.writeFileSync(filename, generatedText);
    console.log(`Created: ${filename}`);
  }
  
  // REQUIRED: Count and display summary for user feedback
  const newTestcaseCount = (generatedText.match(/TestCase ID:/gi) || []).length;
  const totalCount = existingScenarios.length + newTestcaseCount;
  
  console.log(`Agent-1: Generated ${newTestcaseCount} new testcases`);
  console.log(`Total testcases in file: ${totalCount}`);
}
