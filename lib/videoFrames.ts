export interface FrameExtractResult {
    frames: ImageData[];
    fps: number;
    width: number;
    height: number;
    duration: number;
}

/** Read File as a data: URL — works in sandboxed iframes where blob: URLs from File fail */
function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(file);
    });
}

export async function extractVideoFrames(
    file: File,
    targetFps: number,
    outputSize: number,
    maxFrames: number,
    onProgress: (ratio: number, label: string) => void
): Promise<FrameExtractResult> {
    // Use FileReader → data URL to avoid blob: URL sandbox restrictions
    onProgress(0, "Reading video file…");
    const src = await fileToDataUrl(file);

    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        // DO NOT set crossOrigin on data: URLs — causes CORS errors

        video.onerror = () => reject(new Error(`Video load failed (code ${video.error?.code ?? "?"})`));

        video.onloadedmetadata = () => {
            const duration = video.duration;
            if (!isFinite(duration) || duration <= 0) {
                reject(new Error("Invalid video duration: " + duration));
                return;
            }

            // Compute output dimensions preserving aspect ratio
            const aspect = video.videoWidth / video.videoHeight;
            let cw: number, ch: number;
            if (aspect >= 1) { cw = outputSize; ch = Math.round(outputSize / aspect); }
            else { ch = outputSize; cw = Math.round(outputSize * aspect); }
            // Even dimensions
            cw = cw % 2 === 0 ? cw : cw - 1;
            ch = ch % 2 === 0 ? ch : ch - 1;

            const totalFrames = Math.min(Math.max(1, Math.floor(duration * targetFps)), maxFrames);
            const frameInterval = duration / totalFrames;

            const offscreen = document.createElement("canvas");
            offscreen.width = cw;
            offscreen.height = ch;
            const ctx = offscreen.getContext("2d", { willReadFrequently: true })!;

            const frames: ImageData[] = [];
            let frameIdx = 0;
            let seekTimeout: ReturnType<typeof setTimeout>;
            let lastSeekTime = -1;

            const captureFrame = () => {
                clearTimeout(seekTimeout);
                ctx.drawImage(video, 0, 0, cw, ch);
                frames.push(ctx.getImageData(0, 0, cw, ch));
                onProgress(frameIdx / totalFrames, `Extracting frame ${frameIdx + 1}/${totalFrames}`);
                frameIdx++;
                if (frameIdx >= totalFrames) {
                    resolve({ frames, fps: targetFps, width: cw, height: ch, duration });
                } else {
                    seekNext();
                }
            };

            const seekNext = () => {
                const targetTime = Math.min(frameIdx * frameInterval, duration - 0.001);
                // Avoid seeking to same position twice (some browsers skip onseeked)
                if (Math.abs(targetTime - lastSeekTime) < 0.001) {
                    captureFrame();
                    return;
                }
                lastSeekTime = targetTime;
                video.currentTime = targetTime;
                // Timeout fallback if onseeked never fires
                seekTimeout = setTimeout(captureFrame, 3000);
            };

            video.onseeked = captureFrame;
            seekNext();
        };

        video.src = src;
    });
}
