import { xray } from '../src/xray.js';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: xray <repo-url> [--output <path>] [--timeout <seconds>]

Examples:
  xray https://github.com/user/repo
  xray user/repo
  xray https://github.com/user/repo --output ./report.html
  xray user/repo --timeout 600
`);
  process.exit(0);
}

const repoUrl = args[0]!;
let outputPath: string | undefined;
let timeout: number | undefined;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    outputPath = args[++i];
  } else if (args[i] === '--timeout' && args[i + 1]) {
    timeout = parseInt(args[++i]!) * 1000;
  }
}

xray({ repoUrl, outputPath, timeout })
  .then((path) => {
    console.log(`\nDone! Report at: ${path}`);
  })
  .catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
