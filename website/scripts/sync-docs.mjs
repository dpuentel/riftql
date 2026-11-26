import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const websiteDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(websiteDir, '..');
const sourceDocsDir = path.join(repoRoot, 'docs');
const targetDocsDir = path.join(websiteDir, 'src', 'content', 'docs', 'docs');
const targetMetaPath = path.join(websiteDir, 'src', 'data', 'meta.json');

const REPO_URL = 'https://github.com/dpuentel/riftql';

const SIDEBAR_META = {
  'README.md': { order: 1, label: 'Overview', slug: 'index.md' },
  'requests-and-responses.md': { order: 2, label: 'Requests & Responses' },
  'graphql.md': { order: 3, label: 'GraphQL & Auto-Discovery' },
  'collections-and-variables.md': { order: 4, label: 'Collections & Variables' },
  'importers-and-snippets.md': { order: 5, label: 'Importers & Snippets' },
  'git-sync-and-storage.md': { order: 6, label: 'Git Sync & Storage' },
  'shortcuts-and-ux.md': { order: 7, label: 'Shortcuts & UX' },
  'development-and-releases.md': { order: 8, label: 'Development & Releases' },
};

const GITHUB_ALERT_MAP = {
  NOTE: 'note',
  TIP: 'tip',
  IMPORTANT: 'note',
  WARNING: 'caution',
  CAUTION: 'danger',
};

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function rewriteMarkdownLinks(line) {
  return line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, target) => {
    const trimmed = target.trim();
    if (/^(https?:\/\/|mailto:|#)/i.test(trimmed)) {
      return full;
    }

    const hashIdx = trimmed.indexOf('#');
    const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
    const hashPart = hashIdx >= 0 ? trimmed.slice(hashIdx) : '';

    if (pathPart === './README.md' || pathPart === 'README.md') {
      return `[${label}](/docs/${hashPart})`;
    }

    const siblingDoc = pathPart.match(/^\.?\/?([A-Za-z0-9_-]+)\.md$/);
    if (siblingDoc) {
      return `[${label}](/docs/${siblingDoc[1]}/${hashPart})`;
    }

    if (pathPart.startsWith('../')) {
      const repoRelative = pathPart.replace(/^(\.\.\/)+/, '').replace(/\/$/, '');
      if (!repoRelative) {
        return `[${label}](${REPO_URL})`;
      }
      const kind = repoRelative.includes('.') ? 'blob' : 'tree';
      return `[${label}](${REPO_URL}/${kind}/main/${repoRelative}${hashPart})`;
    }

    return full;
  });
}

function transformMarkdownForStarlight(rawContent, fileName) {
  const lines = rawContent.replace(/\r\n/g, '\n').split('\n');
  let title = path.basename(fileName, '.md');
  let h1Consumed = false;

  const processedLines = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      processedLines.push(line);
      continue;
    }

    if (!inFence && !h1Consumed) {
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) {
        title = h1Match[1].trim();
        h1Consumed = true;
        continue;
      }
    }

    if (!inFence) {
      // Convert GitHub GFM alerts (`> [!TIP]`) into Starlight asides (`:::tip`)
      const alertStart = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alertStart) {
        const asideKind = GITHUB_ALERT_MAP[alertStart[1].toUpperCase()] ?? 'note';
        const bodyLines = [];
        if (alertStart[2].trim()) {
          bodyLines.push(rewriteMarkdownLinks(alertStart[2].trim()));
        }
        while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) {
          i += 1;
          const inner = lines[i].replace(/^>\s?/, '');
          bodyLines.push(rewriteMarkdownLinks(inner));
        }
        processedLines.push(`:::${asideKind}`);
        processedLines.push(...bodyLines);
        processedLines.push(':::');
        continue;
      }

      processedLines.push(rewriteMarkdownLinks(line));
    } else {
      processedLines.push(line);
    }
  }

  let description = '';
  for (const line of processedLines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed === '---' ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('```') ||
      trimmed.startsWith(':::') ||
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      /^\d+\.\s/.test(trimmed)
    ) {
      continue;
    }
    description = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .slice(0, 160);
    break;
  }

  const meta = SIDEBAR_META[fileName];
  const order = meta?.order ?? 50;
  const sidebarLabel = meta?.label ?? title;

  const frontmatterLines = [
    '---',
    `title: ${yamlQuote(title)}`,
    description ? `description: ${yamlQuote(description)}` : null,
    'sidebar:',
    `  order: ${order}`,
    `  label: ${yamlQuote(sidebarLabel)}`,
    '---',
    '',
  ].filter((v) => v !== null);

  const trimmedBody = processedLines.join('\n').replace(/^\n+/, '');
  return `${frontmatterLines.join('\n')}${trimmedBody}\n`;
}

function main() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = rootPkg.version || '0.4.0';

  fs.mkdirSync(path.dirname(targetMetaPath), { recursive: true });
  fs.writeFileSync(
    targetMetaPath,
    `${JSON.stringify(
      {
        version,
        repoUrl: REPO_URL,
        releasesUrl: `${REPO_URL}/releases/latest`,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  fs.rmSync(targetDocsDir, { recursive: true, force: true });
  fs.mkdirSync(targetDocsDir, { recursive: true });

  const entries = fs
    .readdirSync(sourceDocsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'));

  for (const entry of entries) {
    const raw = fs.readFileSync(path.join(sourceDocsDir, entry.name), 'utf8');
    const outName = SIDEBAR_META[entry.name]?.slug ?? entry.name;
    const transformed = transformMarkdownForStarlight(raw, entry.name);
    fs.writeFileSync(path.join(targetDocsDir, outName), transformed, 'utf8');
  }

  console.log(`Synced ${entries.length} docs pages (v${version}) into ${targetDocsDir}`);
}

main();
