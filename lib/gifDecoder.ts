import { parseGIF, decompressFrames } from "gifuct-js";

export interface GifDecodeResult {
    frames: ImageData[];
    delays: number[];   // per-frame delay in ms
    fps: number;        // average fps derived from delays
    width: number;
    height: number;
    frameCount: number;
}

/**
 * Decode an animated GIF file into an array of composited ImageData frames.
 * Handles GIF disposal methods 0-3 and transparent patches correctly.
 */
export async function decodeGif(
    file: File,
    onProgress: (ratio: number, label: string) => void,
    outputSize = 600
): Promise<GifDecodeResult> {
    onProgress(0, "Reading GIF…");
    const buffer = await file.arrayBuffer();

    onProgress(0.1, "Parsing GIF frames…");
    const gif = parseGIF(buffer);
    const frames = decompressFrames(gif, true);

    if (!frames.length) throw new Error("No frames found in GIF");

    // Intrinsic dimensions
    const srcW = gif.lsd.width;
    const srcH = gif.lsd.height;

    // Compute output dims preserving aspect ratio
    const aspect = srcW / srcH;
    let outW: number, outH: number;
    if (aspect >= 1) { outW = outputSize; outH = Math.round(outputSize / aspect); }
    else { outH = outputSize; outW = Math.round(outputSize * aspect); }
    outW = outW % 2 === 0 ? outW : outW - 1;
    outH = outH % 2 === 0 ? outH : outH - 1;

    // Offscreen canvas for compositing at source resolution
    const canvas = document.createElement("canvas");
    canvas.width = srcW; canvas.height = srcH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    // Output canvas for scaling
    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW; outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d", { willReadFrequently: true })!;

    // Temp canvas for each frame patch
    const patchCanvas = document.createElement("canvas");
    const patchCtx = patchCanvas.getContext("2d")!;

    const imageFrames: ImageData[] = [];
    const delays: number[] = [];

    // Track "restore to previous" snapshot
    let prevSnapshot: ImageData | null = null;

    for (let i = 0; i < frames.length; i++) {
        onProgress(0.1 + (i / frames.length) * 0.9, `Decoding frame ${i + 1}/${frames.length}`);

        const frame = frames[i];
        const { top, left, width: fw, height: fh } = frame.dims;

        // Before drawing, handle previous frame's disposal
        if (i > 0) {
            const prevFrame = frames[i - 1];
            const disposalType = prevFrame.disposalType ?? 0;
            if (disposalType === 2) {
                // Restore to background — clear region
                ctx.clearRect(prevFrame.dims.left, prevFrame.dims.top, prevFrame.dims.width, prevFrame.dims.height);
            } else if (disposalType === 3 && prevSnapshot) {
                // Restore to previous snapshot
                ctx.putImageData(prevSnapshot, 0, 0);
            }
            // disposalType 0 & 1: leave as-is
        }

        // Snapshot before drawing (needed for disposal type 3)
        const needsSnapshot = (frame.disposalType ?? 0) === 3;
        if (needsSnapshot) prevSnapshot = ctx.getImageData(0, 0, srcW, srcH);
        else prevSnapshot = null;

        // Draw this frame's patch onto the composite canvas
        patchCanvas.width = fw; patchCanvas.height = fh;
        const patchImageData = patchCtx.createImageData(fw, fh);
        patchImageData.data.set(frame.patch);
        patchCtx.putImageData(patchImageData, 0, 0);
        ctx.drawImage(patchCanvas, left, top);

        // Scale composite to output size and capture
        outCtx.clearRect(0, 0, outW, outH);
        outCtx.drawImage(canvas, 0, 0, outW, outH);
        imageFrames.push(outCtx.getImageData(0, 0, outW, outH));

        // GIF delays are in centiseconds (1/100 s)
        const delayMs = Math.max((frame.delay ?? 10), 2) * 10;
        delays.push(delayMs);

        // Yield periodically so the UI doesn't freeze
        if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    // Average FPS from delays
    const avgDelayMs = delays.reduce((s, d) => s + d, 0) / delays.length;
    const fps = Math.min(60, Math.max(6, Math.round(1000 / avgDelayMs)));

    return { frames: imageFrames, delays, fps, width: outW, height: outH, frameCount: frames.length };
}
