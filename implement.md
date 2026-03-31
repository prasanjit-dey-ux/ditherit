# implement.md — Ditherit Round 2 Fixes

> For Sonnet in Antigravity. Read fully before touching any file.
> Stack: Next.js 15, TypeScript, **Tailwind CSS**, **Framer Motion**. No vanilla CSS classes — use Tailwind utilities. Use `motion.*` from `framer-motion` for all animations.

---

## Problem Summary

1. **Slider style** — Label text should sit inside a shaded bg on the left of the slider row (like Image 2), not floating separately
2. **ASCII mode still shows BG Erase** — conditional hide still broken
3. **Video/GIF BG erase playback bug** — background reappears during playback (canvas/stream alpha not handled correctly)
4. **Character buttons have too-large border-radius** — pill-shaped, should match the smaller radius of other UI buttons
5. **New: Scale control** — add a Scale slider for image, video, and GIF

---

## Fix 0 — Theme Switch Flicker on Sliders

### Root cause
Every color in `Slider.tsx` is a **hardcoded white-alpha value** — `bg-white/5`, `bg-white/[0.06]`, `border-white/[0.08]`, and the Framer Motion `animate` objects use inline `rgba(255,255,255,...)` strings. These work on dark backgrounds but are wrong on light. When the theme toggles, the page CSS class changes instantly but Framer Motion re-interpolates those hardcoded rgba values on its own schedule, causing a visible flicker/lag.

### The fix — two parts

#### Part A: Replace hardcoded colors with `dark:` Tailwind variants

In `Slider.tsx`, every color class needs both a light and dark value:

```tsx
{/* Row bg */}
<motion.div
  className="relative flex items-center h-10 rounded-lg overflow-hidden
             bg-black/[0.04] dark:bg-white/5 mb-1"
  ...
>

{/* Label shaded bg */}
<div className="absolute left-0 top-0 bottom-0 w-[110px]
                bg-black/[0.05] dark:bg-white/[0.06]
                border-r border-black/[0.08] dark:border-white/[0.08]
                rounded-l-lg pointer-events-none z-0" />

{/* Label text */}
<span className="... text-black/40 dark:text-white/60 ...">
  {label}
</span>

{/* Value text */}
<span className="... text-black/80 dark:text-white/90 ...">
  {displayValue ?? value}
</span>
```

#### Part B: Replace hardcoded rgba in Framer Motion animate objects with CSS variables

Framer Motion can animate CSS variables natively. Define the theme-aware colors as CSS variables and reference them in `animate` — that way the animated value automatically reflects the current theme.

Add to `globals.css`:

```css
:root {
  --slider-hover-bg: rgba(0, 0, 0, 0.06);
  --slider-pill-bg: rgba(0, 0, 0, 0.10);
}

.dark {
  --slider-hover-bg: rgba(255, 255, 255, 0.07);
  --slider-pill-bg: rgba(255, 255, 255, 0.12);
}
```

Then in `Slider.tsx`, **stop passing inline rgba to `animate`** — instead use a CSS class swap approach for the hover and pill states:

```tsx
{/* Row hover — use CSS variable via style prop, not animate */}
<motion.div
  className="... transition-colors duration-200"
  style={{ backgroundColor: "transparent" }}
  whileHover={{ backgroundColor: "var(--slider-hover-bg)" }}
  transition={{ duration: 0.15 }}
>
```

For the pill animation, swap to a CSS variable too:

```tsx
animate={
  active
    ? {
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 3,
        paddingBottom: 3,
        borderRadius: 999,
        backgroundColor: "var(--slider-pill-bg)",  // ← CSS var, not rgba string
      }
    : {
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        borderRadius: 6,
        backgroundColor: "transparent",
      }
}
```

#### Part C: Add transition to the sidebar root

Wherever the theme class is toggled (likely on `<html>` or the sidebar wrapper), add a CSS transition so the entire sidebar color shift is smooth rather than instant:

```css
/* globals.css */
html {
  transition: background-color 0.25s ease, color 0.25s ease;
}

/* If the sidebar has its own bg */
.sidebar {
  transition: background-color 0.25s ease, border-color 0.25s ease;
}
```

This ensures the page background and text transition in sync with the slider colors, so nothing jumps.

#### Part D: Fix the slider track colors in globals.css

The track and thumb are also hardcoded white — update them with theme-aware values:

```css
/* Light mode defaults */
.slider-input::-webkit-slider-runnable-track {
  background: rgba(0, 0, 0, 0.15);
}
.slider-input::-webkit-slider-thumb {
  background: #111;
}

/* Dark mode overrides */
.dark .slider-input::-webkit-slider-runnable-track {
  background: rgba(255, 255, 255, 0.15);
}
.dark .slider-input::-webkit-slider-thumb {
  background: #fff;
}

/* Same pattern for -moz- variants */
.dark .slider-input::-moz-range-track {
  background: rgba(255, 255, 255, 0.15);
}
.dark .slider-input::-moz-range-thumb {
  background: #fff;
}
```

### Summary of what was causing the flicker
| Source | Problem | Fix |
|---|---|---|
| `bg-white/5` on row | White-alpha wrong in light mode | `bg-black/[0.04] dark:bg-white/5` |
| `rgba(255,255,255,...)` in `animate` | Framer Motion interpolates stale value on theme change | Use `var(--slider-pill-bg)` CSS variable |
| `whileHover` rgba string | Same lag issue | Use `var(--slider-hover-bg)` |
| Slider track/thumb white | Invisible in light mode | `.dark` CSS overrides |
| No transition on html/sidebar | Hard cut on theme toggle | `transition: background-color 0.25s ease` |

---

## Fix 0b — Pill Expansion Animation for Slider Value
When the user **hovers or drags** a slider, the value on the right (e.g. `10px`, `128`, `155%`) expands into a **pill badge** — a rounded bg smoothly grows around the number. When the user stops hovering/dragging, the pill contracts back to plain text. It should feel springy and satisfying, not linear.

### State additions in `Slider.tsx`

```tsx
const [active, setActive] = useState(false);
```

Trigger `active = true` on `onMouseEnter` + `onPointerDown`, and `active = false` on `onMouseLeave` + `onPointerUp` + `onPointerCancel`.

### Value pill — motion.span with layout animation

Replace the plain value `<span>` with a `motion.span` that animates its padding and background:

```tsx
<div className="relative z-10 px-2 shrink-0 flex items-center justify-end min-w-[52px]">
  <motion.span
    layout
    transition={{
      type: "spring",
      stiffness: 400,
      damping: 28,
    }}
    animate={
      active
        ? {
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 3,
            paddingBottom: 3,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.12)",
          }
        : {
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0)",
          }
    }
    className="text-[13px] text-white/90 font-medium tabular-nums"
  >
    {displayValue ?? value}
  </motion.span>
</div>
```

The `layout` prop lets Framer Motion smoothly reflow the pill expansion without jarring jumps. The spring (`stiffness: 400, damping: 28`) gives the satisfying snap-in feel. Tweak stiffness/damping to taste — lower damping = more bounce.

### Wire the events on the slider row

```tsx
<motion.div
  className="relative flex items-center h-10 rounded-lg overflow-hidden bg-white/5 mb-1"
  onHoverStart={() => setActive(true)}
  onHoverEnd={() => setActive(false)}
  whileHover={{ backgroundColor: "rgba(255,255,255,0.07)" }}
  transition={{ duration: 0.15 }}
>
```

Also wire on the range input itself to catch drag without hover:
```tsx
<input
  ...
  onPointerDown={() => setActive(true)}
  onPointerUp={() => setActive(false)}
  onPointerLeave={() => setActive(false)}
/>
```

### Full updated `Slider.tsx`

```tsx
import { motion } from "framer-motion";
import { useState } from "react";

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  displayValue?: string;
}

export function Slider({ label, min, max, step, value, onChange, displayValue }: SliderProps) {
  const [active, setActive] = useState(false);

  return (
    <motion.div
      className="relative flex items-center h-10 rounded-lg overflow-hidden bg-white/5 mb-1"
      onHoverStart={() => setActive(true)}
      onHoverEnd={() => setActive(false)}
      whileHover={{ backgroundColor: "rgba(255,255,255,0.07)" }}
      transition={{ duration: 0.15 }}
    >
      {/* Shaded label background */}
      <div className="absolute left-0 top-0 bottom-0 w-[110px] bg-white/[0.06] border-r border-white/[0.08] rounded-l-lg pointer-events-none z-0" />

      {/* Label */}
      <span className="relative z-10 w-[110px] px-3 text-[13px] text-white/60 whitespace-nowrap shrink-0">
        {label}
      </span>

      {/* Range input */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        onPointerDown={() => setActive(true)}
        onPointerUp={() => setActive(false)}
        onPointerLeave={() => setActive(false)}
        className="relative z-10 flex-1 h-full bg-transparent cursor-pointer px-2 slider-input"
      />

      {/* Value pill */}
      <div className="relative z-10 px-2 shrink-0 flex items-center justify-end min-w-[52px]">
        <motion.span
          layout
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 28,
          }}
          animate={
            active
              ? {
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 3,
                  paddingBottom: 3,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.12)",
                }
              : {
                  paddingLeft: 0,
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0)",
                }
          }
          className="text-[13px] text-white/90 font-medium tabular-nums"
        >
          {displayValue ?? value}
        </motion.span>
      </div>
    </motion.div>
  );
}
```

---

## Fix 1 — Slider Visual Style (Label-in-Track)

### Target look (Image 2)
Each slider row is a single rounded rectangle. The **label** sits on the **left inside a slightly lighter shaded region**. The slider track fills the rest. A subtle vertical divider separates them. Value is right-aligned.

### Update `Slider.tsx`

The **full component is already specified in Fix 0** above — it includes both the label-in-track layout and the pill animation together. Do not split them.

The `slider-input` class only needs the browser-specific thumb/track styles that Tailwind can't express — add **just** these to `globals.css` (minimal, no layout styles):

```css
/* globals.css — only thumb/track, no layout */
.slider-input {
  -webkit-appearance: none;
  appearance: none;
}
.slider-input::-webkit-slider-runnable-track {
  height: 2px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 1px;
}
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  margin-top: -5px;
}
.slider-input::-moz-range-track {
  height: 2px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 1px;
}
.slider-input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  border: none;
}
```

Apply this updated `Slider` component to ALL sliders: Spacing, Min Radius, Max Radius, Threshold, Contrast, Brightness, Gamma, Blur, Highlights, Error Str., and the new Scale slider.

---

## Fix 2 — ASCII Mode: Completely Hide BG Erase

### 2a — Conditional render with AnimatePresence

Wrap the Remove Background row in `AnimatePresence` so it animates out when switching to ASCII:

```tsx
import { AnimatePresence, motion } from "framer-motion";

<AnimatePresence>
  {effect === "dither" && (
    <motion.div
      key="remove-bg"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      {/* Remove Background toggle row */}
    </motion.div>
  )}
</AnimatePresence>
```

### 2b — Reset state on switch

```tsx
function handleEffectChange(newEffect: "dither" | "ascii") {
  setEffect(newEffect);
  if (newEffect === "ascii") {
    setRemoveBackground(false);
  }
}
```

Wire `handleEffectChange` to both Dither and ASCII button `onClick` handlers.

---

## Fix 3 — Video/GIF BG Erase Playback Bug

### Root cause
Canvas background bleeds through because: (a) canvas context isn't created with `alpha: true`, (b) frames use `fillRect` instead of `clearRect`, (c) WebM codec doesn't preserve alpha channel.

### 3a — Canvas context with alpha

```ts
const ctx = canvas.getContext("2d", { alpha: true });
```

Do this everywhere a canvas context is created for rendering output (not just preview).

### 3b — clearRect vs fillRect per frame

In every frame render function (image, video loop, GIF loop):

```ts
if (removeBackground) {
  ctx.clearRect(0, 0, w, h); // fully transparent
} else {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, w, h);  // solid background
}
// draw dots below
```

Find every `ctx.fillRect(0, 0, ...)` that paints the canvas background and wrap it with this conditional. Pass `removeBackground: boolean` as a parameter down to wherever frames are drawn — do not read it from a global.

### 3c — WebM: VP9 codec

```ts
const mimeTypes = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];
const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
const recorder = new MediaRecorder(stream, { mimeType });
```

### 3d — Export warning UI

When `removeBackground` is true and detectedType is `"video"` or `"gif"`, show a small animated notice using Framer Motion:

```tsx
<AnimatePresence>
  {removeBackground && detectedType !== "image" && (
    <motion.p
      key="export-warn"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="text-[11px] text-white/40 mt-1 px-1 leading-snug"
    >
      ⚠ Transparent export — VP9 only. May show bg in QuickTime/Figma.
    </motion.p>
  )}
</AnimatePresence>
```

---

## Fix 4 — Character Button Border Radius

The character algorithm buttons (Floyd-Steinberg, Atkinson, Ordered (Bayer), Hard Threshold) are over-rounded. Find these buttons in `DitherStudio.tsx` and change their Tailwind `rounded-*` class.

Look at what `rounded-*` class the Export JSON / Export PNG buttons use — use that **exact same class** for the character buttons.

Typically this means changing `rounded-full` or `rounded-2xl` → `rounded-md` or `rounded-lg`.

Example — find the character button JSX and update:
```tsx
// Before (too round)
<button className="... rounded-full ...">Floyd-Steinberg</button>

// After (match export button radius)
<button className="... rounded-md ...">Floyd-Steinberg</button>
```

Do **not** change the PRESETS pills (Halftone, Blueprint, etc.) — those stay `rounded-full`.

---

## Fix 5 — New Scale Control

### State

In `DitherStudio.tsx`:
```ts
const [scale, setScale] = useState(1.0);
```

### Debounce hook

Add this hook (or use an existing one if the project has it):

```ts
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

Use `const debouncedScale = useDebounce(scale, 100)` and put `debouncedScale` in the re-dither `useEffect` dependency array.

### Sidebar section

Add a **TRANSFORM** collapsible section between CHARACTERS and GLYPH OVERLAY. Follow whatever pattern the other collapsible sections use (they likely have a toggle state + AnimatePresence). Example:

```tsx
{/* TRANSFORM section */}
<div className="mt-2">
  <button
    onClick={() => setTransformOpen(v => !v)}
    className="flex items-center gap-1 text-[11px] text-white/40 uppercase tracking-widest w-full mb-1 hover:text-white/60 transition-colors"
  >
    <motion.span
      animate={{ rotate: transformOpen ? 90 : 0 }}
      transition={{ duration: 0.15 }}
      className="inline-block"
    >
      ▸
    </motion.span>
    Transform
  </button>

  <AnimatePresence>
    {transformOpen && (
      <motion.div
        key="transform-section"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <Slider
          label="Scale"
          min={0.25}
          max={3.0}
          step={0.05}
          value={scale}
          onChange={setScale}
          displayValue={`${Math.round(scale * 100)}%`}
        />
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

Add `const [transformOpen, setTransformOpen] = useState(true)` to DitherStudio state.

### Applying scale before dithering

**Images:**
```ts
const scaledW = Math.round(sourceImage.naturalWidth * scale);
const scaledH = Math.round(sourceImage.naturalHeight * scale);
offscreenCanvas.width = scaledW;
offscreenCanvas.height = scaledH;
ctx.drawImage(sourceImage, 0, 0, scaledW, scaledH);
// run dither on offscreenCanvas
```

**Video frames:**
```ts
const scaledW = Math.round(video.videoWidth * scale);
const scaledH = Math.round(video.videoHeight * scale);
frameCanvas.width = scaledW;
frameCanvas.height = scaledH;
ctx.drawImage(video, 0, 0, scaledW, scaledH);
```

**GIF frames:**
```ts
const scaledW = Math.round(frameWidth * scale);
const scaledH = Math.round(frameHeight * scale);
// draw frame at scaled dimensions before dithering
```

Since scale is applied upstream, exported files (PNG, WebM) will automatically be at the correct scaled size — no changes needed in export handlers.

---

## Acceptance Criteria

- [ ] Light ↔ dark theme switch: no flicker or lag on slider rows
- [ ] Slider row bg correct in both themes (`bg-black/[0.04]` light / `bg-white/5` dark)
- [ ] Slider label shaded area correct in both themes
- [ ] Slider track and thumb visible in both themes
- [ ] Pill animation uses CSS variable `var(--slider-pill-bg)` — not hardcoded rgba
- [ ] `whileHover` uses `var(--slider-hover-bg)` — not hardcoded rgba
- [ ] `html` has `transition: background-color 0.25s ease` for smooth theme crossfade
- [ ] All sliders use updated `Slider.tsx` component
- [ ] Hovering or dragging any slider → value expands into a rounded pill badge with spring animation
- [ ] Releasing / un-hovering → pill contracts back to plain number (spring, same config)
- [ ] `tabular-nums` on value text so width stays stable while numbers change
- [ ] `motion.div` with `whileHover` row highlight on every slider row
- [ ] ASCII mode: BG Erase row animates out with `AnimatePresence` / `height: 0` exit
- [ ] Switching to ASCII resets `removeBackground` to false
- [ ] PNG export with `removeBackground=true` → transparent PNG
- [ ] WebM/GIF with `removeBackground=true` → transparent frames, VP9 used
- [ ] Animated warning note shown for video/GIF transparent export
- [ ] Character algorithm buttons use same `rounded-*` as Export buttons (not pill)
- [ ] TRANSFORM section between CHARACTERS and GLYPH OVERLAY, collapsible with AnimatePresence
- [ ] Scale slider: 25%–300%, default 100%, debounced 100ms
- [ ] Scale re-dithers source at new dimensions on change
- [ ] Scale works for image, video, and GIF