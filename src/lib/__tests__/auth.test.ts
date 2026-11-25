import { describe, expect, it } from 'vitest';
import { applyAuthToRequest, resolveEffectiveAuth } from '@/lib/auth';
import type { CollectionRecord, FolderRecord } from '@/types/storage';

describe('auth inheritance and application', () => {
  const collections: CollectionRecord[] = [
    {
      id: 'col-1',
      name: 'Core API',
      description: '',
      auth: { type: 'bearer', token: '{{col_token}}' },
      variables: [],
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const folders: FolderRecord[] = [
    {
      id: 'f-root',
      collectionId: 'col-1',
      name: 'Users',
      auth: { type: 'inherit' },
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'f-admin',
      collectionId: 'col-1',
      parentId: 'f-root',
      name: 'Admin',
      auth: { type: 'basic', username: 'alice', password: 'pw' },
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('inherits from nearest folder override, otherwise falls back to collection', () => {
    const fromAdmin = resolveEffectiveAuth(
      { type: 'inherit' },
      'f-admin',
      'col-1',
      folders,
      collections,
    );
    expect(fromAdmin.auth.type).toBe('basic');
    expect(fromAdmin.sourceLabel).toBe('Folder "Admin"');

    const fromRoot = resolveEffectiveAuth(
      { type: 'inherit' },
      'f-root',
      'col-1',
      folders,
      collections,
    );
    expect(fromRoot.auth.type).toBe('bearer');
    expect(fromRoot.sourceLabel).toBe('Collection "Core API"');
  });

  it('applies bearer, basic UTF-8, and apiKey query/header auth without clobbering manual headers', () => {
    const bearer = applyAuthToRequest(
      { type: 'bearer', token: '{{tok}}' },
      [],
      [],
      (s) => (s === '{{tok}}' ? 'abc123' : s),
    );
    expect(bearer.headers).toEqual([{ key: 'Authorization', value: 'Bearer abc123' }]);

    const basic = applyAuthToRequest(
      { type: 'basic', username: 'user', password: 'päss' },
      [],
      [],
      (s) => s,
    );
    expect(basic.headers[0].value.startsWith('Basic ')).toBe(true);

    const apiKeyQuery = applyAuthToRequest(
      { type: 'apiKey', key: 'api_key', value: 'secret', addTo: 'query' },
      [],
      [],
      (s) => s,
    );
    expect(apiKeyQuery.queryParams).toHaveLength(1);
    expect(apiKeyQuery.queryParams[0]).toMatchObject({
      key: 'api_key',
      value: 'secret',
      enabled: true,
    });
  });
});
