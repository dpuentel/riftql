import { describe, expect, it } from 'vitest';
import { buildLatestJson, resolvePublishedDownloadUrl } from '../generate-latest-json.mjs';

describe('generate-latest-json', () => {
  it('resolves canonical published tag URLs instead of draft untagged URLs', () => {
    expect(
      resolvePublishedDownloadUrl({
        repo: 'dpuentel/riftql',
        tag: 'v0.5.2',
        assetName: 'RiftQL_0.5.2_x64-setup.exe',
        browserDownloadUrl:
          'https://github.com/dpuentel/riftql/releases/download/untagged-ba1b24a28fa551513bda/RiftQL_0.5.2_x64-setup.exe',
      }),
    ).toBe('https://github.com/dpuentel/riftql/releases/download/v0.5.2/RiftQL_0.5.2_x64-setup.exe');

    expect(
      resolvePublishedDownloadUrl({
        tag: 'v0.5.2',
        browserDownloadUrl:
          'https://github.com/dpuentel/riftql/releases/download/untagged-ba1b24a28fa551513bda/RiftQL_0.5.2_x64-setup.exe',
      }),
    ).toBe('https://github.com/dpuentel/riftql/releases/download/v0.5.2/RiftQL_0.5.2_x64-setup.exe');

    expect(
      resolvePublishedDownloadUrl({
        tag: 'v0.5.2',
        browserDownloadUrl: 'https://example.com/custom/RiftQL_0.5.2_x64-setup.exe',
      }),
    ).toBe('https://example.com/custom/RiftQL_0.5.2_x64-setup.exe');
  });

  it('rewrites draft untagged URLs inside buildLatestJson for all platforms', () => {
    const manifest = buildLatestJson({
      version: '0.5.2',
      pubDate: '2026-11-26T20:00:00Z',
      assets: [
        {
          name: 'RiftQL_0.5.2_x64-setup.exe',
          downloadUrl:
            'https://github.com/dpuentel/riftql/releases/download/untagged-ba1b24a28fa551513bda/RiftQL_0.5.2_x64-setup.exe',
          signature: 'win-sig',
        },
        {
          name: 'RiftQL_0.5.2_amd64.AppImage',
          downloadUrl:
            'https://github.com/dpuentel/riftql/releases/download/untagged-ba1b24a28fa551513bda/RiftQL_0.5.2_amd64.AppImage',
          signature: 'linux-sig',
        },
        {
          name: 'RiftQL_aarch64.app.tar.gz',
          downloadUrl:
            'https://github.com/dpuentel/riftql/releases/download/untagged-ba1b24a28fa551513bda/RiftQL_aarch64.app.tar.gz',
          signature: 'mac-arm-sig',
        },
        {
          name: 'RiftQL_x64.app.tar.gz',
          downloadUrl:
            'https://github.com/dpuentel/riftql/releases/download/untagged-ba1b24a28fa551513bda/RiftQL_x64.app.tar.gz',
          signature: 'mac-x64-sig',
        },
      ],
    });

    expect(manifest?.platforms).toEqual({
      'windows-x86_64': {
        url: 'https://github.com/dpuentel/riftql/releases/download/v0.5.2/RiftQL_0.5.2_x64-setup.exe',
        signature: 'win-sig',
      },
      'linux-x86_64': {
        url: 'https://github.com/dpuentel/riftql/releases/download/v0.5.2/RiftQL_0.5.2_amd64.AppImage',
        signature: 'linux-sig',
      },
      'darwin-aarch64': {
        url: 'https://github.com/dpuentel/riftql/releases/download/v0.5.2/RiftQL_aarch64.app.tar.gz',
        signature: 'mac-arm-sig',
      },
      'darwin-x86_64': {
        url: 'https://github.com/dpuentel/riftql/releases/download/v0.5.2/RiftQL_x64.app.tar.gz',
        signature: 'mac-x64-sig',
      },
    });
  });

  it('consolidates all four platform targets with AppImage priority on Linux and NSIS priority on Windows', () => {
    const manifest = buildLatestJson({
      version: 'v0.5.0',
      notes: 'Release notes here',
      pubDate: '2026-11-26T18:00:00Z',
      assets: [
        {
          name: 'RiftQL_0.5.0_x64-setup.exe',
          downloadUrl: 'https://example.com/RiftQL_0.5.0_x64-setup.exe',
          signature: 'win-exe-sig',
        },
        {
          name: 'RiftQL_0.5.0_x64_en-US.msi',
          downloadUrl: 'https://example.com/RiftQL_0.5.0_x64_en-US.msi',
          signature: 'win-msi-sig',
        },
        {
          name: 'RiftQL_0.5.0_amd64.deb',
          downloadUrl: 'https://example.com/RiftQL_0.5.0_amd64.deb',
          signature: 'linux-deb-sig',
        },
        {
          name: 'RiftQL_0.5.0_amd64.AppImage',
          downloadUrl: 'https://example.com/RiftQL_0.5.0_amd64.AppImage',
          signature: 'linux-appimage-sig',
        },
        {
          name: 'RiftQL_aarch64.app.tar.gz',
          downloadUrl: 'https://example.com/RiftQL_aarch64.app.tar.gz',
          signature: 'mac-arm-sig',
        },
        {
          name: 'RiftQL_x64.app.tar.gz',
          downloadUrl: 'https://example.com/RiftQL_x64.app.tar.gz',
          signature: 'mac-x64-sig',
        },
      ],
    });

    expect(manifest).toEqual({
      version: '0.5.0',
      notes: 'Release notes here',
      pub_date: '2026-11-26T18:00:00Z',
      platforms: {
        'windows-x86_64': {
          url: 'https://example.com/RiftQL_0.5.0_x64-setup.exe',
          signature: 'win-exe-sig',
        },
        'linux-x86_64': {
          url: 'https://example.com/RiftQL_0.5.0_amd64.AppImage',
          signature: 'linux-appimage-sig',
        },
        'darwin-aarch64': {
          url: 'https://example.com/RiftQL_aarch64.app.tar.gz',
          signature: 'mac-arm-sig',
        },
        'darwin-x86_64': {
          url: 'https://example.com/RiftQL_x64.app.tar.gz',
          signature: 'mac-x64-sig',
        },
      },
    });
  });

  it('returns null when no signed updater assets exist', () => {
    const manifest = buildLatestJson({
      version: '0.5.0',
      assets: [
        {
          name: 'RiftQL_0.5.0_amd64.deb',
          downloadUrl: 'https://example.com/deb',
          signature: '',
        },
      ],
    });

    expect(manifest).toBeNull();
  });
});
