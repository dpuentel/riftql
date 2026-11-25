import { describe, expect, it } from 'vitest';
import { isCurlCommand, parseCurlCommand } from '@/lib/curl-parser';

describe('curl-parser', () => {
  it('detects cURL commands cleanly', () => {
    expect(isCurlCommand('curl https://example.com')).toBe(true);
    expect(isCurlCommand('   CURL -X POST https://example.com')).toBe(true);
    expect(isCurlCommand('https://example.com/curl')).toBe(false);
  });

  it('parses simple GET with URL query params', () => {
    const draft = parseCurlCommand('curl "https://api.test/items?page=2&sort=asc"');
    expect(draft.method).toBe('GET');
    expect(draft.url).toBe('https://api.test/items?page=2&sort=asc');
    expect(draft.params).toHaveLength(2);
    expect(draft.params[0]).toMatchObject({ key: 'page', value: '2' });
  });

  it('handles multiline commands, headers, and JSON body', () => {
    const cmd = `curl -X PUT https://api.test/users/1 \\
      -H 'Authorization: Bearer tok_123' \\
      -H "Content-Type: application/json" \\
      --data-raw '{"name":"Ada","active":true}'`;
    const draft = parseCurlCommand(cmd);
    expect(draft.method).toBe('PUT');
    expect(draft.headers).toHaveLength(2);
    expect(draft.body.mode).toBe('json');
    if (draft.body.mode === 'json') {
      expect(JSON.parse(draft.body.content)).toEqual({ name: 'Ada', active: true });
    }
  });

  it('defaults to POST when -d is provided without -X', () => {
    const draft = parseCurlCommand(`curl https://api.test/login -d '{"ok":1}'`);
    expect(draft.method).toBe('POST');
    expect(draft.body.mode).toBe('json');
  });

  it('parses ANSI-C $ quotes from Chrome DevTools exports', () => {
    const draft = parseCurlCommand(
      `curl 'https://api.test/note' --data-raw $'line1\\nline2'`,
    );
    expect(draft.body).toEqual({
      mode: 'raw',
      language: 'text',
      content: 'line1\nline2',
    });
  });

  it('parses URL-encoded payloads via --data-urlencode and Content-Type', () => {
    const draft1 = parseCurlCommand(
      `curl https://api.test/form --data-urlencode "grant_type=client_credentials" --data-urlencode "scope=read"`,
    );
    expect(draft1.body.mode).toBe('urlEncoded');
    if (draft1.body.mode === 'urlEncoded') {
      expect(draft1.body.items).toHaveLength(2);
    }

    const draft2 = parseCurlCommand(
      `curl https://api.test/form -H "Content-Type: application/x-www-form-urlencoded" -d "a=1&b=hello%20world"`,
    );
    expect(draft2.body.mode).toBe('urlEncoded');
    if (draft2.body.mode === 'urlEncoded') {
      expect(draft2.body.items[1]).toMatchObject({ key: 'b', value: 'hello world' });
    }
  });

  it('parses multipart form-data with text fields and @file attachments', () => {
    const draft = parseCurlCommand(
      `curl -F "title=Report" -F "file=@C:\\docs\\report.pdf" https://api.test/upload`,
    );
    expect(draft.method).toBe('POST');
    expect(draft.body.mode).toBe('formData');
    if (draft.body.mode === 'formData') {
      expect(draft.body.items[0]).toMatchObject({
        key: 'title',
        value: 'Report',
        itemType: 'text',
      });
      expect(draft.body.items[1]).toMatchObject({
        key: 'file',
        filePath: 'C:\\docs\\report.pdf',
        fileName: 'report.pdf',
        itemType: 'file',
      });
    }
  });

  it('parses Basic auth (-u), User-Agent (-A), Cookie (-b), --insecure (-k), --location (-L)', () => {
    const draft = parseCurlCommand(
      `curl -u admin:s3cr3t -A "RiftAgent/1.0" -b "sid=abc" -k -L --url https://local.test/me`,
    );
    expect(draft.auth).toEqual({ type: 'basic', username: 'admin', password: 's3cr3t' });
    expect(draft.headers).toEqual([
      { id: expect.any(String), key: 'User-Agent', value: 'RiftAgent/1.0', enabled: true },
      { id: expect.any(String), key: 'Cookie', value: 'sid=abc', enabled: true },
    ]);
    expect(draft.settings.verifySsl).toBe(false);
    expect(draft.settings.followRedirects).toBe(true);
  });

  it('supports -G / --get appending data to query parameters', () => {
    const draft = parseCurlCommand(`curl -G https://api.test/search -d "q=rift" -d "limit=5"`);
    expect(draft.method).toBe('GET');
    expect(draft.url).toBe('https://api.test/search?q=rift&limit=5');
    expect(draft.body.mode).toBe('none');
  });

  it('auto-detects GraphQL payloads in JSON bodies', () => {
    const draft = parseCurlCommand(
      `curl -X POST https://api.test/graphql -H 'Content-Type: application/json' -d '{"operationName":"GetUser","query":"query GetUser { user { id } }","variables":{"id":"9"}}'`,
    );
    expect(draft.protocol).toBe('graphql');
    expect(draft.body.mode).toBe('graphql');
    expect(draft.graphql.operationName).toBe('GetUser');
    expect(draft.graphql.query).toContain('query GetUser');
    expect(draft.graphql.variables).toContain('"id": "9"');
  });

  it('supports --header= and --request= equals syntax', () => {
    const draft = parseCurlCommand(
      `curl --request=DELETE --header="X-Trace: 42" https://api.test/items/1`,
    );
    expect(draft.method).toBe('DELETE');
    expect(draft.headers[0]).toMatchObject({ key: 'X-Trace', value: '42' });
  });

  it('throws clear errors on invalid or URL-less commands', () => {
    expect(() => parseCurlCommand('wget https://example.com')).toThrow(/does not start/i);
    expect(() => parseCurlCommand('curl -X POST')).toThrow(/find URL/i);
  });
});
