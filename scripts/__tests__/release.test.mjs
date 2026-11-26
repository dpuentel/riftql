import { describe, expect, it } from 'vitest';
import {
  computeNextVersion,
  parseArgs,
  updateCargoLockVersion,
  updateCargoTomlVersion,
  updateJsonVersion,
} from '../release.mjs';

describe('release script helpers', () => {
  it('computes patch, minor, major, and explicit semver targets', () => {
    expect(computeNextVersion('0.2.0', 'patch')).toBe('0.2.1');
    expect(computeNextVersion('0.2.0', 'minor')).toBe('0.3.0');
    expect(computeNextVersion('0.2.0', 'major')).toBe('1.0.0');
    expect(computeNextVersion('0.2.0', '0.4.2')).toBe('0.4.2');
    expect(computeNextVersion('0.2.0', 'v0.5.0-rc.1')).toBe('0.5.0-rc.1');

    expect(() => computeNextVersion('0.2.0', '0.2.0')).toThrow(/matches current version/i);
    expect(() => computeNextVersion('0.2.0', 'invalid')).toThrow(/invalid release target/i);
  });

  it('parses CLI target and flags safely', () => {
    expect(parseArgs(['patch', '--dry-run', '--no-push'])).toEqual({
      target: 'patch',
      dryRun: true,
      noPush: true,
      skipChecks: false,
      allowDirty: false,
      help: false,
    });

    expect(parseArgs(['--', 'minor', '--skip-checks', '--allow-dirty'])).toEqual({
      target: 'minor',
      dryRun: false,
      noPush: false,
      skipChecks: true,
      allowDirty: true,
      help: false,
    });

    expect(() => parseArgs(['--unknown'])).toThrow(/unknown flag/i);
    expect(() => parseArgs(['patch', 'extra'])).toThrow(/extra argument/i);
  });

  it('updates package.json / tauri.conf.json without altering formatting', () => {
    const raw = '{\n  "productName": "RiftQL",\n  "version": "0.2.0",\n  "identifier": "com.riftql.app"\n}\n';
    const next = updateJsonVersion(raw, '0.2.1');
    expect(next).toBe(
      '{\n  "productName": "RiftQL",\n  "version": "0.2.1",\n  "identifier": "com.riftql.app"\n}\n',
    );
  });

  it('updates Cargo.toml [package] version without touching dependencies', () => {
    const raw = `[package]
name = "riftql"
version = "0.2.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
`;
    const next = updateCargoTomlVersion(raw, '0.3.0');
    expect(next).toContain('name = "riftql"\nversion = "0.3.0"');
    expect(next).toContain('serde = { version = "1", features = ["derive"] }');
  });

  it('updates only the riftql entry in Cargo.lock', () => {
    const raw = `[[package]]
name = "other-pkg"
version = "0.2.0"

[[package]]
name = "riftql"
version = "0.2.0"
dependencies = [
 "axum",
]
`;
    const next = updateCargoLockVersion(raw, '0.2.1');
    expect(next).toContain('name = "other-pkg"\nversion = "0.2.0"');
    expect(next).toContain('name = "riftql"\nversion = "0.2.1"');
  });
});
