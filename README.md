# ditherit ✦

> Convert images, videos, and GIFs into beautiful dithered dot art or ASCII — then export as interactive React/JS code.

---

## What is it?

**ditherit** is a browser-based creative tool for turning media into classic dithered dot patterns or ASCII art. It gives you fine-grained control over the output and lets you copy the result directly as embeddable interactive code — not just an image.

---

## Features

- **Dither modes** — Floyd-Steinberg, Atkinson, Ordered (Bayer 8×8), Hard Threshold
- **ASCII art** — Configurable character sets, font size, spacing, glow effects, source colors
- **Video & GIF support** — Frame-by-frame processing with playback controls
- **Interactive preview** — Physics-based dot repulsion on mouse hover
- **Export options** — PNG, SVG, JSON dot data, copy vanilla JS or React code
- **Live controls** — All sliders and buttons update the canvas in real time, including in video mode
- **Dark / Light theme**

---

## Usage

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How to use

1. **Pick a mode** — Image · Video · ASCII (top of sidebar)
2. **Drop or browse** for a file — PNG, JPG, WebP, GIF, MP4, WebM, MOV
3. **Tune the controls** — algorithm, spacing, colors, tone, glyph overlay
4. **Export** — PNG · SVG · JSON · Copy JS · Copy React Code

---

## Exporting Code

### Vanilla JS (dot interaction)
Copies a self-contained `DitherInteraction` class that animates dots with spring-physics mouse repulsion on any `<canvas>`.

### React component
Copies a `<Dither />` usage snippet for the [ditherit-react](./packages/ditherit-react) package.

```tsx
import { Dither } from 'ditherit-react';

<Dither
  type="image"
  src="/your-image.png"
  algorithm="floyd-steinberg"
  spacing={2}
  interactive
/>
```

### ASCII player JS
Copies a `AsciiVideoPlayer` class that plays back the ASCII video in any `<canvas>` without dependencies.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Vanilla CSS + CSS variables |
| Processing | Web Workers (dithering), Canvas 2D API |
| GIF decoding | [gifuct-js](https://github.com/matt-way/gifuct-js) |
| Video frames | `<video>` + `requestVideoFrameCallback` |

---

## Project Structure

```
ditherit/
├── app/               # Next.js app (page, layout, globals.css)
├── components/
│   ├── DitherStudio.tsx   # Main studio UI
│   ├── Slider.tsx
│   └── Toggle.tsx
├── lib/
│   ├── dither.ts          # Dithering algorithms + dot drawing
│   ├── dither.worker.ts   # Web worker for image dithering
│   ├── ascii.ts           # ASCII art generation + rendering
│   ├── videoFrames.ts     # Video frame extraction
│   └── gifDecoder.ts      # GIF frame decoding
└── packages/
    └── ditherit-react/    # React component package
```

---

## License

MIT

Builded by https://x.com/prasanjit_ui
