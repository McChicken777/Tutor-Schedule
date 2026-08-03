import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// logo.png has transparent corners around the badge (not edge-to-edge), so
// the maskable variant needs extra padding + a solid brand background
// instead of transparency to survive the OS's circular safe-zone crop.
export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: {
      sizes: [512],
      padding: 0.34,
      resizeOptions: { fit: 'contain', background: '#173F30' },
    },
  },
  images: ['public/logo.png'],
});
