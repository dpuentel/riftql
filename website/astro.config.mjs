import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://riftql.dev',
  vite: {
    ssr: {
      noExternal: ['nanoid'],
    },
  },
  integrations: [
    starlight({
      title: 'RiftQL',
      description: 'The local-first API client for REST & GraphQL.',
      logo: {
        src: './src/assets/riftql-logo.svg',
      },
      favicon: '/favicon.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/dpuentel/riftql',
        },
      ],
      customCss: [
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/starlight-custom.css',
      ],
      sidebar: [
        {
          label: 'Documentation',
          autogenerate: { directory: 'docs' },
        },
      ],
    }),
  ],
});
