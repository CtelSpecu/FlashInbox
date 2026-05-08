import { spawnSync } from 'node:child_process';

const passthroughArgs = process.argv.slice(2);
const nextArgs = ['dev'];
let hasHostname = false;

for (let index = 0; index < passthroughArgs.length; index += 1) {
  const arg = passthroughArgs[index];

  if (arg === '--host') {
    nextArgs.push('--hostname', '127.0.0.1');
    hasHostname = true;
    continue;
  }

  if (arg === '-H' || arg === '--hostname') {
    nextArgs.push(arg);
    const value = passthroughArgs[index + 1];
    if (value) {
      nextArgs.push(value);
      index += 1;
    }
    hasHostname = true;
    continue;
  }

  if (arg.startsWith('--hostname=')) {
    nextArgs.push(arg);
    hasHostname = true;
    continue;
  }

  nextArgs.push(arg);
}

if (!hasHostname) {
  nextArgs.push('--hostname', process.env.NEXT_DEV_HOSTNAME?.trim() || '127.0.0.1');
}

for (const command of [
  ['bun', 'run', 'prepare:local-db'],
  ['bun', 'run', 'prepare:next-dev'],
  ['next', ...nextArgs],
] satisfies string[][]) {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
