import { describe, expect, it } from 'vitest';
import { syncParamsFromUrl, syncUrlFromParams } from '@/lib/url-params';

describe('bidirectional URL <-> params sync', () => {
  it('parses query params without altering template URLs and preserves disabled rows', () => {
    const existing = [
      { id: 'd1', key: 'debug', value: 'true', enabled: false },
    ];
    const params = syncParamsFromUrl('{{base_url}}/users?page=2&q={{search}}#top', existing);
    expect(params).toHaveLength(3);
    expect(params[0]).toMatchObject({ key: 'page', value: '2', enabled: true });
    expect(params[1]).toMatchObject({ key: 'q', value: '{{search}}', enabled: true });
    expect(params[2]).toMatchObject({ id: 'd1', key: 'debug', enabled: false });
  });

  it('rebuilds URL from enabled params while preserving {{variables}} and hash', () => {
    const url = syncUrlFromParams('{{base_url}}/users?old=1#sec', [
      { id: '1', key: 'limit', value: '25', enabled: true },
      { id: '2', key: 'token', value: '{{api_key}}', enabled: true },
      { id: '3', key: 'skip', value: 'yes', enabled: false },
    ]);
    expect(url).toBe('{{base_url}}/users?limit=25&token={{api_key}}#sec');
  });
});
