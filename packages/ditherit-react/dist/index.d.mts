import React from 'react';

type DitherAlgorithm = "floyd-steinberg" | "atkinson" | "ordered" | "threshold";
type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" | "color-dodge" | "color-burn" | "hue" | "saturation" | "luminosity" | "difference";
interface DotCoord {
    x: number;
    y: number;
    r: number;
    cr?: number;
    cg?: number;
    cb?: number;
}
interface AsciiCell {
    char: string;
    x: number;
    y: number;
    w: number;
    h: number;
    brightness: number;
    r: number;
    g: number;
    b: number;
    a: number;
}
declare function ditherImageData(imageData: ImageData, opts: {
    algorithm?: DitherAlgorithm;
    serpentine?: boolean;
    errorStrength?: number;
    invert?: boolean;
    spacing?: number;
    minRadius?: number;
    maxRadius?: number;
    threshold?: number;
    contrast?: number;
    brightness?: number;
    gamma?: number;
    blur?: number;
    highlights?: number;
    sourceColors?: boolean;
    glyphOverlay?: boolean;
    glyphRadius?: number;
    glyphSpacing?: number;
    glyphEdgeOnly?: boolean;
    glyphEdgeThreshold?: number;
}, outW: number, outH: number): DotCoord[];
declare const ASCII_CHARSETS: Record<string, string>;
declare function imageDataToAscii(imageData: ImageData, opts: {
    charset?: string;
    fontSize?: number;
    charSpacing?: number;
    lineSpacing?: number;
    colored?: boolean;
    contrast?: number;
    brightness?: number;
    gamma?: number;
    invertBrightness?: boolean;
}, outW: number, outH: number): AsciiCell[];
declare function drawDots(ctx: CanvasRenderingContext2D, dots: DotCoord[], opts: {
    bgColor?: string;
    dotColor?: string;
    useSourceColor?: boolean;
    overlayColor?: string;
    overlayOpacity?: number;
    blendMode?: BlendMode;
}, w: number, h: number): void;
declare function drawAscii(ctx: CanvasRenderingContext2D, cells: AsciiCell[], opts: {
    bgColor?: string;
    fgColor?: string;
    colored?: boolean;
    fontSize?: number;
    fontFamily?: string;
    glow?: boolean;
    glowColor?: string;
    glowRadius?: number;
}, w: number, h: number): void;
declare function dotsToSVG(dots: DotCoord[], w: number, h: number, dotColor: string, bgColor: string): string;

interface DitherProps {
    type?: 'image' | 'video' | 'ascii';
    src: string;
    resolution?: number;
    width?: number;
    height?: number;
    algorithm?: DitherAlgorithm;
    spacing?: number;
    minRadius?: number;
    maxRadius?: number;
    charset?: 'detailed' | 'blocks' | 'pixel' | 'minimal' | string;
    fontSize?: number;
    charSpacing?: number;
    lineSpacing?: number;
    fontFamily?: string;
    threshold?: number;
    contrast?: number;
    brightness?: number;
    gamma?: number;
    blur?: number;
    highlights?: number;
    errorStrength?: number;
    serpentine?: boolean;
    invert?: boolean;
    backgroundColor?: string;
    dotColor?: string;
    sourceColors?: boolean;
    fgColor?: string;
    colored?: boolean;
    glow?: boolean;
    glowColor?: string;
    glowRadius?: number;
    overlayColor?: string;
    overlayOpacity?: number;
    blendMode?: BlendMode;
    glyphOverlay?: boolean;
    glyphRadius?: number;
    glyphSpacing?: number;
    glyphEdgeOnly?: boolean;
    glyphEdgeThreshold?: number;
    play?: boolean;
    loop?: boolean;
    muted?: boolean;
    fps?: number;
    interactive?: boolean;
    repelRadius?: number;
    repelStrength?: number;
    className?: string;
    style?: React.CSSProperties;
}
declare const Dither: React.FC<DitherProps>;

export { ASCII_CHARSETS, type AsciiCell, type BlendMode, Dither, type DitherAlgorithm, type DitherProps, type DotCoord, ditherImageData, dotsToSVG, drawAscii, drawDots, imageDataToAscii };
