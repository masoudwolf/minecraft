#!/usr/bin/env node
/** regionDump.cjs — ASCII-visualize a PNG region to derive MC box-UV layouts.
 * usage: node regionDump.cjs <file.png> [x y w h]
 * . = transparent, else color letter. Prints grid.
 */
const sharp = require(`${process.cwd()}/node_modules/sharp`);

function cls(r, g, b, a) {
  if (a < 40) return '.';
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 60) return 'k';                    // black/dark
  if (r > 200 && g > 200 && b > 200) return 'W'; // white
  if (mx - mn < 24) { return mx > 170 ? 'L' : mx > 100 ? 'm' : 'd'; } // gray scale
  if (r > 180 && g > 100 && b < 110 && g > b) return r > 220 ? 'P' : 'p'; // pink
  if (r > 180 && g < 110 && b < 110) return 'R'; // red
  if (r > 170 && g > 110 && b < 100) return 'O'; // orange
  if (r > 130 && g > 90 && b < 90 && r > g) return 'N'; // brown/tan
  if (g > 120 && r < 130 && b < 140) return 'g'; // green
  if (b > 120 && b > r && b > g) return 'b';   // blue
  if (r > 140 && b > 140 && g < 120) return 'V'; // purple/magenta
  if (g > 100 && r < 100) return 'g';
  return 'x';
}

(async () => {
  const [file, x = 0, y = 0, w = 0, h = 0] = process.argv.slice(2);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const rx = Number(x), ry = Number(y);
  const rw = Number(w) || W, rh = Number(h) || H;
  console.log(`${file}: ${W}x${H}  region (${rx},${ry}) ${rw}x${rh}`);
  process.stdout.write('    ' + Array.from({ length: rw }, (_, i) => (rx + i) % 10 === 0 ? '|' : ((rx + i) % 5 === 0 ? '+' : '-')).join('') + '\n');
  for (let yy = ry; yy < Math.min(ry + rh, H); yy++) {
    let line = '';
    for (let xx = rx; xx < Math.min(rx + rw, W); xx++) {
      const o = (yy * W + xx) * info.channels;
      line += cls(data[o], data[o + 1], data[o + 2], data[o + 3]);
    }
    process.stdout.write(String(yy).padStart(3) + ' ' + line + '\n');
  }
})();
