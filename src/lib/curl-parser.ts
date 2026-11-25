import { nanoid } from 'nanoid';
import { syncParamsFromUrl } from '@/lib/url-params';
import type {
  AuthConfig,
  FormDataItem,
  GraphQLConfig,
  KeyValueItem,
  RequestBody,
  RequestDraft,
  RequestSettings,
} from '@/types/api';

export function isCurlCommand(text: string): boolean {
  return /^\s*curl(?:\s|$)/i.test(text);
}

/**
 * Shell-aware tokenizer supporting single quotes, double quotes, ANSI-C `$'...'` quotes,
 * backslash line continuations, and escaped characters.
 */
export function tokenizeCurlCommand(input: string): string[] {
  const cleaned = input.replace(/\\\r?\n/g, ' ').trim();
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current);
        current = '';
        inToken = false;
      }
      i += 1;
      continue;
    }

    inToken = true;

    // ANSI-C quoting $'...'
    if (ch === '$' && cleaned[i + 1] === "'") {
      i += 2;
      while (i < cleaned.length && cleaned[i] !== "'") {
        if (cleaned[i] === '\\' && i + 1 < cleaned.length) {
          const esc = cleaned[i + 1];
          if (esc === 'n') current += '\n';
          else if (esc === 'r') current += '\r';
          else if (esc === 't') current += '\t';
          else current += esc;
          i += 2;
        } else {
          current += cleaned[i];
          i += 1;
        }
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      i += 1;
      while (i < cleaned.length && cleaned[i] !== "'") {
        current += cleaned[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      i += 1;
      while (i < cleaned.length && cleaned[i] !== '"') {
        if (cleaned[i] === '\\' && i + 1 < cleaned.length) {
          const next = cleaned[i + 1];
          if (next === '"' || next === '\\' || next === '$') {
            current += next;
            i += 2;
            continue;
          }
        }
        current += cleaned[i];
        i += 1;
      }
      i += 1;
      continue;
    }

    if (ch === '\\' && i + 1 < cleaned.length) {
      current += cleaned[i + 1];
      i += 2;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (inToken) {
    tokens.push(current);
  }

  return tokens;
}

function splitFlagValue(token: string, nextToken?: string): {
  flag: string;
  value?: string;
  consumedNext: boolean;
} {
  if (token.startsWith('--') && token.includes('=')) {
    const eq = token.indexOf('=');
    return {
      flag: token.slice(0, eq),
      value: token.slice(eq + 1),
      consumedNext: false,
    };
  }
  return { flag: token, value: nextToken, consumedNext: true };
}

export function parseCurlCommand(command: string): RequestDraft {
  if (!isCurlCommand(command)) {
    throw new Error('Input does not start with a curl command.');
  }

  const tokens = tokenizeCurlCommand(command);
  if (tokens.length < 2) {
    throw new Error('cURL command is missing a target URL.');
  }

  let explicitMethod: string | undefined;
  let forceGet = false;
  let url = '';
  const headers: KeyValueItem[] = [];
  let auth: AuthConfig = { type: 'none' };
  const settings: RequestSettings = {};
  const rawDataParts: string[] = [];
  const urlEncodedItems: KeyValueItem[] = [];
  const formDataItems: FormDataItem[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '-k' || token === '--insecure') {
      settings.verifySsl = false;
      continue;
    }
    if (token === '-L' || token === '--location') {
      settings.followRedirects = true;
      continue;
    }
    if (token === '-G' || token === '--get') {
      forceGet = true;
      continue;
    }
    if (token === '-i' || token === '--include' || token === '-s' || token === '--silent' || token === '-v' || token === '--verbose' || token === '--compressed') {
      continue;
    }

    if (token === '-X' || token === '--request' || token.startsWith('--request=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value) explicitMethod = value.toUpperCase();
      if (consumedNext) i += 1;
      continue;
    }

    if (token === '--url' || token.startsWith('--url=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value) url = value;
      if (consumedNext) i += 1;
      continue;
    }

    if (token === '-H' || token === '--header' || token.startsWith('--header=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value) {
        const colonIdx = value.indexOf(':');
        if (colonIdx > 0) {
          const key = value.slice(0, colonIdx).trim();
          const val = value.slice(colonIdx + 1).trim();
          headers.push({ id: nanoid(), key, value: val, enabled: true });
        }
      }
      if (consumedNext) i += 1;
      continue;
    }

    if (token === '-A' || token === '--user-agent' || token.startsWith('--user-agent=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value) {
        headers.push({ id: nanoid(), key: 'User-Agent', value, enabled: true });
      }
      if (consumedNext) i += 1;
      continue;
    }

    if (token === '-b' || token === '--cookie' || token.startsWith('--cookie=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value) {
        headers.push({ id: nanoid(), key: 'Cookie', value, enabled: true });
      }
      if (consumedNext) i += 1;
      continue;
    }

    if (token === '-u' || token === '--user' || token.startsWith('--user=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value !== undefined) {
        const sep = value.indexOf(':');
        const username = sep >= 0 ? value.slice(0, sep) : value;
        const password = sep >= 0 ? value.slice(sep + 1) : '';
        auth = { type: 'basic', username, password };
      }
      if (consumedNext) i += 1;
      continue;
    }

    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii' ||
      token.startsWith('--data=') ||
      token.startsWith('--data-raw=') ||
      token.startsWith('--data-binary=')
    ) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value !== undefined) rawDataParts.push(value);
      if (consumedNext) i += 1;
      continue;
    }

    if (token === '--data-urlencode' || token.startsWith('--data-urlencode=')) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value !== undefined) {
        const eq = value.indexOf('=');
        urlEncodedItems.push({
          id: nanoid(),
          key: eq >= 0 ? value.slice(0, eq) : value,
          value: eq >= 0 ? value.slice(eq + 1) : '',
          enabled: true,
        });
      }
      if (consumedNext) i += 1;
      continue;
    }

    if (
      token === '-F' ||
      token === '--form' ||
      token === '--form-string' ||
      token.startsWith('--form=')
    ) {
      const { value, consumedNext } = splitFlagValue(token, tokens[i + 1]);
      if (value) {
        const eq = value.indexOf('=');
        if (eq > 0) {
          const key = value.slice(0, eq);
          const rawVal = value.slice(eq + 1);
          if (rawVal.startsWith('@') && token !== '--form-string') {
            const filePath = rawVal.slice(1).split(';')[0];
            const segments = filePath.split(/[/\\]/);
            formDataItems.push({
              id: nanoid(),
              key,
              value: '',
              filePath,
              fileName: segments[segments.length - 1] || filePath,
              itemType: 'file',
              enabled: true,
            });
          } else {
            formDataItems.push({
              id: nanoid(),
              key,
              value: rawVal,
              itemType: 'text',
              enabled: true,
            });
          }
        }
      }
      if (consumedNext) i += 1;
      continue;
    }

    if (!token.startsWith('-') && !url) {
      url = token;
    }
  }

  if (!url) {
    throw new Error('Could not find URL in cURL command.');
  }

  let protocol: 'rest' | 'graphql' = 'rest';
  let body: RequestBody = { mode: 'none' };
  let graphql: GraphQLConfig = { query: '', variables: '{}' };

  if (forceGet && rawDataParts.length > 0) {
    const joined = rawDataParts.join('&');
    url = url.includes('?') ? `${url}&${joined}` : `${url}?${joined}`;
  } else if (formDataItems.length > 0) {
    body = { mode: 'formData', items: formDataItems };
  } else if (urlEncodedItems.length > 0) {
    body = { mode: 'urlEncoded', items: urlEncodedItems };
  } else if (rawDataParts.length > 0) {
    const joined = rawDataParts.join('&');
    const ctHeader = headers
      .find((h) => h.key.toLowerCase() === 'content-type')
      ?.value.toLowerCase();

    if (ctHeader?.includes('application/x-www-form-urlencoded')) {
      const items: KeyValueItem[] = joined.split('&').map((pair) => {
        const eq = pair.indexOf('=');
        return {
          id: nanoid(),
          key: eq >= 0 ? decodeURIComponent(pair.slice(0, eq)) : decodeURIComponent(pair),
          value: eq >= 0 ? decodeURIComponent(pair.slice(eq + 1)) : '',
          enabled: true,
        };
      });
      body = { mode: 'urlEncoded', items };
    } else {
      let parsedJson: Record<string, unknown> | null = null;
      try {
        const candidate = JSON.parse(joined) as unknown;
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          parsedJson = candidate as Record<string, unknown>;
        }
      } catch {
        parsedJson = null;
      }

      if (parsedJson && typeof parsedJson.query === 'string') {
        protocol = 'graphql';
        body = { mode: 'graphql' };
        graphql = {
          query: parsedJson.query,
          variables: parsedJson.variables
            ? JSON.stringify(parsedJson.variables, null, 2)
            : '{}',
          operationName:
            typeof parsedJson.operationName === 'string'
              ? parsedJson.operationName
              : undefined,
        };
      } else if (ctHeader?.includes('json') || parsedJson !== null) {
        body = {
          mode: 'json',
          content: parsedJson ? JSON.stringify(parsedJson, null, 2) : joined,
        };
      } else if (ctHeader?.includes('xml')) {
        body = { mode: 'raw', language: 'xml', content: joined };
      } else if (ctHeader?.includes('html')) {
        body = { mode: 'raw', language: 'html', content: joined };
      } else {
        body = { mode: 'raw', language: 'text', content: joined };
      }
    }
  }

  const hasBody =
    formDataItems.length > 0 || urlEncodedItems.length > 0 || (rawDataParts.length > 0 && !forceGet);
  const method = forceGet
    ? 'GET'
    : explicitMethod || (hasBody ? 'POST' : 'GET');

  return {
    id: nanoid(),
    name: 'Imported cURL',
    protocol,
    method,
    url,
    params: syncParamsFromUrl(url, []),
    headers,
    auth,
    body,
    graphql,
    settings,
  };
}
