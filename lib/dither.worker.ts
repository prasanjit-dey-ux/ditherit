// Web Worker for dithering — runs off main thread

import { ditherImage, DitherParams } from "./dither";

self.onmessage = (e: MessageEvent) => {
    const { imageData, params, outputWidth, outputHeight, frameIndex } = e.data;
    const dots = ditherImage(imageData, params, outputWidth, outputHeight);
    self.postMessage({ dots, frameIndex });
};
