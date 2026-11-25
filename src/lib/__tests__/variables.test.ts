import { describe, expect, it } from 'vitest';
import {
  findVariableMatches,
  resolveVariables,
  stripSecretsForExport,
} from '@/lib/variables';
import type { EnvironmentRecord, EnvironmentVariable } from '@/types/storage';

const makeEnv = (
  id: string,
  name: string,
  isGlobal: boolean,
  variables: EnvironmentVariable[],
): EnvironmentRecord => ({
  id,
  name,
  isGlobal,
  variables,
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
});

describe('variables resolution', () => {
  const globalEnv = makeEnv('g1', 'Global', true, [
    { id: '1', key: 'base_url', value: 'https://global.example.com', isSecret: false, enabled: true },
    { id: '2', key: 'global_only', value: 'gval', isSecret: false, enabled: true },
    { id: '3', key: 'disabled_var', value: 'nope', isSecret: false, enabled: false },
  ]);

  const activeEnv = makeEnv('e1', 'Staging', false, [
    { id: '4', key: 'base_url', value: 'https://staging.example.com', isSecret: false, enabled: true },
    { id: '5', key: 'token', value: 'secret-tok', isSecret: true, enabled: true },
  ]);

  const collectionVars: EnvironmentVariable[] = [
    { id: '6', key: 'base_url', value: 'https://collection.example.com', isSecret: false, enabled: true },
    { id: '7', key: 'api_ver', value: 'v2', isSecret: false, enabled: true },
  ];

  it('enforces precedence: Active Environment > Collection > Global', () => {
    const resolved = resolveVariables('{{base_url}}/{{api_ver}}/{{global_only}}', {
      globalEnvironment: globalEnv,
      collectionVariables: collectionVars,
      activeEnvironment: activeEnv,
    });
    expect(resolved).toBe('https://staging.example.com/v2/gval');
  });

  it('falls back to collection over global when no active env overrides', () => {
    const resolved = resolveVariables('{{base_url}}/{{disabled_var}}', {
      globalEnvironment: globalEnv,
      collectionVariables: collectionVars,
    });
    expect(resolved).toBe('https://collection.example.com/{{disabled_var}}');
  });

  it('resolves built-in dynamic variables', () => {
    const out = resolveVariables('id={{$uuid}}&ts={{$timestamp}}&iso={{$isoTimestamp}}&n={{$randomInt}}', {});
    expect(out).not.toContain('{{$');
    expect(out).toMatch(/ts=\d+/);
    expect(out).toMatch(/n=\d+/);
  });

  it('reports variable matches with secret flags and sources', () => {
    const matches = findVariableMatches('{{base_url}} {{token}} {{missing}} {{$uuid}}', {
      globalEnvironment: globalEnv,
      activeEnvironment: activeEnv,
    });
    expect(matches).toHaveLength(4);
    expect(matches[0]).toMatchObject({ name: 'base_url', source: 'environment', isSecret: false });
    expect(matches[1]).toMatchObject({ name: 'token', source: 'environment', isSecret: true });
    expect(matches[2]).toMatchObject({ name: 'missing', source: 'unresolved' });
    expect(matches[3]).toMatchObject({ name: '$uuid', source: 'dynamic' });
  });

  it('strips secret values when exporting environments', () => {
    const exported = stripSecretsForExport([globalEnv, activeEnv]);
    expect(exported[1].variables.find((v) => v.key === 'token')?.value).toBe('');
    expect(exported[1].variables.find((v) => v.key === 'base_url')?.value).toBe(
      'https://staging.example.com',
    );
  });
});
