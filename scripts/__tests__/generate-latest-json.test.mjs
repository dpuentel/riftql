import { describe, expect, it } from 'vitest';
import { buildLatestJson } from '../generate-latest-json.mjs';

describe('generate-latest-json', () => {
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
