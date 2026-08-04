import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// app-icon.png is the dedicated home-screen/install icon (edge-to-edge dark
// green square, distinct from the in-app logo.png). The maskable variant
// still needs safe-zone padding so OS circular crops don't clip the "LC"
// monogram, using the same brand green as the background fill.
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
  images: ['public/app-icon.png'],
});
