// Mock test để kiểm tra prompt
const { spawn } = require('child_process');

console.log('=== TESTING GENERATE-DOCS ===');

// Mock OpenAI response để kiểm tra prompt
process.env.GEMINI_API_KEY = 'mock_key';

// Chạy generate-docs với diff test
const child = spawn('node', ['packages/cli/dist/index.js', 'generate-docs', '--feature', 'Test Feature', '--output', 'test_output.md', '--diff-command', 'git diff HEAD~1..HEAD'], {
  stdio: 'pipe',
  env: { ...process.env, GEMINI_API_KEY: 'mock_key' }
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('STDOUT:', data.toString());
});

child.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('STDERR:', data.toString());
});

child.on('close', (code) => {
  console.log(`\n=== TEST COMPLETE (Exit code: ${code}) ===`);
  console.log('STDOUT:', stdout.substring(0, 500) + '...');
  console.log('STDERR:', stderr.substring(0, 500) + '...');
});
