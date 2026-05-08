import { existsSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const devDir = '.next/dev';
const lockPath = '.next/dev/lock';
const appPathsManifestPath = '.next/dev/server/app-paths-manifest.json';
const projectRoot = resolve(process.cwd());
const requiredDevRoutes = [
  '/(admin)/admin/(panel)/page',
  '/(admin)/admin/(auth)/login/page',
  '/api/user/domains/route',
];

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

if (existsSync(appPathsManifestPath) && !hasCurrentProjectNextDevProcess()) {
  try {
    const manifest = JSON.parse(readFileSync(appPathsManifestPath, 'utf8')) as Record<string, unknown>;
    const missingRoutes = requiredDevRoutes.filter((route) => !(route in manifest));

    if (missingRoutes.length > 0) {
      rmSync(devDir, { recursive: true, force: true });
      console.log(`Removed incomplete Next.js dev cache; missing routes: ${missingRoutes.join(', ')}`);
    }
  } catch {
    rmSync(devDir, { recursive: true, force: true });
    console.log(`Removed unreadable Next.js dev cache at ${devDir}`);
  }
}
