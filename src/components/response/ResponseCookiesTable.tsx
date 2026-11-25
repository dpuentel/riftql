import { Cookie } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ParsedResponseCookie } from '@/types/api';

interface ResponseCookiesTableProps {
  cookies: ParsedResponseCookie[];
  onOpenCookieJar?: () => void;
}

export function ResponseCookiesTable({
  cookies,
  onOpenCookieJar,
}: ResponseCookiesTableProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">
          Parsed <code className="font-mono-code">Set-Cookie</code> headers returned by this
          response.
        </span>
        {onOpenCookieJar && (
          <ActionTooltip label="Manage Domain Cookie Jar" actionId="openCookies">
            <Button size="xs" variant="secondary" onClick={onOpenCookieJar}>
              <Cookie className="h-3 w-3" />
              <span>Open Cookie Jar</span>
            </Button>
          </ActionTooltip>
        )}
      </div>

      {cookies.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border-subtle)] p-6 text-center text-xs text-[var(--text-secondary)]">
          No cookies were set in this response.
        </div>
      ) : (
        <div className="overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] rift-scroll">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px] font-medium text-[var(--text-secondary)]">
                <th className="px-2.5 py-1.5">Name</th>
                <th className="px-2.5 py-1.5">Value</th>
                <th className="px-2.5 py-1.5">Domain</th>
                <th className="px-2.5 py-1.5">Path</th>
                <th className="px-2.5 py-1.5">Expires / Max-Age</th>
                <th className="px-2.5 py-1.5">Flags</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((c, idx) => (
                <tr
                  key={`${c.name}-${idx}`}
                  className="border-b border-[var(--border-subtle)]/70 last:border-b-0 hover:bg-[var(--bg-hover)]"
                >
                  <td className="px-2.5 py-1.5 font-mono-code font-medium text-[var(--text-primary)]">
                    {c.name}
                  </td>
                  <td className="max-w-[200px] truncate px-2.5 py-1.5 font-mono-code text-[var(--text-secondary)]">
                    {c.value}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono-code text-[var(--text-secondary)]">
                    {c.domain || 'Host-only'}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono-code text-[var(--text-secondary)]">
                    {c.path || '/'}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono-code text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {c.maxAge !== undefined
                      ? `${c.maxAge}s`
                      : c.expires || 'Session'}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {c.httpOnly && <Badge>HttpOnly</Badge>}
                      {c.secure && <Badge variant="success">Secure</Badge>}
                      {c.sameSite && <Badge variant="accent">{c.sameSite}</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
