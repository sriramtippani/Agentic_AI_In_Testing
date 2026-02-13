import 'dotenv/config';
import { agent1 } from '../agents/agent1_ui_analyzer.js';

const url = process.argv[2];

if (!url) {
  console.log('Usage: node runners/run-agent1.js <URL>');
  console.log('Example: node runners/run-agent1.js https://practicetestautomation.com/practice-test-login/');
  process.exit(1);
}

console.log('Testing Agent-1...');
console.log('URL:', url);
console.log('---');

await agent1(url);

console.log('---');
console.log('Agent-1 test complete. Check doc/ folder for output.');