import { existsSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const lockPath = '.next/dev/lock';
const projectRoot = resolve(process.cwd());

function readProcText(path: string): string {
  try {
    return readFileSync(path, 'utf8').replaceAll('\0', ' ');
  } catch {
    return '';
  }
}

function readProcArgs(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function hasCurrentProjectNextDevProcess(): boolean {
  if (!existsSync('/proc')) {
    return false;
  }

  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || entry === String(process.pid)) {
      continue;
    }

    const args = readProcArgs(`/proc/${entry}/cmdline`);
    const nextArgIndex = args.findIndex(
      (arg) => arg.endsWith('/next') || arg.endsWith('/next/dist/bin/next')
    );
    if (nextArgIndex < 0 || args[nextArgIndex + 1] !== 'dev') {
      continue;
    }

    try {
      if (resolve(readlinkSync(`/proc/${entry}/cwd`)) === projectRoot) {
        return true;
      }
    } catch {
      const environ = readProcText(`/proc/${entry}/environ`);
      if (environ.includes(`PWD=${projectRoot}`)) {
        return true;
      }
    }
  }

  return false;
}

if (existsSync(lockPath) && !hasCurrentProjectNextDevProcess()) {
  rmSync(lockPath);
  console.log(`Removed stale Next.js dev lock at ${lockPath}`);
}
