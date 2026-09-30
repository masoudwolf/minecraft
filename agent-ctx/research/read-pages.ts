/** Batch page reader — curated high-value URLs for graphics research. */
import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const PAGES: [string, string][] = [
  // Area 1 — UE5
  ['ue_lumen', 'https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine'],
  ['ue_vsm', 'https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine'],
  ['ue_nanite', 'https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine'],
  ['ue_autoexposure', 'https://dev.epicgames.com/documentation/en-us/unreal-engine/auto-exposure-in-unreal-engine'],
  ['ue_volumetricfog', 'https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-fog-in-unreal-engine'],
  ['ue_postprocess', 'https://dev.epicgames.com/documentation/en-us/unreal-engine/post-process-effects-in-unreal-engine'],

  // Area 3 — real-world physics
  ['lux', 'https://en.wikipedia.org/wiki/Lux'],
  ['purkinje', 'https://en.wikipedia.org/wiki/Purkinje_effect'],
  ['scotopic', 'https://en.wikipedia.org/wiki/Scotopic_vision'],
  ['rayleigh', 'https://en.wikipedia.org/wiki/Rayleigh_scattering'],
  ['sky', 'https://en.wikipedia.org/wiki/Diffuse_sky_radiation'],
  ['crepuscular', 'https://en.wikipedia.org/wiki/Crepuscular_rays'],
  ['water_absorption', 'https://en.wikipedia.org/wiki/Electromagnetic_absorption_by_water'],
  ['underwater_vision', 'https://en.wikipedia.org/wiki/Underwater_vision'],
  ['moonlight', 'https://en.wikipedia.org/wiki/Moonlight'],
  ['color_temp', 'https://en.wikipedia.org/wiki/Color_temperature'],

  // Area 2/4 — shader packs + night design
  ['shaders_namu', 'https://en.namu.wiki/w/Minecraft%2FMode%2FShader'],
  ['moonlight_temp_cine', 'https://cinematography.com/index.php/topic/2235-moonlight-color-temperature/'],
  ['schneider_natural_light', 'https://schneiderkreuznach.com/en/know-how/photo/glossary/natural-light-sunlight-moonlight-color-temperature'],
  ['gd_contrast', 'https://www.gamedeveloper.com/design/lighting-design-fundamentals-using-contrast-in-your-game-i'],
  ['leveldesignbook_lighting', 'https://book.leveldesignbook.com/process/lighting'],
  ['unity_darkness', 'https://discussions.unity.com/t/flashlights-lanterns-and-darkness-oh-my/499293'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const zai = await ZAI.create();
  const outDir = '/home/z/my-project/agent-ctx/research/pages';
  mkdirSync(outDir, { recursive: true });
  const index: Record<string, { title?: string; url: string; chars: number; error?: string }> = {};

  for (const [name, url] of PAGES) {
    const file = `${outDir}/${name}.json`;
    if (existsSync(file)) { console.log('SKIP', name); continue; }
    try {
      const result = await zai.functions.invoke('page_reader', { url });
      const data = result?.data ?? result;
      writeFileSync(file, JSON.stringify(data, null, 2));
      index[name] = { title: data?.title, url, chars: (data?.html || '').length };
      console.log('OK', name, data?.title?.slice(0, 60), (data?.html || '').length);
    } catch (e: any) {
      index[name] = { url, chars: 0, error: e.message?.slice(0, 100) };
      console.log('FAIL', name, e.message?.slice(0, 90));
    }
    await sleep(2500);
  }
  writeFileSync(`${outDir}/index.json`, JSON.stringify(index, null, 2));
  console.log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
