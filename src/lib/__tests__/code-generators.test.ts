import { describe, expect, it } from 'vitest';
import { generateCodeSnippet } from '@/lib/code-generators';
import type { RequestDraft } from '@/types/api';
import type { EnvironmentRecord } from '@/types/storage';

const activeEnv: EnvironmentRecord = {
  id: 'e1',
  name: 'Prod',
  isGlobal: false,
  variables: [
    { id: '1', key: 'host', value: 'https://api.riftql.dev', isSecret: false, enabled: true },
    { id: '2', key: 'tok', value: 'secret_abc', isSecret: true, enabled: true },
  ],
  createdAt: '',
  updatedAt: '',
};

const restPostDraft: RequestDraft = {
  id: 'r1',
  name: 'Create Item',
  protocol: 'rest',
  method: 'POST',
  url: '{{host}}/items',
  params: [{ id: 'p1', key: 'dryRun', value: 'false', enabled: true }],
  headers: [{ id: 'h1', key: 'X-App', value: "o'malley", enabled: true }],
  auth: { type: 'bearer', token: '{{tok}}' },
  body: { mode: 'json', content: '{"title":"hello"}' },
  graphql: { query: '', variables: '{}' },
  settings: { verifySsl: false },
};

const gqlDraft: RequestDraft = {
  id: 'g1',
  name: 'Get Me',
  protocol: 'graphql',
  method: 'POST',
  url: '{{host}}/graphql',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { mode: 'graphql' },
  graphql: {
    query: 'query Me($id: ID!) { user(id: $id) { name } }',
    variables: '{"id":"7"}',
    operationName: 'Me',
  },
  settings: {},
};

describe('code-generators', () => {
  it('generates cURL, fetch, axios, Python, and HTTPie snippets with resolved variables and escaping', () => {
    const curl = generateCodeSnippet('curl', restPostDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: true,
    });
    expect(curl).toContain("curl -X POST 'https://api.riftql.dev/items?dryRun=false'");
    expect(curl).toContain("'Authorization: Bearer secret_abc'");
    expect(curl).toContain("'X-App: o'\\''malley'");
    expect(curl).toContain('--insecure');

    const fetchCode = generateCodeSnippet('fetch', restPostDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: true,
    });
    expect(fetchCode).toContain('await fetch("https://api.riftql.dev/items?dryRun=false"');
    expect(fetchCode).toContain('"Authorization": "Bearer secret_abc"');

    const axiosCode = generateCodeSnippet('axios', restPostDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: true,
    });
    expect(axiosCode).toContain('await axios(');
    expect(axiosCode).toContain('"title": "hello"');

    const pyCode = generateCodeSnippet('python-requests', restPostDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: true,
    });
    expect(pyCode).toContain('import requests');
    expect(pyCode).toContain('json=payload');

    const httpie = generateCodeSnippet('httpie', restPostDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: true,
    });
    expect(httpie).toContain("http POST 'https://api.riftql.dev/items?dryRun=false'");
    expect(httpie).toContain("'Authorization:Bearer secret_abc'");
  });

  it('keeps {{variables}} raw when resolveVariables is false and supports GraphQL + FormData', () => {
    const rawCurl = generateCodeSnippet('curl', restPostDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: false,
    });
    expect(rawCurl).toContain("'{{host}}/items?dryRun=false'");
    expect(rawCurl).toContain("'Authorization: Bearer {{tok}}'");

    const gqlFetch = generateCodeSnippet('fetch', gqlDraft, { activeEnvironment: activeEnv }, {
      resolveVariables: true,
    });
    expect(gqlFetch).toContain('operationName');
    expect(gqlFetch).toContain('query Me');

    const formDraft: RequestDraft = {
      ...restPostDraft,
      body: {
        mode: 'formData',
        items: [
          {
            id: 'f1',
            key: 'doc',
            value: '',
            filePath: '/tmp/a.pdf',
            fileName: 'a.pdf',
            itemType: 'file',
            enabled: true,
          },
        ],
      },
    };
    const formCurl = generateCodeSnippet('curl', formDraft, {}, { resolveVariables: true });
    expect(formCurl).toContain("-F 'doc=@/tmp/a.pdf'");
  });
});
