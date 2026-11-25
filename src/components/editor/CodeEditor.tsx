import * as React from 'react';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter } from '@codemirror/lint';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { graphql as cm6Graphql, updateSchema } from 'cm6-graphql';
import type { GraphQLSchema } from 'graphql';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';

export type CodeEditorLanguage = 'json' | 'xml' | 'html' | 'graphql' | 'text';

const riftDarkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.definitionKeyword], color: '#C084FC' },
  { tag: [tags.string, tags.special(tags.string)], color: '#34D399' },
  { tag: [tags.number, tags.bool, tags.null], color: '#FBBF24' },
  { tag: [tags.propertyName, tags.attributeName], color: '#60A5FA' },
  { tag: [tags.typeName, tags.className, tags.tagName], color: '#F472B6' },
  { tag: [tags.variableName, tags.name], color: '#F4F4F5' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#71717A', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.brace, tags.bracket], color: '#A1A1AA' },
]);

const riftLightHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.definitionKeyword], color: '#7C3AED' },
  { tag: [tags.string, tags.special(tags.string)], color: '#059669' },
  { tag: [tags.number, tags.bool, tags.null], color: '#D97706' },
  { tag: [tags.propertyName, tags.attributeName], color: '#2563EB' },
  { tag: [tags.typeName, tags.className, tags.tagName], color: '#DB2777' },
  { tag: [tags.variableName, tags.name], color: '#09090B' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#71717A', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.brace, tags.bracket], color: '#52525B' },
]);

function buildRiftTheme(isDark: boolean): Extension {
  return [
    EditorView.theme(
      {
        '&': {
          backgroundColor: 'var(--cm-bg)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          height: '100%',
        },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.55',
          overflow: 'auto',
        },
        '.cm-content': {
          caretColor: 'var(--accent)',
          padding: '8px 0',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--accent)',
          borderLeftWidth: '1.5px',
        },
        '.cm-gutters': {
          backgroundColor: 'var(--cm-gutter-bg)',
          color: 'var(--cm-gutter-text)',
          borderRight: '1px solid var(--border-subtle)',
          fontSize: '11px',
          userSelect: 'none',
        },
        '.cm-activeLine': {
          backgroundColor: 'var(--cm-active-line)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--cm-active-line)',
          color: 'var(--text-secondary)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
          {
            backgroundColor: 'var(--cm-selection)',
          },
        '.cm-tooltip': {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          borderRadius: '6px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: 'var(--accent-muted)',
          color: 'var(--text-primary)',
        },
        '.cm-panels': {
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
        },
        '.cm-textfield': {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          borderRadius: '4px',
        },
        '.cm-button': {
          backgroundImage: 'none',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          borderRadius: '4px',
        },
      },
      { dark: isDark },
    ),
    syntaxHighlighting(isDark ? riftDarkHighlight : riftLightHighlight),
  ];
}

export interface CodeEditorProps {
  value: string;
  onChange?: (next: string) => void;
  language?: CodeEditorLanguage;
  readOnly?: boolean;
  lightweight?: boolean;
  placeholder?: string;
  graphqlSchema?: GraphQLSchema;
  onShowInDocs?: (field?: string, type?: string, parentType?: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  readOnly = false,
  lightweight = false,
  placeholder,
  graphqlSchema,
  onShowInDocs,
  className,
  ariaLabel = 'Code editor',
}: CodeEditorProps) {
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onShowInDocsRef = React.useRef(onShowInDocs);

  onChangeRef.current = onChange;
  onShowInDocsRef.current = onShowInDocs;

  const themeCompRef = React.useRef(new Compartment());
  const langCompRef = React.useRef(new Compartment());
  const readOnlyCompRef = React.useRef(new Compartment());
  const featureCompRef = React.useRef(new Compartment());

  const buildLanguageExtension = React.useCallback(
    (lang: CodeEditorLanguage, schema?: GraphQLSchema, isLightweight?: boolean): Extension => {
      if (isLightweight) return [];
      switch (lang) {
        case 'json':
          return readOnly ? [json()] : [json(), linter(jsonParseLinter())];
        case 'xml':
          return [xml()];
        case 'html':
          return [html()];
        case 'graphql':
          return cm6Graphql(schema, {
            showErrorOnInvalidSchema: false,
            onShowInDocs: (field, type, parentType) => {
              onShowInDocsRef.current?.(field, type, parentType);
            },
          });
        default:
          return [];
      }
    },
    [readOnly],
  );

  const buildFeatureExtensions = React.useCallback(
    (isLightweight: boolean, isReadOnly: boolean, ph?: string): Extension => {
      const exts: Extension[] = [
        lineNumbers(),
        search({ top: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      ];

      if (ph) {
        exts.push(cmPlaceholder(ph));
      }

      if (!isLightweight) {
        exts.push(
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          bracketMatching(),
          foldGutter(),
          keymap.of([...foldKeymap, ...closeBracketsKeymap, ...completionKeymap]),
        );
        if (!isReadOnly) {
          exts.push(indentOnInput(), closeBrackets(), autocompletion());
        }
      }

      return exts;
    },
    [],
  );

  React.useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        themeCompRef.current.of(buildRiftTheme(resolvedTheme === 'dark')),
        langCompRef.current.of(buildLanguageExtension(language, graphqlSchema, lightweight)),
        readOnlyCompRef.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        featureCompRef.current.of(buildFeatureExtensions(lightweight, readOnly, placeholder)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes without clobbering user typing
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Sync theme
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompRef.current.reconfigure(buildRiftTheme(resolvedTheme === 'dark')),
    });
  }, [resolvedTheme]);

  // Sync language or lightweight mode
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        langCompRef.current.reconfigure(
          buildLanguageExtension(language, graphqlSchema, lightweight),
        ),
        featureCompRef.current.reconfigure(
          buildFeatureExtensions(lightweight, readOnly, placeholder),
        ),
      ],
    });
  }, [language, lightweight, readOnly, placeholder, buildLanguageExtension, buildFeatureExtensions]);

  // Update GraphQL schema dynamically when introspection finishes
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view || language !== 'graphql' || lightweight) return;
    try {
      updateSchema(view, graphqlSchema);
    } catch {
      // Fallback reconfigure if schema state field wasn't mounted yet
      view.dispatch({
        effects: langCompRef.current.reconfigure(
          buildLanguageExtension('graphql', graphqlSchema, false),
        ),
      });
    }
  }, [graphqlSchema, language, lightweight, buildLanguageExtension]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompRef.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return (
    <div
      ref={hostRef}
      className={cn(
        'h-full w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--cm-bg)]',
        className,
      )}
    />
  );
}
