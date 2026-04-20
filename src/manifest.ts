import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Mobile Simulator',
  description: 'Preview any website in an accurately sized mobile or tablet viewport.',
  version: '0.1.0',
  action: {
    default_title: 'Mobile Simulator',
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['activeTab', 'scripting', 'storage', 'declarativeNetRequestWithHostAccess'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/overlay.ts'],
      css: ['src/content/overlay.css'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
});
