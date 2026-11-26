#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the permanent published GitHub Release download URL for an updater asset.
 * Draft GitHub Releases report temporary `/releases/download/untagged-<hex>/...`
 * URLs in `asset.browser_download_url` before `draft=false`, which immediately 404
 * once the release is published under its real tag.
 */
export function resolvePublishedDownloadUrl({ repo, tag, assetName, browserDownloadUrl }) {
  const normalizedRepo = String(repo ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const rawTag = String(tag ?? '').trim();
  const validTag = rawTag && !/^untagged-/i.test(rawTag) ? rawTag : '';
  const normalizedAssetName = String(assetName ?? '').trim();
  const rawUrl = String(browserDownloadUrl ?? '').trim();

  if (normalizedRepo && validTag && normalizedAssetName) {
    return `https://github.com/${normalizedRepo}/releases/download/${encodeURIComponent(validTag)}/${encodeURIComponent(normalizedAssetName)}`;
  }

  if (rawUrl && validTag) {
    return rawUrl.replace(
      /\/releases\/download\/untagged-[^/]+\//i,
      `/releases/download/${encodeURIComponent(validTag)}/`,
    );
  }

  return rawUrl;
}

/**
 * Selects the best updater binary + signature pair for each Tauri target key
 * and builds the consolidated `latest.json` payload expected by `tauri-plugin-updater`.
 *
 * Linux prefers `.AppImage` exclusively (ignoring `.deb`/`.rpm`, since static `latest.json`
 * maps a single URL per `linux-x86_64` slot and only AppImage auto-updates in user-space).
 */
export function buildLatestJson({ version, tag, notes, pubDate, assets }) {
  const rawVersion = String(version ?? '').trim();
  const normalizedVersion = rawVersion.replace(/^v/i, '');
  if (!normalizedVersion) {
    throw new Error('Release version is required to build latest.json');
  }

  const trimmedTag = String(tag ?? '').trim();
  const resolvedTag =
    trimmedTag && !/^untagged-/i.test(trimmedTag)
      ? trimmedTag
      : /^v/i.test(rawVersion)
        ? rawVersion
        : `v${normalizedVersion}`;

  const signedAssets = (assets ?? []).filter(
    (asset) =>
      asset &&
      typeof asset.name === 'string' &&
      typeof asset.downloadUrl === 'string' &&
      typeof asset.signature === 'string' &&
      asset.signature.trim().length > 0,
  );

  const pickFirst = (predicate) => signedAssets.find((asset) => predicate(asset.name));
  const resolveAssetUrl = (asset) =>
    resolvePublishedDownloadUrl({
      tag: resolvedTag,
      browserDownloadUrl: asset.downloadUrl,
    });

  const platforms = {};

  // Windows x86_64: prefer NSIS (`*-setup.exe`), fall back to `.msi` (avoid `.nsis.zip` / plain helpers if setup.exe exists)
  const windowsExe =
    pickFirst((name) => /-setup\.exe$/i.test(name)) ??
    pickFirst((name) => /\.nsis\.zip$/i.test(name)) ??
    pickFirst((name) => /\.msi$/i.test(name)) ??
    pickFirst((name) => /\.msi\.zip$/i.test(name));
  if (windowsExe) {
    platforms['windows-x86_64'] = {
      signature: windowsExe.signature.trim(),
      url: resolveAssetUrl(windowsExe),
    };
  }

  // Linux x86_64: AppImage only (avoid .deb / .rpm overwriting AppImage)
  const linuxAppImage =
    pickFirst((name) => /\.AppImage\.tar\.gz$/i.test(name)) ??
    pickFirst((name) => /\.AppImage$/i.test(name));
  if (linuxAppImage) {
    platforms['linux-x86_64'] = {
      signature: linuxAppImage.signature.trim(),
      url: resolveAssetUrl(linuxAppImage),
    };
  }

  // macOS Apple Silicon (`aarch64`)
  const macArm = pickFirst((name) => /(aarch64|arm64).*\.app\.tar\.gz$/i.test(name));
  if (macArm) {
    platforms['darwin-aarch64'] = {
      signature: macArm.signature.trim(),
      url: resolveAssetUrl(macArm),
    };
  }

  // macOS Intel (`x86_64`)
  const macX64 = pickFirst((name) => /(x64|x86_64).*\.app\.tar\.gz$/i.test(name));
  if (macX64) {
    platforms['darwin-x86_64'] = {
      signature: macX64.signature.trim(),
      url: resolveAssetUrl(macX64),
    };
  }

  if (Object.keys(platforms).length === 0) {
    return null;
  }

  return {
    version: normalizedVersion,
    notes: notes ? String(notes).trim() : '',
    pub_date: pubDate || new Date().toISOString(),
    platforms,
  };
}

function parseCliArgs(argv) {
  let outPath = 'latest.json';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i += 1;
    }
  }
  return { outPath };
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'RiftQL-Release-Bot',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${url} failed with HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAssetText(assetApiUrl, token) {
  const res = await fetch(assetApiUrl, {
    headers: {
      Accept: 'application/octet-stream',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'RiftQL-Release-Bot',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed downloading asset ${assetApiUrl}: HTTP ${res.status}`);
  }
  return res.text();
}

async function runCli() {
  const { outPath } = parseCliArgs(process.argv.slice(2));
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const releaseId = process.env.RELEASE_ID;
  const tagName = process.env.TAG_NAME;

  if (!token || !repo || !releaseId) {
    throw new Error('GITHUB_REPOSITORY, RELEASE_ID, and GH_TOKEN are required');
  }

  const release = await fetchJson(
    `https://api.github.com/repos/${repo}/releases/${releaseId}`,
    token,
  );
  const rawAssets = Array.isArray(release.assets) ? release.assets : [];
  const sigAssetsByBase = new Map();

  for (const asset of rawAssets) {
    if (typeof asset.name === 'string' && asset.name.endsWith('.sig')) {
      const baseName = asset.name.slice(0, -'.sig'.length);
      sigAssetsByBase.set(baseName, asset);
    }
  }

  const rawTag = String(tagName || release.tag_name || '').trim();
  const resolvedTag = rawTag && !/^untagged-/i.test(rawTag) ? rawTag : '';

  const signedAssets = [];
  for (const asset of rawAssets) {
    if (typeof asset.name !== 'string' || asset.name.endsWith('.sig')) continue;
    const sigAsset = sigAssetsByBase.get(asset.name);
    if (!sigAsset) continue;
    const signature = await fetchAssetText(sigAsset.url, token);
    signedAssets.push({
      name: asset.name,
      downloadUrl: resolvePublishedDownloadUrl({
        repo,
        tag: resolvedTag,
        assetName: asset.name,
        browserDownloadUrl: asset.browser_download_url,
      }),
      signature,
    });
  }

  const manifest = buildLatestJson({
    version: resolvedTag || tagName || release.tag_name,
    tag: resolvedTag,
    notes: release.body || '',
    pubDate: release.published_at || new Date().toISOString(),
    assets: signedAssets,
  });

  if (!manifest) {
    console.log('No signed updater assets found for this release; skipping latest.json.');
    return;
  }

  const resolvedOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `Generated ${resolvedOut} for v${manifest.version} with targets: ${Object.keys(manifest.platforms).join(', ')}`,
  );
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  const scriptPath = path.resolve(fileURLToPath(import.meta.url));
  const entryPath = path.resolve(process.argv[1]);
  if (process.platform === 'win32') {
    return scriptPath.toLowerCase() === entryPath.toLowerCase();
  }
  return scriptPath === entryPath;
}

if (isExecutedDirectly()) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
