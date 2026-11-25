import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsePane } from '@/components/response/ResponsePane';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { createEmptyDraft, useTabsStore } from '@/store/useTabsStore';
import type { HttpExecutionResponse } from '@/types/api';

function seedTabWithResponse(response?: HttpExecutionResponse, extra?: Record<string, unknown>) {
  act(() => {
    useTabsStore.setState({
      tabs: [
        {
          id: 'tab-resp',
          title: 'Test Response',
          isDirty: false,
          draft: createEmptyDraft('rest'),
          isLoading: false,
          response,
          ...extra,
        },
      ],
      activeTabId: 'tab-resp',
    });
  });
}

describe('ResponsePane', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
  });

  it('renders empty state and loading state cleanly', () => {
    seedTabWithResponse(undefined);
    const { rerender } = render(
      <TooltipProvider>
        <ResponsePane />
      </TooltipProvider>,
    );
    expect(screen.getByText(/no response yet/i)).toBeInTheDocument();

    seedTabWithResponse(undefined, { isLoading: true, startedAtMs: Date.now() - 100 });
    rerender(
      <TooltipProvider>
        <ResponsePane />
      </TooltipProvider>,
    );
    expect(screen.getByText(/sending request/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders metrics, headers search filter, and cookies tab', async () => {
    const user = userEvent.setup();
    seedTabWithResponse({
      responseId: 'r-1',
      status: 200,
      statusText: 'OK',
      durationMs: 142,
      sizeBytes: 2048,
      finalUrl: 'https://api.test/users',
      redirectCount: 1,
      headers: [
        { key: 'content-type', value: 'application/json' },
        { key: 'x-request-id', value: 'req-777' },
      ],
      cookies: [
        {
          name: 'sid',
          value: 'tok_99',
          domain: 'api.test',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ],
      contentType: 'application/json',
      bodyKind: 'text',
      bodyText: '{"hello":"world"}',
      truncated: false,
    });

    const onOpenCookieJar = vi.fn();
    render(
      <TooltipProvider>
        <ResponsePane onOpenCookieJar={onOpenCookieJar} />
      </TooltipProvider>,
    );

    expect(screen.getByText('200 OK')).toBeInTheDocument();
    expect(screen.getByText('142 ms')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('1 redirect')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /headers/i }));
    const filter = screen.getByLabelText('Filter response headers');
    await user.type(filter, 'x-request');
    expect(screen.getByText('req-777')).toBeInTheDocument();
    expect(screen.queryByText('application/json')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /cookies/i }));
    expect(screen.getByText('sid')).toBeInTheDocument();
    expect(screen.getByText('HttpOnly')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open cookie jar/i }));
    expect(onOpenCookieJar).toHaveBeenCalledTimes(1);
  });

  it('renders image preview, binary save card, large-text warning, and SSL error retry', async () => {
    const user = userEvent.setup();

    seedTabWithResponse({
      responseId: 'r-img',
      status: 200,
      statusText: 'OK',
      durationMs: 18,
      sizeBytes: 128,
      finalUrl: 'https://api.test/logo.png',
      redirectCount: 0,
      headers: [],
      cookies: [],
      contentType: 'image/png',
      bodyKind: 'image',
      bodyBase64: 'iVBORw0KGgo=',
      truncated: false,
    });

    const { rerender } = render(
      <TooltipProvider>
        <ResponsePane />
      </TooltipProvider>,
    );
    const img = screen.getByAltText('Response preview') as HTMLImageElement;
    expect(img.src).toContain('data:image/png;base64,iVBORw0KGgo=');

    const invokeMock = vi.fn(async () => 4096);
    setTauriBridgeAdapter({
      invoke: invokeMock as <T>(c: string, a?: Record<string, unknown>) => Promise<T>,
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => 'C:\\tmp\\report.pdf'),
    });
    seedTabWithResponse({
      responseId: 'r-bin',
      status: 200,
      statusText: 'OK',
      durationMs: 22,
      sizeBytes: 4096,
      finalUrl: 'https://api.test/report.pdf',
      redirectCount: 0,
      headers: [],
      cookies: [],
      contentType: 'application/pdf',
      bodyKind: 'binary',
      truncated: false,
    });
    rerender(
      <TooltipProvider>
        <ResponsePane />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: /save file to disk/i }));
    expect(invokeMock).toHaveBeenCalledWith('save_response_body_to_file_cmd', {
      responseId: 'r-bin',
      targetPath: 'C:\\tmp\\report.pdf',
    });

    seedTabWithResponse({
      responseId: 'r-large',
      status: 200,
      statusText: 'OK',
      durationMs: 300,
      sizeBytes: 6 * 1024 * 1024,
      finalUrl: 'https://api.test/dump.txt',
      redirectCount: 0,
      headers: [],
      cookies: [],
      contentType: 'text/plain',
      bodyKind: 'large-text',
      bodyText: 'truncated preview',
      truncated: true,
    });
    rerender(
      <TooltipProvider>
        <ResponsePane />
      </TooltipProvider>,
    );
    expect(screen.getByText(/exceeds 5 MB/i)).toBeInTheDocument();

    seedTabWithResponse(undefined, {
      error: {
        code: 'HTTP_ERROR',
        message: 'error trying to connect: invalid peer certificate: UnknownIssuer',
      },
    });
    rerender(
      <TooltipProvider>
        <ResponsePane />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole('button', { name: /disable ssl verification/i }),
    ).toBeInTheDocument();
  });
});
