#!/usr/bin/env node
/** regionScan.cjs — locate texel clusters by color predicate + print average
 *  colors of box-UV face regions. Usage:
 *   node regionScan.cjs <file.png> pink            → bounding boxes of pink-ish (udder/nose/wattle) pixels
 *   node regionScan.cjs <file.png> dark            → bounding boxes of dark (eyes/coal/mouth) pixels
 *   node regionScan.cjs <file.png> regions u,v,w,h [u,v,w,h ...] → avg colors of regions
 */
const sharp = require(`${process.cwd()}/node_modules/sharp`);

(async () => {
  const [file, mode, ...rest] = process.argv.slice(2);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  console.log(`${file}: ${W}x${H}`);

  if (mode === 'regions') {
    for (const r of rest) {
      const [u, v, w, h] = r.split(',').map(Number);
      let rs = 0, gs = 0, bs = 0, n = 0, opaque = 0;
      for (let y = v; y < Math.min(v + h, H); y++)
        for (let x = u; x < Math.min(u + w, W); x++) {
          const o = (y * W + x) * C;
          const a = data[o + 3];
          if (a < 40) continue;
          rs += data[o]; gs += data[o + 1]; bs += data[o + 2]; n++;
          if (a > 200) opaque++;
        }
      const hex = (c) => Math.round(c / (n || 1)).toString(16).padStart(2, '0');
      console.log(`  region(${u},${v} ${w}x${h}) avg #${hex(rs)}${hex(gs)}${hex(bs)} opaque ${opaque}/${w * h}`);
    }
    return;
  }

  // cluster scan
  const isPink = (r, g, b) => r > 140 && r - g > 20 && g - b > -20 && g - b < 40 && b > 90 && r > b;
  const isDark = (r, g, b) => Math.max(r, g, b) < 70;
  const pred = mode === 'dark' ? isDark : isPink;
  const seen = new Uint8Array(W * H);
  const boxes = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (seen[idx]) continue;
      const o = idx * C;
      if (data[o + 3] < 40 || !pred(data[o], data[o + 1], data[o + 2])) { seen[idx] = 1; continue; }
      // flood fill
      const stack = [[x, y]];
      let minx = x, maxx = x, miny = y, maxy = y, n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
        const ci = cy * W + cx;
        if (seen[ci]) continue;
        const co = ci * C;
        if (data[co + 3] < 40 || !pred(data[co], data[co + 1], data[co + 2])) { seen[ci] = 1; continue; }
        seen[ci] = 1; n++;
        minx = Math.min(minx, cx); maxx = Math.max(maxx, cx);
        miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      if (n >= 4) boxes.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, n });
    }
  boxes.sort((a, b) => b.n - a.n);
  console.log(`${mode} clusters (x,y w×h count):`);
  for (const b of boxes.slice(0, 24))
    console.log(`  (${b.x},${b.y}) ${b.w}x${b.h} n=${b.n}`);
})();
