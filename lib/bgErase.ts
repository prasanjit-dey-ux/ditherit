/**
 * Client-side background eraser using flood-fill from image corners.
 * Works well for logos/icons on solid or near-solid backgrounds.
 */

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

export function removeBackground(imageData: ImageData, tolerance = 32): ImageData {
  const { width: w, height: h, data } = imageData;
  const result = new Uint8ClampedArray(data);
  const visited = new Uint8Array(w * h);

  // Sample background color from all 4 corners (pick most common)
  const corners = [
    [0, 0], [w-1, 0], [0, h-1], [w-1, h-1],
    [Math.floor(w/2), 0], [0, Math.floor(h/2)], // top/left edge mid
  ];
  const samples: [number,number,number][] = corners.map(([cx,cy]) => {
    const i = (cy * w + cx) * 4;
    return [data[i], data[i+1], data[i+2]];
  });
  // Pick bg color as average of corner samples that are close to each other
  const bgR = Math.round(samples.reduce((s,c) => s+c[0], 0) / samples.length);
  const bgG = Math.round(samples.reduce((s,c) => s+c[1], 0) / samples.length);
  const bgB = Math.round(samples.reduce((s,c) => s+c[2], 0) / samples.length);

  // BFS flood fill from all 4 corners
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (colorDistance(data[i], data[i+1], data[i+2], bgR, bgG, bgB) <= tolerance) {
      visited[idx] = 1;
      queue.push(idx);
    }
  };
  corners.forEach(([cx,cy]) => seed(cx, cy));
  // Also seed along edges
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h-1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w-1, y); }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w, y = Math.floor(idx / w);
    // Make pixel transparent
    result[idx*4+3] = 0;
    const neighbors = [
      [x-1,y],[x+1,y],[x,y-1],[x,y+1],
      [x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]
    ];
    for (const [nx,ny] of neighbors) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      const pi = ni * 4;
      if (colorDistance(data[pi], data[pi+1], data[pi+2], bgR, bgG, bgB) <= tolerance) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  return new ImageData(result, w, h);
}
