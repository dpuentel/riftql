export type DisplayMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'
  | 'GQL';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatRelativeTime(isoDate: string, nowMs: number = Date.now()): string {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return isoDate;
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Desaturated semantic method colors matching BRANDING.md in dark mode
 * and accessibility-adjusted deeper tones in light mode.
 */
export function getMethodColorClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-[#059669] dark:text-[#34D399]';
    case 'POST':
      return 'text-[#D97706] dark:text-[#FBBF24]';
    case 'PUT':
    case 'PATCH':
      return 'text-[#2563EB] dark:text-[#60A5FA]';
    case 'DELETE':
      return 'text-[#DC2626] dark:text-[#F87171]';
    case 'GQL':
    case 'GRAPHQL':
      return 'text-[#C026D3] dark:text-[#E879F9]';
    default:
      return 'text-[#52525B] dark:text-[#A1A1AA]';
  }
}

export function getMethodBadgeClasses(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-[#059669] bg-[#059669]/10 border-[#059669]/25 dark:text-[#34D399] dark:bg-[#34D399]/10 dark:border-[#34D399]/25';
    case 'POST':
      return 'text-[#D97706] bg-[#D97706]/10 border-[#D97706]/25 dark:text-[#FBBF24] dark:bg-[#FBBF24]/10 dark:border-[#FBBF24]/25';
    case 'PUT':
    case 'PATCH':
      return 'text-[#2563EB] bg-[#2563EB]/10 border-[#2563EB]/25 dark:text-[#60A5FA] dark:bg-[#60A5FA]/10 dark:border-[#60A5FA]/25';
    case 'DELETE':
      return 'text-[#DC2626] bg-[#DC2626]/10 border-[#DC2626]/25 dark:text-[#F87171] dark:bg-[#F87171]/10 dark:border-[#F87171]/25';
    case 'GQL':
    case 'GRAPHQL':
      return 'text-[#C026D3] bg-[#C026D3]/10 border-[#C026D3]/25 dark:text-[#E879F9] dark:bg-[#E879F9]/10 dark:border-[#E879F9]/25';
    default:
      return 'text-[#52525B] bg-[#52525B]/10 border-[#52525B]/25 dark:text-[#A1A1AA] dark:bg-[#A1A1AA]/10 dark:border-[#A1A1AA]/25';
  }
}

export function getStatusBadgeClasses(status: number): string {
  if (status >= 200 && status < 300) {
    return 'text-[#059669] bg-[#059669]/10 border-[#059669]/30 dark:text-[#34D399] dark:bg-[#34D399]/12 dark:border-[#34D399]/30';
  }
  if (status >= 300 && status < 400) {
    return 'text-[#2563EB] bg-[#2563EB]/10 border-[#2563EB]/30 dark:text-[#60A5FA] dark:bg-[#60A5FA]/12 dark:border-[#60A5FA]/30';
  }
  if (status >= 400 && status < 500) {
    return 'text-[#D97706] bg-[#D97706]/10 border-[#D97706]/30 dark:text-[#FBBF24] dark:bg-[#FBBF24]/12 dark:border-[#FBBF24]/30';
  }
  if (status >= 500) {
    return 'text-[#DC2626] bg-[#DC2626]/10 border-[#DC2626]/30 dark:text-[#F87171] dark:bg-[#F87171]/12 dark:border-[#F87171]/30';
  }
  return 'text-[#52525B] bg-[#52525B]/10 border-[#52525B]/25 dark:text-[#A1A1AA] dark:bg-[#A1A1AA]/10 dark:border-[#A1A1AA]/25';
}

export type ResponseLanguage = 'json' | 'xml' | 'html' | 'text';

export function detectContentLanguage(contentType?: string | null, body?: string): ResponseLanguage {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('json') || ct.includes('+json')) return 'json';
  if (ct.includes('html') || ct.includes('xhtml')) return 'html';
  if (ct.includes('xml') || ct.includes('+xml')) return 'xml';

  const trimmed = (body || '').trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Fallback to text if invalid JSON without JSON Content-Type
    }
  }
  if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) return 'html';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';
  return 'text';
}

export function formatXmlLike(input: string): string {
  const normalized = input.replace(/>\s+</g, '><').trim();
  if (!normalized) return '';
  const tokens = normalized.replace(/(>)(<)(\/*)/g, '$1\n$2$3').split('\n');
  let indent = 0;
  const lines: string[] = [];

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (/^<\/\w/.test(trimmed)) {
      indent = Math.max(0, indent - 1);
    }

    lines.push(`${'  '.repeat(indent)}${trimmed}`);

    const isOpeningTag =
      /^<[^!?/][^>]*>$/.test(trimmed) &&
      !trimmed.endsWith('/>') &&
      !/^<(\w+)[^>]*>.*<\/\1>$/.test(trimmed);
    if (isOpeningTag) {
      indent += 1;
    }
  }

  return lines.join('\n');
}

export function prettyPrintBody(body: string, language: ResponseLanguage): string {
  if (!body) return '';
  if (language === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  if (language === 'xml' || language === 'html') {
    return formatXmlLike(body);
  }
  return body;
}
