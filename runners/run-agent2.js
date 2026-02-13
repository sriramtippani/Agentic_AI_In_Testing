import 'dotenv/config';
import { agent2 } from '../agents/agent2_test_generator.js';

console.log('Testing Agent-2...');
console.log('---');

await agent2();

console.log('---');
console.log('Agent-2 complete. Check tests/ folder and HTML report.');