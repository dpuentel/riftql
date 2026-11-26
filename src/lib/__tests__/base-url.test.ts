import { describe, expect, it } from 'vitest';
import {
  combineBaseAndRequestUrl,
  resolveEffectiveBaseUrl,
  resolveRequestUrl,
} from '@/lib/base-url';
import type { CollectionRecord, FolderRecord } from '@/types/storage';

describe('base-url inheritance resolution', () => {
  const collections: CollectionRecord[] = [
    {
      id: 'col-1',
      name: 'Core API',
      description: '',
      baseUrl: 'https://api.example.com',
      auth: { type: 'none' },
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
      name: 'V1',
      baseUrl: '/v1',
      auth: { type: 'inherit' },
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'f-users',
      collectionId: 'col-1',
      parentId: 'f-root',
      name: 'Users',
      baseUrl: '/users/',
      auth: { type: 'inherit' },
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'f-override',
      collectionId: 'col-1',
      parentId: 'f-users',
      name: 'Auth Proxy',
      baseUrl: 'https://auth.internal.local',
      auth: { type: 'inherit' },
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('combines base URLs and relative request segments without double slashes', () => {
    expect(combineBaseAndRequestUrl('https://api.test/v1/', '/users')).toBe(
      'https://api.test/v1/users',
    );
    expect(combineBaseAndRequestUrl('https://api.test/v1', '')).toBe('https://api.test/v1');
    expect(combineBaseAndRequestUrl('https://api.test/v1', 'https://other.test/a')).toBe(
      'https://other.test/a',
    );
    expect(combineBaseAndRequestUrl('https://api.test/v1?env=1', '?page=2')).toBe(
      'https://api.test/v1?env=1&page=2',
    );
  });

  it('composes collection and nested folder segments and respects child absolute overrides', () => {
    const resolvedUsers = resolveEffectiveBaseUrl('f-users', 'col-1', folders, collections);
    expect(resolvedUsers).toEqual({
      baseUrl: 'https://api.example.com/v1/users/',
      sourceLabel: 'Folder "Users"',
    });
    expect(combineBaseAndRequestUrl(resolvedUsers.baseUrl, '/123')).toBe(
      'https://api.example.com/v1/users/123',
    );

    expect(resolveEffectiveBaseUrl('f-override', 'col-1', folders, collections)).toEqual({
      baseUrl: 'https://auth.internal.local',
      sourceLabel: 'Folder "Auth Proxy"',
    });

    expect(resolveEffectiveBaseUrl(undefined, 'col-1', folders, collections)).toEqual({
      baseUrl: 'https://api.example.com',
      sourceLabel: 'Collection "Core API"',
    });
  });

  it('resolves template variables in both folder base URL and request URL', () => {
    const vars: Record<string, string> = {
      host: 'https://staging.example.com',
      tenant: 'acme',
      full_url: 'https://override.example.com/hook',
    };
    const resolve = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

    expect(resolveRequestUrl('/{{tenant}}/orders', '{{host}}/api', resolve)).toBe(
      'https://staging.example.com/api/acme/orders',
    );
    expect(resolveRequestUrl('', '{{host}}/graphql', resolve)).toBe(
      'https://staging.example.com/graphql',
    );
    expect(resolveRequestUrl('{{full_url}}', '{{host}}/api', resolve)).toBe(
      'https://override.example.com/hook',
    );
  });
});
