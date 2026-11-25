import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { HttpExecutionRequest, HttpExecutionResponse } from '@/types/api';

describe('useTabsStore', () => {
  const invoked: Array<{ cmd: string; args?: Record<string, unknown> }> = [];

  beforeEach(() => {
    invoked.length = 0;
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-1',
          name: 'API',
          description: '',
          auth: { type: 'bearer', token: '{{api_token}}' },
          variables: [
            { id: 'cv1', key: 'base_url', value: 'https://col.test', isSecret: false, enabled: true },
          ],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      folders: [],
      savedRequests: [],
      environments: [
        {
          id: 'g1',
          name: 'Global',
          isGlobal: true,
          variables: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'e1',
          name: 'Dev',
          isGlobal: false,
          variables: [
            { id: 'ev1', key: 'api_token', value: 'dev-secret', isSecret: true, enabled: true },
          ],
          createdAt: '',
          updatedAt: '',
        },
      ],
      history: [],
      cookies: [],
      isLoaded: true,
    });

    useSettingsStore.setState({
      settings: {
        theme: 'dark',
        layout: 'horizontal',
        verifySsl: true,
        followRedirects: true,
        maxRedirects: 10,
        timeoutMs: 30_000,
        sendCookies: true,
        activeEnvironmentId: 'e1',
        customShortcuts: {},
      },
      resolvedTheme: 'dark',
      isLoaded: true,
    });

    const mockInvoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      invoked.push({ cmd, args });
      if (cmd === 'send_http_request_cmd') {
        const resp: HttpExecutionResponse = {
          responseId: 'resp-1',
          status: 200,
          statusText: 'OK',
          durationMs: 25,
          sizeBytes: 12,
          finalUrl: 'https://col.test/items?limit=10',
          redirectCount: 0,
          headers: [{ key: 'content-type', value: 'application/json' }],
          cookies: [],
          contentType: 'application/json',
          bodyKind: 'text',
          bodyText: '{"ok":true}',
          truncated: false,
        };
        return resp;
      }
      if (cmd === 'record_history_cmd') {
        const entry = args?.entry as Record<string, unknown>;
        return {
          ...entry,
          id: 'h1',
          createdAt: '2026-11-25T00:00:00Z',
        };
      }
      if (cmd === 'list_cookies_cmd') {
        return [];
      }
      return undefined;
    });

    setTauriBridgeAdapter({
      invoke: <T,>(cmd: string, args?: Record<string, unknown>) =>
        mockInvoke(cmd, args) as Promise<T>,
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
    });
  });

  afterEach(() => {
    setTauriBridgeAdapter(null);
  });

  it('creates, duplicates, cycles, and closes tabs cleanly', () => {
    const store = useTabsStore.getState();
    const initialCount = store.tabs.length;
    const t2 = store.newTab('graphql', { url: 'https://api.example.com/graphql' });
    expect(useTabsStore.getState().tabs).toHaveLength(initialCount + 1);
    expect(useTabsStore.getState().activeTabId).toBe(t2);

    store.duplicateTab(t2);
    expect(useTabsStore.getState().tabs).toHaveLength(initialCount + 2);

    const clonedId = useTabsStore.getState().activeTabId;
    store.prevTab();
    expect(useTabsStore.getState().activeTabId).toBe(t2);
    store.nextTab();
    expect(useTabsStore.getState().activeTabId).toBe(clonedId);

    store.closeTab(clonedId);
    expect(useTabsStore.getState().tabs).toHaveLength(initialCount + 1);
  });

  it('resolves environment/collection variables and inherited collection auth before sending', async () => {
    const store = useTabsStore.getState();
    const tabId = store.newTab('rest', {
      url: '{{base_url}}/items',
      params: [{ id: 'p1', key: 'limit', value: '10', enabled: true }],
    });

    // Attach tab to collection so inherited auth & collection vars apply
    useTabsStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, collectionId: 'col-1' } : t)),
    }));

    await useTabsStore.getState().sendTabRequest(tabId);

    const sendCall = invoked.find((i) => i.cmd === 'send_http_request_cmd');
    expect(sendCall).toBeDefined();
    const req = sendCall?.args?.request as HttpExecutionRequest;
    expect(req.url).toBe('https://col.test/items?limit=10');
    expect(req.headers).toContainEqual({ key: 'Authorization', value: 'Bearer dev-secret' });

    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.response?.status).toBe(200);
    expect(useWorkspaceStore.getState().history).toHaveLength(1);
  });
});
