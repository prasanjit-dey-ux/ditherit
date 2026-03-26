"use client";

import { useRef, useCallback } from "react";
import { DitherParams, DotCoord } from "./dither";

export function useWorkerDither() {
    const workerRef = useRef<Worker | null>(null);

    const getWorker = useCallback(() => {
        // Terminate old worker if busy
        if (workerRef.current) {
            workerRef.current.terminate();
        }
        const worker = new Worker(new URL("./dither.worker.ts", import.meta.url));
        workerRef.current = worker;
        return worker;
    }, []);

    const runDither = useCallback(
        (
            imageData: ImageData,
            params: DitherParams,
            outputWidth: number,
            outputHeight: number,
            frameIndex = 0
        ): Promise<{ dots: DotCoord[]; frameIndex: number }> => {
            return new Promise((resolve) => {
                const worker = getWorker();
                worker.onmessage = (e) => {
                    resolve(e.data);
                    worker.terminate();
                    workerRef.current = null;
                };
                worker.postMessage({ imageData, params, outputWidth, outputHeight, frameIndex });
            });
        },
        [getWorker]
    );

    const terminate = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);

    return { runDither, terminate };
}
