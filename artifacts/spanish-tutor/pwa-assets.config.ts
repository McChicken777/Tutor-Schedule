import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Glyph strokes in logo.svg span ~85% of the canvas — too tight for a safe
// circular mask, so the maskable variant gets extra padding + a solid brand
// background instead of transparency.
export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { fit: 'contain', background: '#D05D43' },
    },
  },
  images: ['public/logo.svg'],
});
