import 'dotenv/config';
import { agent1 } from '../agents/agent1_ui_analyzer.js';
import { agent2 } from '../agents/agent2_test_generator.js';

const url = process.argv[2];
process.env.TEST_URL = url;

if (!url) {
  console.log('Usage: node runners/run-all.js <URL>');
  console.log('Example: node runners/run-all.js https://practicetestautomation.com/practice-test-login/');
  process.exit(1);
}

console.log('\n========================================')
console.log('Starting Agentic QA Flow')
console.log('========================================\n')

// Agent1: Analyze UI and generate test cases
await agent1(url);

// Agent2: Generate Playwright tests, execute, and handle failures (auto-triggers agent3)
await agent2();

console.log('\n========================================')
console.log('Agentic QA Flow Completed')
console.log('========================================\n')