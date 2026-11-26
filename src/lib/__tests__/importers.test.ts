import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceExportFromImport,
  countImportStats,
  parseImportText,
} from '@/lib/importers';
import type { CollectionRecord, EnvironmentRecord, FolderRecord, SavedRequestRecord } from '@/types/storage';

const SAMPLE_COLLECTION: CollectionRecord = {
  id: 'existing-col',
  name: 'Platform API',
  description: '',
  baseUrl: 'https://existing.internal',
  auth: { type: 'none' },
  variables: [],
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SAMPLE_FOLDER: FolderRecord = {
  id: 'existing-fld',
  collectionId: 'existing-col',
  name: 'Core',
  baseUrl: '',
  auth: { type: 'inherit' },
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SAMPLE_REQUEST: SavedRequestRecord = {
  id: 'existing-req',
  collectionId: 'existing-col',
  folderId: 'existing-fld',
  name: 'Existing Health',
  protocol: 'rest',
  method: 'GET',
  url: '/health',
  params: [],
  headers: [],
  auth: { type: 'inherit' },
  body: { mode: 'none' },
  graphql: { query: '', variables: '{}' },
  settings: {},
  sortOrder: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SAMPLE_GLOBAL_ENV: EnvironmentRecord = {
  id: 'global-env',
  name: 'Global',
  isGlobal: true,
  variables: [{ id: 'gvar-1', key: 'globalSecret', value: 'keep-me', isSecret: true, enabled: true }],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('Altair GraphQL importer', () => {
  it('parses an Altair .agq single window query with bearer auth, headers, variables, and query params', () => {
    const agq = {
      version: 1,
      type: 'window',
      windowName: 'Fetch Account',
      apiUrl: 'https://gql.example.com/graphql?tenant=acme',
      query: 'query GetAccount($id: ID!) { account(id: $id) { id name } }',
      variables: '{"id":"42"}',
      selectedOperation: 'GetAccount',
      headers: [
        { key: 'X-Client', value: 'riftql', enabled: true },
        { key: 'X-Disabled', value: 'off', enabled: false },
      ],
      authorizationType: 'bearer',
      authorizationData: { token: '{{gql_token}}' },
    };

    const parsed = parseImportText(JSON.stringify(agq), 'account.agq');
    expect(parsed.format).toBe('altair-query');
    expect(parsed.sourceName).toBe('Fetch Account');
    const req = parsed.collections[0].requests[0];
    expect(req.protocol).toBe('graphql');
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ mode: 'graphql' });
    expect(req.url).toBe('https://gql.example.com/graphql');
    expect(req.params).toHaveLength(1);
    expect(req.params[0]).toMatchObject({ key: 'tenant', value: 'acme', enabled: true });
    expect(req.headers).toHaveLength(2);
    expect(req.headers[1].enabled).toBe(false);
    expect(req.auth).toEqual({ type: 'bearer', token: '{{gql_token}}' });
    expect(req.graphql).toEqual({
      query: 'query GetAccount($id: ID!) { account(id: $id) { id name } }',
      variables: '{\n  "id": "42"\n}',
      operationName: 'GetAccount',
    });
  });

  it('parses an Altair .agc collection with nested subcollections, api-key/basic auth, and script warning', () => {
    const agc = {
      version: 1,
      type: 'collection',
      title: 'Storefront GraphQL',
      queries: [
        {
          version: 1,
          type: 'window',
          windowName: 'Viewer',
          apiUrl: 'https://shop.example/graphql',
          query: '{ viewer { email } }',
          variables: '{}',
          authorizationType: 'api-key',
          authorizationData: { headerName: 'X-Api-Key', headerValue: 'abc' },
          preRequest: { enabled: true, script: 'console.log(1)' },
        },
      ],
      collections: [
        {
          version: 1,
          type: 'collection',
          title: 'Checkout',
          queries: [
            {
              version: 1,
              type: 'window',
              windowName: 'Create Cart',
              apiUrl: 'https://shop.example/graphql',
              query: 'mutation { createCart { id } }',
              authorizationType: 'basic',
              authorizationData: { username: 'u1', password: 'p1' },
            },
          ],
        },
      ],
    };

    const parsed = parseImportText(JSON.stringify(agc), 'storefront.agc');
    expect(parsed.format).toBe('altair-collection');
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatch(/scripts/i);
    const col = parsed.collections[0];
    expect(col.name).toBe('Storefront GraphQL');
    expect(col.requests[0].auth).toEqual({
      type: 'apiKey',
      key: 'X-Api-Key',
      value: 'abc',
      addTo: 'header',
    });
    expect(col.folders).toHaveLength(1);
    expect(col.folders[0].name).toBe('Checkout');
    expect(col.folders[0].requests[0].auth).toEqual({
      type: 'basic',
      username: 'u1',
      password: 'p1',
    });
  });

  it('parses Altair environments (.agx / variablesJson bundle)', () => {
    const bundle = {
      base: { variablesJson: '{"endpoint":"https://base.gql/graphql"}' },
      subEnvironments: [
        { title: 'Staging GQL', variablesJson: '{"endpoint":"https://staging.gql/graphql","v":2}' },
      ],
    };
    const parsed = parseImportText(JSON.stringify(bundle), 'envs.agx');
    expect(parsed.format).toBe('altair-environment');
    expect(parsed.environments).toHaveLength(2);
    expect(parsed.environments[1].name).toBe('Staging GQL');
    expect(parsed.environments[1].variables).toEqual([
      expect.objectContaining({ key: 'endpoint', value: 'https://staging.gql/graphql' }),
      expect.objectContaining({ key: 'v', value: '2' }),
    ]);
  });
});

describe('Postman v2.1 & Environment importer', () => {
  it('parses nested folders, URL objects without duplicating query params, auth v2.1/v2.0, bodies, and collection vars', () => {
    const postman = {
      info: {
        name: 'Payments API',
        description: 'Stripe-like endpoints',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{api_token}}', type: 'string' }],
      },
      variable: [
        { key: 'baseUrl', value: 'https://pay.test', type: 'string' },
        { key: 'webhookSecret', value: 'whsec_123', type: 'secret' },
      ],
      item: [
        {
          name: 'Charges',
          auth: {
            type: 'apikey',
            apikey: [
              { key: 'key', value: 'X-Charge-Key' },
              { key: 'value', value: 'ck_live' },
              { key: 'in', value: 'query' },
            ],
          },
          item: [
            {
              name: 'List Charges',
              request: {
                method: 'GET',
                url: {
                  raw: 'https://pay.test/v1/charges?limit=10&debug=1',
                  query: [
                    { key: 'limit', value: '10', disabled: false },
                    { key: 'debug', value: '1', disabled: true },
                  ],
                },
                header: [{ key: 'Accept', value: 'application/json' }],
              },
            },
            {
              name: 'Create Charge',
              request: {
                method: 'POST',
                url: 'https://pay.test/v1/charges',
                auth: { type: 'noauth' },
                body: {
                  mode: 'raw',
                  raw: '{"amount":1000}',
                  options: { raw: { language: 'json' } },
                },
              },
            },
            {
              name: 'Upload Receipt',
              request: {
                method: 'POST',
                url: 'https://pay.test/v1/receipts',
                body: {
                  mode: 'formdata',
                  formdata: [
                    { key: 'note', value: 'Invoice', type: 'text' },
                    { key: 'file', type: 'file', src: '/tmp/receipt.pdf' },
                  ],
                },
              },
            },
            {
              name: 'GraphQL Ledger',
              request: {
                method: 'POST',
                url: 'https://pay.test/graphql',
                auth: {
                  type: 'oauth2',
                  oauth2: [{ key: 'addTokenTo', value: 'header' }],
                },
                body: {
                  mode: 'graphql',
                  graphql: {
                    query: 'query Ledger { entries { id } }',
                    variables: '{"first":5}',
                  },
                },
              },
            },
          ],
        },
        {
          name: 'Legacy Form Auth',
          request: {
            method: 'POST',
            url: 'https://pay.test/oauth/token',
            auth: {
              type: 'basic',
              basic: { username: 'client', password: 'secret' },
            },
            body: {
              mode: 'urlencoded',
              urlencoded: [{ key: 'grant_type', value: 'client_credentials' }],
            },
          },
        },
      ],
    };

    const parsed = parseImportText(JSON.stringify(postman), 'payments.postman_collection.json');
    expect(parsed.format).toBe('postman-collection');
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toMatch(/oauth2/i);

    const col = parsed.collections[0];
    expect(col.name).toBe('Payments API');
    expect(col.auth).toEqual({ type: 'bearer', token: '{{api_token}}' });
    expect(col.variables).toEqual([
      expect.objectContaining({ key: 'baseUrl', value: 'https://pay.test', isSecret: false }),
      expect.objectContaining({ key: 'webhookSecret', value: 'whsec_123', isSecret: true }),
    ]);

    const chargesFolder = col.folders[0];
    expect(chargesFolder.auth).toEqual({
      type: 'apiKey',
      key: 'X-Charge-Key',
      value: 'ck_live',
      addTo: 'query',
    });

    const listReq = chargesFolder.requests[0];
    expect(listReq.url).toBe('https://pay.test/v1/charges');
    expect(listReq.params).toHaveLength(2);
    expect(listReq.params[0]).toMatchObject({ key: 'limit', value: '10', enabled: true });
    expect(listReq.params[1]).toMatchObject({ key: 'debug', value: '1', enabled: false });

    const createReq = chargesFolder.requests[1];
    expect(createReq.auth).toEqual({ type: 'none' });
    expect(createReq.body).toEqual({ mode: 'json', content: '{"amount":1000}' });

    const uploadReq = chargesFolder.requests[2];
    expect(uploadReq.body).toEqual({
      mode: 'formData',
      items: [
        expect.objectContaining({ key: 'note', value: 'Invoice', itemType: 'text' }),
        expect.objectContaining({
          key: 'file',
          itemType: 'file',
          filePath: '/tmp/receipt.pdf',
          fileName: 'receipt.pdf',
        }),
      ],
    });

    const gqlReq = chargesFolder.requests[3];
    expect(gqlReq.protocol).toBe('graphql');
    expect(gqlReq.body).toEqual({ mode: 'graphql' });
    expect(gqlReq.graphql.variables).toBe('{\n  "first": 5\n}');

    const legacyReq = col.requests[0];
    expect(legacyReq.auth).toEqual({ type: 'basic', username: 'client', password: 'secret' });
    expect(legacyReq.body).toMatchObject({ mode: 'urlEncoded' });
  });

  it('parses Postman Environments including secret variables', () => {
    const pmEnv = {
      name: 'Production',
      _postman_variable_scope: 'environment',
      values: [
        { key: 'host', value: 'https://prod.example.com', type: 'default', enabled: true },
        { key: 'clientSecret', value: 's3cr3t', type: 'secret', enabled: true },
        { key: 'unused', value: '0', type: 'default', enabled: false },
      ],
    };

    const parsed = parseImportText(JSON.stringify(pmEnv));
    expect(parsed.format).toBe('postman-environment');
    expect(parsed.environments).toHaveLength(1);
    expect(parsed.environments[0].name).toBe('Production');
    expect(parsed.environments[0].variables).toEqual([
      expect.objectContaining({ key: 'host', value: 'https://prod.example.com', isSecret: false, enabled: true }),
      expect.objectContaining({ key: 'clientSecret', value: 's3cr3t', isSecret: true, enabled: true }),
      expect.objectContaining({ key: 'unused', value: '0', isSecret: false, enabled: false }),
    ]);
  });
});

describe('Insomnia v4 importer', () => {
  it('parses workspaces, nested request groups, REST/GraphQL requests, and environments', () => {
    const insomnia = {
      _type: 'export',
      __export_format: 4,
      resources: [
        { _id: 'wrk_1', _type: 'workspace', name: 'Core Services', description: 'Internal' },
        { _id: 'grp_1', parentId: 'wrk_1', _type: 'request_group', name: 'Users', metaSortKey: 1 },
        { _id: 'grp_2', parentId: 'grp_1', _type: 'request_group', name: 'Admin', metaSortKey: 2 },
        {
          _id: 'req_1',
          parentId: 'grp_2',
          _type: 'request',
          name: 'Ban User',
          method: 'POST',
          url: 'https://core.test/admin/ban',
          authentication: { type: 'bearer', token: '{{admin_jwt}}' },
          body: { mimeType: 'application/json', text: '{"reason":"spam"}' },
        },
        {
          _id: 'req_2',
          parentId: 'wrk_1',
          _type: 'request',
          name: 'GraphQL Introspect',
          method: 'POST',
          url: 'https://core.test/graphql',
          body: { mimeType: 'application/graphql', text: '{"query":"{ __typename }","variables":{}}' },
        },
        {
          _id: 'env_sub',
          parentId: 'env_base',
          _type: 'environment',
          name: 'QA',
          isPrivate: true,
          data: { api_key: 'qa-key' },
        },
      ],
    };

    const parsed = parseImportText(JSON.stringify(insomnia));
    expect(parsed.format).toBe('insomnia-v4');
    const stats = countImportStats(parsed);
    expect(stats).toMatchObject({
      collections: 1,
      folders: 2,
      requests: 2,
      restRequests: 1,
      graphqlRequests: 1,
      environments: 1,
    });

    const col = parsed.collections[0];
    expect(col.name).toBe('Core Services');
    expect(col.folders[0].folders[0].name).toBe('Admin');
    expect(col.folders[0].folders[0].requests[0].auth).toEqual({
      type: 'bearer',
      token: '{{admin_jwt}}',
    });
    expect(col.requests[0].protocol).toBe('graphql');
    expect(parsed.environments[0].variables[0]).toMatchObject({
      key: 'api_key',
      value: 'qa-key',
      isSecret: true,
    });
  });
});

describe('OpenAPI 3.x & Swagger 2.0 importers', () => {
  it('parses OpenAPI 3.0 with servers, tags, $ref resolution, circular refs, and example bodies', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Catalog API', description: 'Products & Inventory' },
      servers: [
        {
          url: 'https://{env}.catalog.test/v2',
          variables: { env: { default: 'sandbox' } },
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
        schemas: {
          Node: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              next: { $ref: '#/components/schemas/Node' },
            },
          },
          CreateProduct: {
            type: 'object',
            properties: {
              sku: { type: 'string', example: 'SKU-001' },
              price: { type: 'number', default: 19.99 },
              node: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }],
      paths: {
        '/products/{productId}': {
          parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            tags: ['Products'],
            summary: 'Get Product',
            parameters: [{ name: 'expand', in: 'query', required: false, schema: { type: 'string', example: 'variants' } }],
          },
          put: {
            tags: ['Products'],
            summary: 'Update Product',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateProduct' },
                },
              },
            },
          },
        },
      },
    };

    const parsed = parseImportText(JSON.stringify(spec));
    expect(parsed.format).toBe('openapi-3');
    const col = parsed.collections[0];
    expect(col.name).toBe('Catalog API');
    expect(col.baseUrl).toBe('https://sandbox.catalog.test/v2');
    expect(col.auth).toEqual({ type: 'bearer', token: '{{bearer_token}}' });
    expect(col.folders).toHaveLength(1);
    expect(col.folders[0].name).toBe('Products');

    const getReq = col.folders[0].requests[0];
    expect(getReq.url).toBe('/products/{{productId}}');
    expect(getReq.params[0]).toMatchObject({ key: 'expand', value: 'variants', enabled: true });

    const putReq = col.folders[0].requests[1];
    expect(putReq.body.mode).toBe('json');
    if (putReq.body.mode === 'json') {
      const parsedBody = JSON.parse(putReq.body.content) as Record<string, unknown>;
      expect(parsedBody.sku).toBe('SKU-001');
      expect(parsedBody.price).toBe(19.99);
      expect(parsedBody.node).toMatchObject({
        id: '00000000-0000-0000-0000-000000000000',
      });
    }
  });

  it('parses Swagger 2.0 with host + basePath, apiKey security, and body parameter', () => {
    const swagger = {
      swagger: '2.0',
      info: { title: 'Legacy Users' },
      host: 'legacy.api.test',
      basePath: '/api',
      schemes: ['https'],
      securityDefinitions: {
        ApiKey: { type: 'apiKey', name: 'X-Legacy-Key', in: 'header' },
      },
      paths: {
        '/users': {
          post: {
            tags: ['Users'],
            summary: 'Create User',
            parameters: [
              {
                in: 'body',
                name: 'body',
                schema: {
                  type: 'object',
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            ],
          },
        },
      },
    };

    const parsed = parseImportText(JSON.stringify(swagger));
    expect(parsed.format).toBe('swagger-2');
    expect(parsed.collections[0].baseUrl).toBe('https://legacy.api.test/api');
    expect(parsed.collections[0].auth).toEqual({
      type: 'apiKey',
      key: 'X-Legacy-Key',
      value: '{{api_key}}',
      addTo: 'header',
    });
    const postReq = parsed.collections[0].folders[0].requests[0];
    expect(postReq.body).toEqual({
      mode: 'json',
      content: '{\n  "email": "user@example.com"\n}',
    });
  });

  it('gives an actionable hint when given YAML OpenAPI text', () => {
    expect(() =>
      parseImportText('openapi: 3.0.3\ninfo:\n  title: Test\npaths: {}', 'spec.yaml'),
    ).toThrow(/Export or convert the spec to JSON/i);
  });
});

describe('buildWorkspaceExportFromImport destination options', () => {
  const existing = {
    collections: [SAMPLE_COLLECTION],
    folders: [SAMPLE_FOLDER],
    savedRequests: [SAMPLE_REQUEST],
    environments: [
      SAMPLE_GLOBAL_ENV,
      {
        id: 'env-prod',
        name: 'Production',
        isGlobal: false,
        variables: [],
        createdAt: '',
        updatedAt: '',
      },
    ],
  };

  it('creates a new collection with custom name override and fresh IDs', () => {
    const parsed = parseImportText(
      JSON.stringify({
        info: { name: 'Raw Name', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: [{ name: 'Ping', request: { method: 'GET', url: 'https://ping.test' } }],
      }),
    );

    const built = buildWorkspaceExportFromImport(
      parsed,
      { mode: 'new-collection', newCollectionName: 'Custom Renamed Collection' },
      existing,
    );

    expect(built.summary).toMatchObject({
      collections: 1,
      folders: 0,
      requests: 1,
      environments: 0,
      targetName: 'Custom Renamed Collection',
    });
    expect(built.exportPayload.collections[0].id).not.toBe('existing-col');
    expect(built.exportPayload.collections[0].sortOrder).toBe(1);
    expect(built.exportPayload.savedRequests[0].collectionId).toBe(
      built.exportPayload.collections[0].id,
    );
  });

  it('merges directly into an existing folder without wrapper subfolder, rebasing relative URLs and appending sortOrder', () => {
    const parsed = parseImportText(
      JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Billing Microservice' },
        servers: [{ url: 'https://billing.service/v1' }],
        paths: {
          '/invoices': { get: { summary: 'List Invoices' } },
        },
      }),
    );

    const built = buildWorkspaceExportFromImport(
      parsed,
      {
        mode: 'existing-collection',
        targetCollectionId: 'existing-col',
        targetFolderId: 'existing-fld',
        wrapInSubfolder: false,
      },
      existing,
    );

    expect(built.exportPayload.collections).toHaveLength(0);
    expect(built.exportPayload.folders).toHaveLength(0);
    expect(built.exportPayload.savedRequests).toHaveLength(1);
    expect(built.exportPayload.savedRequests[0]).toMatchObject({
      collectionId: 'existing-col',
      folderId: 'existing-fld',
      name: 'List Invoices',
      url: 'https://billing.service/v1/invoices',
      sortOrder: 5,
    });
  });

  it('wraps into a new subfolder inside an existing collection and deduplicates environment names', () => {
    const parsed = parseImportText(
      JSON.stringify({
        info: { name: 'Users', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: [{ name: 'Get Users', request: { method: 'GET', url: 'https://users.test' } }],
      }),
    );

    const built = buildWorkspaceExportFromImport(
      parsed,
      {
        mode: 'existing-collection',
        targetCollectionId: 'existing-col',
        wrapInSubfolder: true,
        subfolderName: 'Imported Users',
      },
      existing,
    );

    expect(built.exportPayload.collections).toHaveLength(0);
    expect(built.exportPayload.folders).toHaveLength(1);
    expect(built.exportPayload.folders[0]).toMatchObject({
      collectionId: 'existing-col',
      name: 'Imported Users',
    });
    expect(built.exportPayload.savedRequests[0].folderId).toBe(
      built.exportPayload.folders[0].id,
    );

    // Environment deduplication & Global safety
    const envParsed = parseImportText(
      JSON.stringify({
        name: 'Production',
        _postman_variable_scope: 'environment',
        values: [{ key: 'token', value: 'xyz', type: 'secret' }],
      }),
    );
    const envBuilt = buildWorkspaceExportFromImport(
      envParsed,
      { mode: 'new-collection', importEnvironments: true },
      existing,
    );
    expect(envBuilt.exportPayload.environments).toHaveLength(1);
    expect(envBuilt.exportPayload.environments[0].isGlobal).toBe(false);
    expect(envBuilt.exportPayload.environments[0].name).toBe('Production (Imported)');
  });
});
