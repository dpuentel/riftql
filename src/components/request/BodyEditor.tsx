import { Wand2 } from 'lucide-react';
import { CodeEditor, type CodeEditorLanguage } from '@/components/editor/CodeEditor';
import { KeyValueEditor } from '@/components/request/KeyValueEditor';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { RawBodyLanguage, RequestBody } from '@/types/api';

interface BodyEditorProps {
  body: RequestBody;
  onChange: (next: RequestBody) => void;
}

const BODY_MODES: Array<{ mode: RequestBody['mode']; label: string }> = [
  { mode: 'none', label: 'None' },
  { mode: 'json', label: 'JSON' },
  { mode: 'formData', label: 'Form Data' },
  { mode: 'urlEncoded', label: 'URL Encoded' },
  { mode: 'raw', label: 'Raw' },
];

export function BodyEditor({ body, onChange }: BodyEditorProps) {
  const switchMode = (mode: RequestBody['mode']) => {
    if (mode === body.mode) return;
    switch (mode) {
      case 'none':
        onChange({ mode: 'none' });
        break;
      case 'json':
        onChange({
          mode: 'json',
          content: body.mode === 'raw' ? body.content : '{\n  \n}',
        });
        break;
      case 'raw':
        onChange({
          mode: 'raw',
          language: 'text',
          content: body.mode === 'json' ? body.content : '',
        });
        break;
      case 'urlEncoded':
        onChange({
          mode: 'urlEncoded',
          items: [],
        });
        break;
      case 'formData':
        onChange({
          mode: 'formData',
          items: [],
        });
        break;
    }
  };

  const jsonValidation = (() => {
    if (body.mode !== 'json' || !body.content.trim()) return null;
    try {
      JSON.parse(body.content);
      return { valid: true };
    } catch {
      return { valid: false };
    }
  })();

  const formatJson = () => {
    if (body.mode !== 'json') return;
    try {
      const formatted = JSON.stringify(JSON.parse(body.content), null, 2);
      onChange({ mode: 'json', content: formatted });
    } catch {
      // Leave unformatted if invalid JSON
    }
  };

  const mapRawLanguage = (lang: RawBodyLanguage): CodeEditorLanguage => {
    if (lang === 'xml') return 'xml';
    if (lang === 'html') return 'html';
    return 'text';
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
          {BODY_MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => switchMode(m.mode)}
              className={cn(
                'cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors',
                body.mode === m.mode
                  ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {body.mode === 'json' && (
          <div className="flex items-center gap-2">
            {jsonValidation && (
              <Badge variant={jsonValidation.valid ? 'success' : 'warning'}>
                {jsonValidation.valid ? 'Valid JSON' : 'Invalid / Template JSON'}
              </Badge>
            )}
            <ActionTooltip label="Format JSON" actionId="formatBody">
              <Button size="xs" variant="secondary" onClick={formatJson}>
                <Wand2 className="h-3 w-3" />
                <span>Format</span>
              </Button>
            </ActionTooltip>
          </div>
        )}

        {body.mode === 'raw' && (
          <Select
            value={body.language}
            onValueChange={(lang) =>
              onChange({ ...body, language: lang as RawBodyLanguage })
            }
          >
            <SelectTrigger className="h-6 w-32 text-[11px]" aria-label="Raw language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Plain Text</SelectItem>
              <SelectItem value="xml">XML</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
              <SelectItem value="javascript">JavaScript</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {body.mode === 'none' && (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          This request does not have a body.
        </div>
      )}

      {body.mode === 'json' && (
        <div className="min-h-[160px] flex-1">
          <CodeEditor
            value={body.content}
            language="json"
            placeholder='{"key": "value"}'
            onChange={(content) => onChange({ mode: 'json', content })}
            ariaLabel="JSON body editor"
          />
        </div>
      )}

      {body.mode === 'raw' && (
        <div className="min-h-[160px] flex-1">
          <CodeEditor
            value={body.content}
            language={mapRawLanguage(body.language)}
            placeholder="Raw payload..."
            onChange={(content) => onChange({ ...body, content })}
            ariaLabel="Raw body editor"
          />
        </div>
      )}

      {body.mode === 'urlEncoded' && (
        <div className="min-h-0 flex-1 overflow-auto rift-scroll">
          <KeyValueEditor
            items={body.items}
            onChange={(items) => onChange({ mode: 'urlEncoded', items })}
            emptyHint="No URL-encoded fields yet."
          />
        </div>
      )}

      {body.mode === 'formData' && (
        <div className="min-h-0 flex-1 overflow-auto rift-scroll">
          <KeyValueEditor
            items={body.items}
            allowFile
            onChange={(items) => onChange({ mode: 'formData', items })}
            emptyHint="No multipart form fields yet. Add text fields or attach local files."
          />
        </div>
      )}
    </div>
  );
}
