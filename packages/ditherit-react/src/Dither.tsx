import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ditherImageData, imageDataToAscii, drawDots, drawAscii, DitherAlgorithm, BlendMode } from './engine';

export interface DitherProps {
    // Type
    type?: 'image' | 'video' | 'ascii';
    src: string;
    // Canvas size
    resolution?: number;
    width?: number;
    height?: number;
    // Dot grid
    algorithm?: DitherAlgorithm;
    spacing?: number;
    minRadius?: number;
    maxRadius?: number;
    // ASCII specific
    charset?: 'detailed' | 'blocks' | 'pixel' | 'minimal' | string;
    fontSize?: number;
    charSpacing?: number;
    lineSpacing?: number;
    fontFamily?: string;
    // Intensity
    threshold?: number;
    contrast?: number;
    brightness?: number;
    gamma?: number;
    blur?: number;
    highlights?: number;
    errorStrength?: number;
    serpentine?: boolean;
    invert?: boolean;
    // Colors
    backgroundColor?: string;
    dotColor?: string;
    sourceColors?: boolean;
    fgColor?: string;
    colored?: boolean;
    // Glow (ASCII)
    glow?: boolean;
    glowColor?: string;
    glowRadius?: number;
    // Color overlay (dither)
    overlayColor?: string;
    overlayOpacity?: number;
    blendMode?: BlendMode;
    // Glyph overlay
    glyphOverlay?: boolean;
    glyphRadius?: number;
    glyphSpacing?: number;
    glyphEdgeOnly?: boolean;
    glyphEdgeThreshold?: number;
    // Video
    play?: boolean;
    loop?: boolean;
    muted?: boolean;
    fps?: number;
    // Repulsion (interactive)
    interactive?: boolean;
    repelRadius?: number;
    repelStrength?: number;
    // Style
    className?: string;
    style?: React.CSSProperties;
}

type LiveDot = { x: number; y: number; r: number; ox: number; oy: number; vx: number; vy: number; cr?: number; cg?: number; cb?: number };

const MAX_FRAMES = 120;

export const Dither: React.FC<DitherProps> = ({
    type = 'image', src,
    resolution = 600, width, height,
    algorithm = 'floyd-steinberg', spacing = 6, minRadius = 1, maxRadius = 2.5,
    charset = 'detailed', fontSize = 8, charSpacing = 0.6, lineSpacing = 1.0, fontFamily = 'monospace',
    threshold = 128, contrast = 20, brightness = 0, gamma = 1.2, blur = 0.5, highlights = 0.1,
    errorStrength = 0.85, serpentine = true, invert = false,
    backgroundColor = '#0a0a0a', dotColor = '#ffffff',
    sourceColors = false, fgColor = '#ffffff', colored = false,
    glow = false, glowColor = '#7c5af0', glowRadius = 6,
    overlayColor = '#000', overlayOpacity = 0, blendMode = 'normal',
    glyphOverlay = false, glyphRadius = 1.5, glyphSpacing = 8, glyphEdgeOnly = true, glyphEdgeThreshold = 40,
    play = true, loop = true, muted = true, fps = 24,
    interactive = false, repelRadius = 80, repelStrength = 60,
    className, style,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -9999, y: -9999 });
    const dotsRef = useRef<LiveDot[]>([]);
    const rafRef = useRef<number>(0);
    const dFramesRef = useRef<ReturnType<typeof ditherImageData>[]>([]);
    const ascFramesRef = useRef<ReturnType<typeof imageDataToAscii>[]>([]);
    const frameIdxRef = useRef(0);
    const playingRef = useRef(play);
    const [ready, setReady] = useState(false);

    const cw = width ?? resolution;
    const ch = height ?? resolution;

    const ditherOpts = {
        algorithm, serpentine, errorStrength, invert, spacing, minRadius, maxRadius,
        threshold, contrast, brightness, gamma, blur, highlights, sourceColors,
        glyphOverlay, glyphRadius, glyphSpacing, glyphEdgeOnly, glyphEdgeThreshold,
    };
    const drawOpts = { bgColor: backgroundColor, dotColor, useSourceColor: sourceColors, overlayColor, overlayOpacity, blendMode };
    const asciiOpts = { bgColor: backgroundColor, fgColor, colored, fontSize, fontFamily, glow, glowColor, glowRadius };

    const getImageData = useCallback((src: CanvasImageSource): ImageData | null => {
        const off = document.createElement('canvas');
        off.width = cw; off.height = ch;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(src, 0, 0, cw, ch);
        return ctx.getImageData(0, 0, cw, ch);
    }, [cw, ch]);

    // ── Image mode ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (type !== 'image') return;
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = canvasRef.current; if (!canvas) return;
            canvas.width = cw; canvas.height = ch;
            const imageData = getImageData(img); if (!imageData) return;
            const dots = ditherImageData(imageData, ditherOpts, cw, ch);
            dotsRef.current = dots.map(d => ({ ...d, ox: d.x, oy: d.y, vx: 0, vy: 0 }));
            const ctx = canvas.getContext('2d')!;
            drawDots(ctx, dots, drawOpts, cw, ch);
            setReady(true);
        };
        img.src = src;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, type, cw, ch]);

    // ── Video / ASCII-video mode ───────────────────────────────────────────────
    useEffect(() => {
        if (type !== 'video' && type !== 'ascii') return;
        const video = document.createElement('video');
        video.muted = muted; video.loop = loop; video.playsInline = true;
        video.onloadedmetadata = () => {
            const duration = video.duration;
            const totalFrames = Math.min(Math.floor(duration * fps), MAX_FRAMES);
            const interval = duration / totalFrames;
            const rawFrames: ImageData[] = [];
            let idx = 0;

            const capture = () => {
                const fd = getImageData(video);
                if (fd) rawFrames.push(fd);
                idx++;
                if (idx >= totalFrames) {
                    if (type === 'video') {
                        dFramesRef.current = rawFrames.map(f => ditherImageData(f, ditherOpts, cw, ch));
                    } else {
                        ascFramesRef.current = rawFrames.map(f =>
                            imageDataToAscii(f, { charset, fontSize, charSpacing, lineSpacing, colored, contrast, brightness, gamma, invertBrightness: invert }, cw, ch)
                        );
                    }
                    setReady(true);
                    return;
                }
                video.currentTime = idx * interval;
            };

            video.onseeked = capture;
            video.currentTime = 0;
        };
        video.src = src;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, type, cw, ch]);

    // ── Playback loop (video/ascii) ────────────────────────────────────────────
    useEffect(() => {
        if (!ready || type === 'image') return;
        const canvas = canvasRef.current; if (!canvas) return;
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        const ms = 1000 / fps;
        let last = 0;

        cancelAnimationFrame(rafRef.current);
        const loop = (time: number) => {
            if (playingRef.current && time - last >= ms) {
                last = time;
                if (type === 'video') {
                    if (!dFramesRef.current.length) { rafRef.current = requestAnimationFrame(loop); return; }
                    frameIdxRef.current = (frameIdxRef.current + 1) % dFramesRef.current.length;
                    drawDots(ctx, dFramesRef.current[frameIdxRef.current], drawOpts, cw, ch);
                } else {
                    if (!ascFramesRef.current.length) { rafRef.current = requestAnimationFrame(loop); return; }
                    frameIdxRef.current = (frameIdxRef.current + 1) % ascFramesRef.current.length;
                    drawAscii(ctx, ascFramesRef.current[frameIdxRef.current], asciiOpts, cw, ch);
                }
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, type, cw, ch, fps]);

    // ── Interactive repulsion ─────────────────────────────────────────────────
    useEffect(() => {
        if (!interactive || !ready || type !== 'image') return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const SPRING = 0.12, DAMPING = 0.78;
        let prev = 0;

        cancelAnimationFrame(rafRef.current);
        const loop = (time: number) => {
            const dt = Math.min((time - prev) / 16.67, 2); prev = time;
            const m = mouseRef.current;
            for (const d of dotsRef.current) {
                const sx = (d.ox - d.x) * SPRING * dt;
                const sy = (d.oy - d.y) * SPRING * dt;
                const dx = d.x - m.x, dy = d.y - m.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                let fx = sx, fy = sy;
                if (dist < repelRadius && dist > 0.5) {
                    const t = 1 - dist / repelRadius, force = t * t * t * repelStrength;
                    fx += (dx / dist) * force * dt; fy += (dy / dist) * force * dt;
                }
                d.vx = (d.vx + fx) * Math.pow(DAMPING, dt);
                d.vy = (d.vy + fy) * Math.pow(DAMPING, dt);
                d.x += d.vx; d.y += d.vy;
            }
            drawDots(ctx, dotsRef.current, drawOpts, cw, ch);
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interactive, ready, repelRadius, repelStrength, cw, ch]);

    useEffect(() => { playingRef.current = play; }, [play]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!interactive) return;
        const rect = e.currentTarget.getBoundingClientRect();
        mouseRef.current = {
            x: (e.clientX - rect.left) * ((canvasRef.current?.width ?? 1) / rect.width),
            y: (e.clientY - rect.top) * ((canvasRef.current?.height ?? 1) / rect.height),
        };
    }, [interactive]);

    const handleMouseLeave = useCallback(() => {
        mouseRef.current = { x: -9999, y: -9999 };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{ display: 'block', ...style }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        />
    );
};

export default Dither;
