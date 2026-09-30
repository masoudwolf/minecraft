/** Extract key snippets from fetched pages for the report. */
import { readFileSync, writeFileSync } from 'fs';

function toText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#160;/g, ' ').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function load(name: string): string {
  try {
    const j = JSON.parse(readFileSync(`pages/${name}.json`, 'utf8'));
    return toText(j.html || '');
  } catch { return ''; }
}

function around(t: string, kw: string, before = 100, after = 700, label = ''): string {
  const i = t.indexOf(kw);
  if (i < 0) return `-- MISS [${label}] '${kw}'\n`;
  return `\n### [${label}] '${kw}' @${i}\n` + t.slice(Math.max(0, i - before), i + after) + '\n';
}

const out: string[] = [];

// --- Purkinje ---
const purk = load('purkinje');
out.push('======== PURKINJE (Wikipedia) ========');
out.push(around(purk, 'Purkinje effect', 0, 900, 'lead'));
out.push(around(purk, 'red objects', 200, 600, 'red'));
out.push(around(purk, 'luminance level', 200, 600, 'levels'));

// --- Scotopic ---
const scot = load('scotopic');
out.push('======== SCOTOPIC (Wikipedia) ========');
out.push(around(scot, 'Scotopic vision', 0, 700, 'lead'));
out.push(around(scot, 'mesopic', 100, 700, 'mesopic'));

// --- Moonlight ---
const moon = load('moonlight');
out.push('======== MOONLIGHT (Wikipedia) ========');
out.push(around(moon, 'illuminance', 100, 700, 'illuminance'));
out.push(around(moon, 'color temperature', 150, 700, 'colortemp'));
out.push(around(moon, '0.05', 100, 500, '05'));

// --- Color temperature ---
const ct = load('color_temp');
out.push('======== COLOR TEMPERATURE (Wikipedia) ========');
out.push(around(ct, '5800', 200, 500, 'sun'));
out.push(around(ct, '4100', 200, 500, '4100'));
out.push(around(ct, 'moonlight', 200, 500, 'moon'));
out.push(around(ct, 'overcast', 200, 500, 'overcast'));

// --- Rayleigh / sky ---
const ray = load('rayleigh');
out.push('======== RAYLEIGH (Wikipedia) ========');
out.push(around(ray, 'inverse fourth power', 200, 600, '4th'));
out.push(around(ray, 'blue light', 100, 500, 'blue'));

const sky = load('sky');
out.push('======== DIFFUSE SKY RADIATION (Wikipedia) ========');
out.push(around(sky, 'Rayleigh scattering', 150, 600, 'why blue'));
out.push(around(sky, 'sunset', 150, 600, 'sunset'));
out.push(around(sky, 'twilight', 100, 500, 'twilight'));

// --- Water absorption ---
const wa = load('water_absorption');
out.push('======== WATER EM ABSORPTION (Wikipedia) ========');
out.push(around(wa, 'red', 100, 500, 'red'));
out.push(around(wa, 'm−1', 0, 700, 'per-meter'));
out.push(around(wa, 'attenuation length', 100, 600, 'att-length'));

// --- Underwater vision ---
const uv = load('underwater_vision');
out.push('======== UNDERWATER VISION (Wikipedia) ========');
out.push(around(uv, 'attenuat', 100, 600, 'attenuation'));
out.push(around(uv, '10 metres', 100, 500, '10m'));
out.push(around(uv, 'caustic', 100, 400, 'caustic'));

// --- Crepuscular rays ---
const cr = load('crepuscular');
out.push('======== CREPUSCULAR RAYS (Wikipedia) ========');
out.push(around(cr, 'Crepuscular rays', 0, 900, 'lead'));
out.push(around(cr, 'shadows', 100, 600, 'shadows'));

// --- UE auto exposure ---
const aex = load('ue_autoexposure');
out.push('======== UE AUTO EXPOSURE (Epic docs) ========');
out.push(around(aex, 'Eye adaptation', 100, 700, 'eye'));
out.push(around(aex, 'Adaptation Speed', 100, 700, 'speed'));
out.push(around(aex, 'Meter Mask', 100, 500, 'meter'));
out.push(around(aex, 'Exposure Compensation Curve', 150, 700, 'curve'));
out.push(around(aex, '100', 100, 400, 'iso'));
out.push(around(aex, 'log luminance range', 100, 500, 'range'));

// --- UE Lumen ---
const lum = load('ue_lumen');
out.push('======== UE LUMEN (Epic docs) ========');
out.push(around(lum, 'Lumen is', 0, 900, 'lead'));
out.push(around(lum, 'Final Gather', 100, 700, 'final gather'));
out.push(around(lum, 'Short Range Ambient', 100, 600, 'ambient'));
out.push(around(lum, 'distance field', 150, 500, 'DF'));

// --- UE VSM ---
const vsm = load('ue_vsm');
out.push('======== UE VIRTUAL SHADOW MAPS (Epic docs) ========');
out.push(around(vsm, 'Virtual Shadow Maps', 0, 900, 'lead'));
out.push(around(vsm, '16-bit', 100, 500, 'bits'));
out.push(around(vsm, 'Page', 100, 400, 'pages'));

// --- UE Nanite ---
const nan = load('ue_nanite');
out.push('======== UE NANITE (Epic docs) ========');
out.push(around(nan, 'Nanite is', 0, 900, 'lead'));

// --- UE volumetric fog ---
const vf = load('ue_volumetricfog');
out.push('======== UE VOLUMETRIC FOG (Epic docs) ========');
out.push(around(vf, 'Volumetric Fog', 0, 900, 'lead'));
out.push(around(vf, 'Scattering Distribution', 150, 600, 'phase'));
out.push(around(vf, '64', 100, 500, 'resolution'));

// --- Level design book lighting ---
const ldb = load('leveldesignbook_lighting');
out.push('======== LEVEL DESIGN BOOK: LIGHTING ========');
out.push(around(ldb, 'contrast', 150, 700, 'contrast'));
out.push(around(ldb, 'value range', 100, 500, 'value range'));
out.push(around(ldb, 'composition', 100, 500, 'composition'));
out.push(around(ldb, 'guide', 100, 400, 'guide'));

// --- Game Developer contrast ---
const gd = load('gd_contrast');
out.push('======== GAME DEVELOPER: CONTRAST ========');
out.push(around(gd, 'contrast', 150, 700, 'contrast'));
out.push(around(gd, 'value structure', 100, 500, 'value structure'));

writeFileSync('extracted.md', out.join('\n'));
console.log('written extracted.md', out.join('').length);
