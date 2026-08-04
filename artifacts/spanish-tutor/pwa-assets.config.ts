import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// app-icon.png is the dedicated home-screen/install icon (edge-to-edge forest
// green square, distinct from the in-app logo.png). It is deliberately
// full-bleed — no rounded corners or white border baked in — so the launcher's
// own adaptive mask crops onto green rather than leaving a white square behind
// the icon. The maskable variant only needs light padding to keep the "LC"
// monogram inside the safe circle, filled with the same brand green.
export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: {
      sizes: [512],
      padding: 0.1,
      resizeOptions: { fit: 'contain', background: '#234A36' },
    },
  },
  images: ['public/app-icon.png'],
});
