import { applyAuthToRequest } from '@/lib/auth';
import { resolveVariables, type VariableResolutionContext } from '@/lib/variables';
import { appendQueryParamsToUrl } from '@/store/useTabsStore';
import type { AuthConfig, HeaderPair, RequestBody, RequestDraft } from '@/types/api';

export type CodeSnippetTarget =
  | 'curl'
  | 'fetch'
  | 'axios'
  | 'python-requests'
  | 'httpie';

export interface SnippetOptions {
  resolveVariables: boolean;
  effectiveAuth?: AuthConfig;
}

function escapeSingleQuotedBash(val: string): string {
  return val.replace(/'/g, "'\\''");
}

function quoteBash(val: string): string {
  return `'${escapeSingleQuotedBash(val)}'`;
}

function buildPayloadString(
  draft: RequestDraft,
  body: RequestBody,
  resolve: (s: string) => string,
): { bodyString?: string; isFormData: boolean; isUrlEncoded: boolean } {
  if (draft.protocol === 'graphql' || body.mode === 'graphql') {
    const obj: Record<string, unknown> = {
      query: resolve(draft.graphql.query),
    };
    const varsStr = resolve(draft.graphql.variables).trim();
    if (varsStr && varsStr !== '{}') {
      try {
        obj.variables = JSON.parse(varsStr);
      } catch {
        obj.variables = varsStr;
      }
    }
    if (draft.graphql.operationName) {
      obj.operationName = draft.graphql.operationName;
    }
    return {
      bodyString: JSON.stringify(obj, null, 2),
      isFormData: false,
      isUrlEncoded: false,
    };
  }

  if (body.mode === 'json') {
    return {
      bodyString: resolve(body.content),
      isFormData: false,
      isUrlEncoded: false,
    };
  }

  if (body.mode === 'raw') {
    return {
      bodyString: resolve(body.content),
      isFormData: false,
      isUrlEncoded: false,
    };
  }

  if (body.mode === 'urlEncoded') {
    const params = new URLSearchParams();
    for (const item of body.items) {
      if (item.enabled && item.key.trim()) {
        params.append(resolve(item.key.trim()), resolve(item.value));
      }
    }
    return {
      bodyString: params.toString(),
      isFormData: false,
      isUrlEncoded: true,
    };
  }

  if (body.mode === 'formData') {
    return {
      isFormData: true,
      isUrlEncoded: false,
    };
  }

  return { isFormData: false, isUrlEncoded: false };
}

export function generateCodeSnippet(
  target: CodeSnippetTarget,
  draft: RequestDraft,
  varContext: VariableResolutionContext,
  options: SnippetOptions,
): string {
  const resolve = options.resolveVariables
    ? (s: string) => resolveVariables(s, varContext)
    : (s: string) => s;

  const baseUrl = resolve(draft.url.trim()) || 'https://api.example.com';
  const resolvedParams = draft.params.map((p) => ({
    ...p,
    key: resolve(p.key),
    value: resolve(p.value),
  }));
  const rawHeaders: HeaderPair[] = draft.headers
    .filter((h) => h.enabled && h.key.trim().length > 0)
    .map((h) => ({ key: resolve(h.key.trim()), value: resolve(h.value) }));

  const authToApply = options.effectiveAuth ?? draft.auth;
  const withAuth = applyAuthToRequest(authToApply, rawHeaders, resolvedParams, resolve);

  const fullUrl = appendQueryParamsToUrl(baseUrl, withAuth.queryParams);
  const method = draft.protocol === 'graphql' ? 'POST' : draft.method.toUpperCase();
  const headers = [...withAuth.headers];

  const payload = buildPayloadString(draft, draft.body, resolve);
  const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type');
  if (!hasContentType) {
    if (draft.protocol === 'graphql' || draft.body.mode === 'json' || draft.body.mode === 'graphql') {
      headers.push({ key: 'Content-Type', value: 'application/json' });
    } else if (payload.isUrlEncoded) {
      headers.push({
        key: 'Content-Type',
        value: 'application/x-www-form-urlencoded',
      });
    }
  }

  switch (target) {
    case 'curl': {
      const lines: string[] = [`curl -X ${method} ${quoteBash(fullUrl)}`];
      for (const h of headers) {
        if (payload.isFormData && h.key.toLowerCase() === 'content-type') continue;
        lines.push(`  -H ${quoteBash(`${h.key}: ${h.value}`)}`);
      }
      if (payload.isFormData && draft.body.mode === 'formData') {
        for (const item of draft.body.items) {
          if (!item.enabled || !item.key.trim()) continue;
          const k = resolve(item.key.trim());
          if (item.itemType === 'file') {
            lines.push(`  -F ${quoteBash(`${k}=@${item.filePath || 'file.bin'}`)}`);
          } else {
            lines.push(`  -F ${quoteBash(`${k}=${resolve(item.value)}`)}`);
          }
        }
      } else if (payload.bodyString !== undefined) {
        lines.push(`  --data-raw ${quoteBash(payload.bodyString)}`);
      }
      if (draft.settings.verifySsl === false) {
        lines.push('  --insecure');
      }
      return lines.join(' \\\n');
    }

    case 'fetch': {
      const headersObj = Object.fromEntries(headers.map((h) => [h.key, h.value]));
      const lines: string[] = [];
      if (payload.isFormData && draft.body.mode === 'formData') {
        lines.push('const formData = new FormData();');
        for (const item of draft.body.items) {
          if (!item.enabled || !item.key.trim()) continue;
          if (item.itemType === 'file') {
            lines.push(
              `// Attach file: ${item.filePath || item.fileName || 'file'}`,
            );
            lines.push(
              `formData.append(${JSON.stringify(resolve(item.key))}, fileBlob, ${JSON.stringify(item.fileName || 'file')});`,
            );
          } else {
            lines.push(
              `formData.append(${JSON.stringify(resolve(item.key))}, ${JSON.stringify(resolve(item.value))});`,
            );
          }
        }
        lines.push('');
      }

      lines.push(`const response = await fetch(${JSON.stringify(fullUrl)}, {`);
      lines.push(`  method: ${JSON.stringify(method)},`);
      if (headers.length > 0 && !payload.isFormData) {
        lines.push(`  headers: ${JSON.stringify(headersObj, null, 2).replace(/\n/g, '\n  ')},`);
      }
      if (payload.isFormData) {
        lines.push('  body: formData,');
      } else if (payload.bodyString !== undefined && method !== 'GET' && method !== 'HEAD') {
        lines.push(`  body: ${JSON.stringify(payload.bodyString)},`);
      }
      lines.push('});');
      lines.push('const data = await response.json();');
      return lines.join('\n');
    }

    case 'axios': {
      const headersObj = Object.fromEntries(headers.map((h) => [h.key, h.value]));
      const cfg: string[] = [
        `  method: ${JSON.stringify(method)},`,
        `  url: ${JSON.stringify(fullUrl)},`,
      ];
      if (headers.length > 0) {
        cfg.push(`  headers: ${JSON.stringify(headersObj, null, 2).replace(/\n/g, '\n  ')},`);
      }
      if (payload.bodyString !== undefined && method !== 'GET' && method !== 'HEAD') {
        if (draft.protocol === 'graphql' || draft.body.mode === 'json' || draft.body.mode === 'graphql') {
          try {
            const obj = JSON.parse(payload.bodyString);
            cfg.push(`  data: ${JSON.stringify(obj, null, 2).replace(/\n/g, '\n  ')},`);
          } catch {
            cfg.push(`  data: ${JSON.stringify(payload.bodyString)},`);
          }
        } else {
          cfg.push(`  data: ${JSON.stringify(payload.bodyString)},`);
        }
      }
      return `import axios from 'axios';\n\nconst { data } = await axios({\n${cfg.join('\n')}\n});`;
    }

    case 'python-requests': {
      const lines: string[] = ['import requests', ''];
      lines.push(`url = ${JSON.stringify(fullUrl)}`);
      if (headers.length > 0 && !payload.isFormData) {
        const headersObj = Object.fromEntries(headers.map((h) => [h.key, h.value]));
        lines.push(`headers = ${JSON.stringify(headersObj, null, 2)}`);
      }

      if (payload.isFormData && draft.body.mode === 'formData') {
        const textFields: Record<string, string> = {};
        const fileLines: string[] = [];
        for (const item of draft.body.items) {
          if (!item.enabled || !item.key.trim()) continue;
          if (item.itemType === 'file') {
            fileLines.push(
              `  ${JSON.stringify(resolve(item.key))}: open(${JSON.stringify(item.filePath || 'file.bin')}, "rb"),`,
            );
          } else {
            textFields[resolve(item.key)] = resolve(item.value);
          }
        }
        lines.push(`data = ${JSON.stringify(textFields, null, 2)}`);
        if (fileLines.length > 0) {
          lines.push(`files = {\n${fileLines.join('\n')}\n}`);
        }
        lines.push(
          `response = requests.request(${JSON.stringify(method)}, url, data=data${fileLines.length > 0 ? ', files=files' : ''})`,
        );
      } else if (payload.bodyString !== undefined && method !== 'GET' && method !== 'HEAD') {
        if (draft.protocol === 'graphql' || draft.body.mode === 'json' || draft.body.mode === 'graphql') {
          lines.push(`payload = ${payload.bodyString}`);
          lines.push(
            `response = requests.request(${JSON.stringify(method)}, url, json=payload${headers.length > 0 ? ', headers=headers' : ''})`,
          );
        } else {
          lines.push(`payload = ${JSON.stringify(payload.bodyString)}`);
          lines.push(
            `response = requests.request(${JSON.stringify(method)}, url, data=payload${headers.length > 0 ? ', headers=headers' : ''})`,
          );
        }
      } else {
        lines.push(
          `response = requests.request(${JSON.stringify(method)}, url${headers.length > 0 ? ', headers=headers' : ''})`,
        );
      }
      lines.push('print(response.status_code, response.text)');
      return lines.join('\n');
    }

    case 'httpie': {
      const parts: string[] = [`http ${method} ${quoteBash(fullUrl)}`];
      for (const h of headers) {
        parts.push(`  ${quoteBash(`${h.key}:${h.value}`)}`);
      }
      if (payload.isFormData && draft.body.mode === 'formData') {
        parts[0] = `http --form ${method} ${quoteBash(fullUrl)}`;
        for (const item of draft.body.items) {
          if (!item.enabled || !item.key.trim()) continue;
          const k = resolve(item.key.trim());
          if (item.itemType === 'file') {
            parts.push(`  ${quoteBash(`${k}@${item.filePath || 'file.bin'}`)}`);
          } else {
            parts.push(`  ${quoteBash(`${k}=${resolve(item.value)}`)}`);
          }
        }
        return parts.join(' \\\n');
      }
      if (payload.bodyString !== undefined && method !== 'GET' && method !== 'HEAD') {
        return `echo ${quoteBash(payload.bodyString)} | ${parts.join(' \\\n')}`;
      }
      return parts.join(' \\\n');
    }
  }
}
