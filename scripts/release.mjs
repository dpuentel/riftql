#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_CORE_RE = /^(\d+)\.(\d+)\.(\d+)/;
const EXPLICIT_SEMVER_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function computeNextVersion(currentVersion, target) {
  const trimmedTarget = String(target ?? '').trim();
  const coreMatch = String(currentVersion ?? '').trim().match(SEMVER_CORE_RE);
  if (!coreMatch) {
    throw new Error(`Invalid current version "${currentVersion}". Expected X.Y.Z semver.`);
  }

  let [, majorStr, minorStr, patchStr] = coreMatch;
  let major = Number(majorStr);
  let minor = Number(minorStr);
  let patch = Number(patchStr);

  let nextVersion;
  if (trimmedTarget === 'patch') {
    patch += 1;
    nextVersion = `${major}.${minor}.${patch}`;
  } else if (trimmedTarget === 'minor') {
    minor += 1;
    nextVersion = `${major}.${minor}.0`;
  } else if (trimmedTarget === 'major') {
    major += 1;
    nextVersion = `${major}.0.0`;
  } else {
    const explicitMatch = trimmedTarget.match(EXPLICIT_SEMVER_RE);
    if (!explicitMatch) {
      throw new Error(
        `Invalid release target "${target}". Use patch, minor, major, or explicit X.Y.Z.`,
      );
    }
    nextVersion = explicitMatch[1];
  }

  if (nextVersion === String(currentVersion).trim()) {
    throw new Error(`Target version ${nextVersion} matches current version.`);
  }

  return nextVersion;
}

export function parseArgs(argv) {
  const options = {
    target: null,
    dryRun: false,
    noPush: false,
    skipChecks: false,
    allowDirty: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-push') {
      options.noPush = true;
    } else if (arg === '--skip-checks') {
      options.skipChecks = true;
    } else if (arg === '--allow-dirty') {
      options.allowDirty = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag "${arg}". Run with --help for usage.`);
    } else if (!options.target) {
      options.target = arg;
    } else {
      throw new Error(`Unexpected extra argument "${arg}". Expected a single version target.`);
    }
  }

  return options;
}

export function updateJsonVersion(text, nextVersion) {
  const re = /(^\s*"version"\s*:\s*)"[^"]*"/m;
  if (!re.test(text)) {
    throw new Error('Could not locate "version" field in JSON manifest.');
  }
  return text.replace(re, `$1"${nextVersion}"`);
}

export function updateCargoTomlVersion(text, nextVersion) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let inPackage = false;
  let updated = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('[')) {
      inPackage = trimmed === '[package]';
      continue;
    }
    if (inPackage) {
      const m = lines[i].match(/^(\s*version\s*=\s*)"[^"]*"(.*)$/);
      if (m) {
        lines[i] = `${m[1]}"${nextVersion}"${m[2]}`;
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    throw new Error('Could not locate version under [package] in Cargo.toml.');
  }
  return lines.join(eol);
}

export function updateCargoLockVersion(text, nextVersion) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let isTargetPackage = false;
  let updated = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '[[package]]') {
      isTargetPackage = false;
      continue;
    }
    if (trimmed === 'name = "riftql"') {
      isTargetPackage = true;
      continue;
    }
    if (isTargetPackage) {
      const m = lines[i].match(/^(\s*version\s*=\s*)"[^"]*"(.*)$/);
      if (m) {
        lines[i] = `${m[1]}"${nextVersion}"${m[2]}`;
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    throw new Error('Could not locate package "riftql" version in Cargo.lock.');
  }
  return lines.join(eol);
}

function runCommand(cmd, args, { cwd, capture = false, shell = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || '').trim() : '';
    throw new Error(
      detail
        ? `${cmd} ${args.join(' ')} failed: ${detail}`
        : `${cmd} ${args.join(' ')} exited with code ${result.status}`,
    );
  }

  return capture ? result.stdout.trim() : '';
}

function runPnpm(args, rootDir) {
  const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return runCommand(pnpmBin, args, {
    cwd: rootDir,
    shell: process.platform === 'win32',
  });
}

function printHelp(currentVersion) {
  console.log(`RiftQL Release Automation (current version: v${currentVersion})

Usage:
  pnpm release <patch|minor|major|X.Y.Z|vX.Y.Z> [flags]

Flags:
  --dry-run       Preview the version bump and git steps without changing files
  --no-push       Commit and create the annotated tag locally without pushing
  --skip-checks   Skip running pnpm typecheck and pnpm test before releasing
  --allow-dirty   Allow running with uncommitted working tree changes
  -h, --help      Show this help message

Examples:
  pnpm release patch
  pnpm release minor --dry-run
  pnpm release 0.3.0 --no-push`);
}

function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkgPath = path.join(rootDir, 'package.json');
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  const cargoLockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock');

  const pkgText = fs.readFileSync(pkgPath, 'utf8');
  const currentVersion = JSON.parse(pkgText).version;

  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.target) {
    printHelp(currentVersion);
    return;
  }

  const nextVersion = computeNextVersion(currentVersion, opts.target);
  const tagName = `v${nextVersion}`;
  const files = [
    'package.json',
    'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
  ];

  console.log(`\nRiftQL release: v${currentVersion} -> ${tagName}`);

  if (opts.dryRun) {
    console.log('\n[dry-run] Planned actions (no files or git state modified):');
    console.log(`  1. Update version to "${nextVersion}" in:`);
    for (const file of files) {
      console.log(`     - ${file}`);
    }
    if (!opts.skipChecks) {
      console.log('  2. Run verification checks: pnpm typecheck, pnpm test');
    } else {
      console.log('  2. Skip verification checks (--skip-checks)');
    }
    console.log(`  3. git add ${files.join(' ')}`);
    console.log(`  4. git commit -m "chore(release): ${tagName}"`);
    console.log(`  5. git tag -a ${tagName} -m "Release ${tagName}"`);
    if (opts.noPush) {
      console.log('  6. Skip pushing to origin (--no-push)');
    } else {
      console.log(`  6. git push origin HEAD && git push origin ${tagName}`);
    }
    return;
  }

  if (!opts.allowDirty) {
    const status = runCommand('git', ['status', '--porcelain'], { cwd: rootDir, capture: true });
    if (status.length > 0) {
      throw new Error(
        'Working tree has uncommitted changes. Commit/stash them first or pass --allow-dirty.',
      );
    }
  }

  const tagCheck = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tagName}`], {
    cwd: rootDir,
    stdio: 'ignore',
  });
  if (tagCheck.status === 0) {
    throw new Error(`Git tag "${tagName}" already exists.`);
  }

  if (!opts.skipChecks) {
    console.log('\nRunning verification checks...');
    runPnpm(['typecheck'], rootDir);
    runPnpm(['test'], rootDir);
  }

  console.log(`\nUpdating manifests to ${nextVersion}...`);
  fs.writeFileSync(pkgPath, updateJsonVersion(pkgText, nextVersion), 'utf8');
  fs.writeFileSync(
    tauriConfPath,
    updateJsonVersion(fs.readFileSync(tauriConfPath, 'utf8'), nextVersion),
    'utf8',
  );
  fs.writeFileSync(
    cargoTomlPath,
    updateCargoTomlVersion(fs.readFileSync(cargoTomlPath, 'utf8'), nextVersion),
    'utf8',
  );
  fs.writeFileSync(
    cargoLockPath,
    updateCargoLockVersion(fs.readFileSync(cargoLockPath, 'utf8'), nextVersion),
    'utf8',
  );

  runCommand('git', ['add', ...files], { cwd: rootDir });
  runCommand('git', ['commit', '-m', `chore(release): ${tagName}`], { cwd: rootDir });
  runCommand('git', ['tag', '-a', tagName, '-m', `Release ${tagName}`], { cwd: rootDir });

  if (opts.noPush) {
    console.log(`\nCreated commit & annotated tag ${tagName} locally (--no-push).`);
    console.log('When ready to trigger the GitHub Release workflow, run:');
    console.log(`  git push origin HEAD`);
    console.log(`  git push origin ${tagName}`);
    return;
  }

  console.log(`\nPushing commit and tag ${tagName} to origin...`);
  runCommand('git', ['push', 'origin', 'HEAD'], { cwd: rootDir });
  runCommand('git', ['push', 'origin', tagName], { cwd: rootDir });

  console.log(`\nTriggered Release Binaries workflow for ${tagName}.`);
  console.log(`Once builds finish, publish the draft release via GitHub UI or:`);
  console.log(`  gh release edit ${tagName} --draft=false`);
}

const isCliEntry =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isCliEntry) {
  try {
    main();
  } catch (err) {
    console.error(`\nRelease failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
