import * as React from 'react';
import { Cookie, Plus, Search, Trash2 } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

interface CookieJarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CookieJarModal({ open, onOpenChange }: CookieJarModalProps) {
  const sendCookies = useSettingsStore((s) => s.settings.sendCookies);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const cookies = useWorkspaceStore((s) => s.cookies);
  const upsertCookie = useWorkspaceStore((s) => s.upsertCookie);
  const deleteCookie = useWorkspaceStore((s) => s.deleteCookie);
  const clearCookiesByDomain = useWorkspaceStore((s) => s.clearCookiesByDomain);
  const clearAllCookies = useWorkspaceStore((s) => s.clearAllCookies);

  const [domainFilter, setDomainFilter] = React.useState('');
  const [newDomain, setNewDomain] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const [newValue, setNewValue] = React.useState('');
  const [newPath, setNewPath] = React.useState('/');

  const filtered = cookies.filter((c) => {
    const q = domainFilter.trim().toLowerCase();
    if (!q) return true;
    return c.domain.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  const handleAddCookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim() || !newName.trim()) return;
    await upsertCookie({
      id: '',
      domain: newDomain.trim().toLowerCase(),
      path: newPath.trim() || '/',
      name: newName.trim(),
      value: newValue,
      secure: false,
      httpOnly: false,
      hostOnly: true,
      updatedAt: new Date().toISOString(),
    });
    setNewName('');
    setNewValue('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cookie className="h-4 w-4 text-[var(--accent)]" />
            <span>Domain Cookie Jar</span>
          </DialogTitle>
          <DialogDescription>
            Automatically capture <code className="font-mono-code">Set-Cookie</code> responses and
            resend matching cookies per domain and path.
          </DialogDescription>
        </DialogHeader>

        {/* Global Auto-Cookie Switch */}
        <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[var(--text-primary)]">
              Automatically send &amp; store cookies by domain
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              Disable to stop RiftQL from sending stored jar cookies (can also be overridden per
              request).
            </span>
          </div>
          <Switch
            aria-label="Enable automatic cookie jar"
            checked={sendCookies}
            onCheckedChange={(checked) => void updateSettings({ sendCookies: checked })}
          />
        </div>

        {/* Filter & Clear */}
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1.5 left-2.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <Input
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              placeholder="Filter by domain or cookie name..."
              aria-label="Filter cookies"
              className="pl-8"
            />
          </div>
          {domainFilter.trim() && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void clearCookiesByDomain(domainFilter.trim())}
            >
              Clear Domain
            </Button>
          )}
          <Button
            size="xs"
            variant="destructive"
            disabled={cookies.length === 0}
            onClick={() => void clearAllCookies()}
          >
            Clear All
          </Button>
        </div>

        {/* Cookies Table */}
        <div className="h-52 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] rift-scroll">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px] text-[var(--text-secondary)]">
                <th className="px-2.5 py-1.5">Domain</th>
                <th className="px-2.5 py-1.5">Name</th>
                <th className="px-2.5 py-1.5">Value</th>
                <th className="px-2.5 py-1.5">Path</th>
                <th className="px-2.5 py-1.5">Flags</th>
                <th className="w-8 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-xs text-[var(--text-secondary)]"
                  >
                    No cookies stored.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--border-subtle)]/70 last:border-b-0 hover:bg-[var(--bg-hover)]"
                  >
                    <td className="px-2.5 py-1.5 font-mono-code text-[var(--text-primary)]">
                      {c.domain}
                    </td>
                    <td className="px-2.5 py-1.5 font-mono-code font-medium text-[var(--text-primary)]">
                      {c.name}
                    </td>
                    <td className="max-w-[160px] truncate px-2.5 py-1.5 font-mono-code text-[var(--text-secondary)]">
                      {c.value}
                    </td>
                    <td className="px-2.5 py-1.5 font-mono-code text-[var(--text-secondary)]">
                      {c.path}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {c.httpOnly && <Badge>HttpOnly</Badge>}
                        {c.secure && <Badge variant="success">Secure</Badge>}
                        {c.hostOnly && <Badge>HostOnly</Badge>}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <ActionTooltip label="Delete Cookie">
                        <button
                          type="button"
                          aria-label={`Delete cookie ${c.name}`}
                          onClick={() => void deleteCookie(c.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[#F87171]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </ActionTooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Manual Cookie Add */}
        <form
          onSubmit={(e) => void handleAddCookie(e)}
          className="mt-3 grid grid-cols-[1.2fr_1fr_1.3fr_0.6fr_auto] gap-1.5"
        >
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="api.example.com"
            aria-label="Cookie domain"
            className="font-mono-code"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="session"
            aria-label="Cookie name"
            className="font-mono-code"
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            aria-label="Cookie value"
            className="font-mono-code"
          />
          <Input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/"
            aria-label="Cookie path"
            className="font-mono-code"
          />
          <Button type="submit" size="sm" variant="secondary">
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </Button>
        </form>

        <DialogFooter>
          <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
