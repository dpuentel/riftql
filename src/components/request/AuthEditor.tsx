import { Shield, ShieldCheck, ShieldOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolveEffectiveAuth } from '@/lib/auth';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { ApiKeyTarget, AuthConfig } from '@/types/api';

interface AuthEditorProps {
  auth: AuthConfig;
  collectionId?: string;
  folderId?: string;
  onChange: (next: AuthConfig) => void;
  allowInherit?: boolean;
}

export function AuthEditor({
  auth,
  collectionId,
  folderId,
  onChange,
  allowInherit = true,
}: AuthEditorProps) {
  const folders = useWorkspaceStore((s) => s.folders);
  const collections = useWorkspaceStore((s) => s.collections);

  const inherited = resolveEffectiveAuth(
    { type: 'inherit' },
    folderId,
    collectionId,
    folders,
    collections,
  );

  const handleTypeChange = (nextType: AuthConfig['type']) => {
    switch (nextType) {
      case 'inherit':
        onChange({ type: 'inherit' });
        break;
      case 'none':
        onChange({ type: 'none' });
        break;
      case 'bearer':
        onChange({
          type: 'bearer',
          token: auth.type === 'bearer' ? auth.token : '',
        });
        break;
      case 'basic':
        onChange({
          type: 'basic',
          username: auth.type === 'basic' ? auth.username : '',
          password: auth.type === 'basic' ? auth.password : '',
        });
        break;
      case 'apiKey':
        onChange({
          type: 'apiKey',
          key: auth.type === 'apiKey' ? auth.key : 'X-API-Key',
          value: auth.type === 'apiKey' ? auth.value : '',
          addTo: auth.type === 'apiKey' ? auth.addTo : 'header',
        });
        break;
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Authorization Type
        </span>
        <Select value={auth.type} onValueChange={(v) => handleTypeChange(v as AuthConfig['type'])}>
          <SelectTrigger className="w-52" aria-label="Authorization Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowInherit && <SelectItem value="inherit">Inherit from Parent</SelectItem>}
            <SelectItem value="none">No Auth</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="apiKey">API Key</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {auth.type === 'inherit' && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 text-xs text-[var(--text-secondary)]">
          {inherited.auth.type === 'none' ? (
            <>
              <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No parent folder or collection auth configured. Request will be sent without auth
                headers.
              </span>
            </>
          ) : (
            <>
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span>
                Inheriting <strong className="text-[var(--text-primary)]">{inherited.auth.type}</strong>{' '}
                credentials from <strong className="text-[var(--text-primary)]">{inherited.sourceLabel}</strong>.
              </span>
            </>
          )}
        </div>
      )}

      {auth.type === 'none' && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 text-xs text-[var(--text-secondary)]">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          <span>This request does not send any automatic authorization credentials.</span>
        </div>
      )}

      {auth.type === 'bearer' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-[var(--text-secondary)]">
            Token
          </label>
          <Input
            value={auth.token}
            placeholder="{{token}} or eyJhbGci..."
            onChange={(e) => onChange({ type: 'bearer', token: e.target.value })}
            className="font-mono-code"
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              Username
            </label>
            <Input
              value={auth.username}
              placeholder="{{username}}"
              onChange={(e) =>
                onChange({ ...auth, username: e.target.value })
              }
              className="font-mono-code"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              Password
            </label>
            <Input
              type="password"
              value={auth.password}
              placeholder="••••••"
              onChange={(e) =>
                onChange({ ...auth, password: e.target.value })
              }
              className="font-mono-code"
            />
          </div>
        </div>
      )}

      {auth.type === 'apiKey' && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              Key
            </label>
            <Input
              value={auth.key}
              placeholder="X-API-Key"
              onChange={(e) => onChange({ ...auth, key: e.target.value })}
              className="font-mono-code"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              Value
            </label>
            <Input
              value={auth.value}
              placeholder="{{api_key}}"
              onChange={(e) => onChange({ ...auth, value: e.target.value })}
              className="font-mono-code"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              Add To
            </label>
            <Select
              value={auth.addTo}
              onValueChange={(v) => onChange({ ...auth, addTo: v as ApiKeyTarget })}
            >
              <SelectTrigger aria-label="Add API key to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Params</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
