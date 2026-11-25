import { describe, expect, it } from 'vitest';
import {
  detectContentLanguage,
  formatBytes,
  formatDuration,
  formatXmlLike,
  getMethodBadgeClasses,
  getStatusBadgeClasses,
  prettyPrintBody,
} from '@/lib/format';

describe('format helpers', () => {
  it('formats byte sizes cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });

  it('formats durations cleanly', () => {
    expect(formatDuration(42)).toBe('42 ms');
    expect(formatDuration(1250)).toBe('1.25 s');
  });

  it('returns semantic method and status classes', () => {
    expect(getMethodBadgeClasses('GET')).toContain('#34D399');
    expect(getMethodBadgeClasses('POST')).toContain('#FBBF24');
    expect(getMethodBadgeClasses('DELETE')).toContain('#F87171');
    expect(getMethodBadgeClasses('GQL')).toContain('#E879F9');

    expect(getStatusBadgeClasses(200)).toContain('#34D399');
    expect(getStatusBadgeClasses(302)).toContain('#60A5FA');
    expect(getStatusBadgeClasses(404)).toContain('#FBBF24');
    expect(getStatusBadgeClasses(500)).toContain('#F87171');
  });

  it('detects content language from header or payload', () => {
    expect(detectContentLanguage('application/json; charset=utf-8', '')).toBe('json');
    expect(detectContentLanguage('text/html', '')).toBe('html');
    expect(detectContentLanguage('application/xml', '')).toBe('xml');
    expect(detectContentLanguage(undefined, '{"ok":true}')).toBe('json');
    expect(detectContentLanguage(undefined, '<!DOCTYPE html><html></html>')).toBe('html');
    expect(detectContentLanguage(undefined, '<note><to>User</to></note>')).toBe('xml');
    expect(detectContentLanguage('text/plain', 'hello world')).toBe('text');
  });

  it('pretty prints JSON and XML payloads', () => {
    expect(prettyPrintBody('{"a":1,"b":[2]}', 'json')).toBe(
      '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}',
    );
    expect(formatXmlLike('<root><item>1</item><empty/></root>')).toBe(
      '<root>\n  <item>1</item>\n  <empty/>\n</root>',
    );
  });
});
