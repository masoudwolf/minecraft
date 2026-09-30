/**
 * Research batch search script — Task 50-a (graphics research)
 * Runs many web searches, saves results as JSON per area.
 */
import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync } from 'fs';

type Query = { q: string; area: string };

const QUERIES: Query[] = [
  // Area 1 — Unreal Engine
  { area: 'ue', q: 'Unreal Engine 5 Lumen global illumination how it works' },
  { area: 'ue', q: 'Unreal Engine virtual shadow maps how it works' },
  { area: 'ue', q: 'UE5 Nanite virtualized geometry explained' },
  { area: 'ue', q: 'UE5 auto exposure eye adaptation curve explanation' },
  { area: 'ue', q: 'Unreal Engine volumetric fog how it works light scattering' },
  { area: 'ue', q: 'Unreal Engine filmic ACES tonemapper color grading' },
  { area: 'ue', q: 'why Unreal Engine games look good post processing effects' },
  { area: 'ue', q: 'Unreal Engine eye adaptation EV100 ISO exposure settings' },

  // Area 2 — Minecraft shader packs
  { area: 'mc', q: 'BSL shader settings night brightness explanation' },
  { area: 'mc', q: 'Complementary Reimagined shaders how it works techniques' },
  { area: 'mc', q: 'SEUS PTGI path traced global illumination technique' },
  { area: 'mc', q: 'Photon shader sixthsurge settings explanation' },
  { area: 'mc', q: 'Bliss shader Chocapic13 techniques explanation' },
  { area: 'mc', q: 'Rethinking Voxels shader technique explanation' },
  { area: 'mc', q: 'Minecraft shader pack internals technical breakdown blog' },
  { area: 'mc', q: 'Optifine shader gbuffers composite deferred pipeline explained' },

  // Area 3 — real world lighting physics
  { area: 'lux', q: 'full moon illuminance lux sunlight lux comparison table' },
  { area: 'lux', q: 'starlight lux level night ambient light level' },
  { area: 'lux', q: 'scotopic mesopic photopic vision Purkinje effect' },
  { area: 'lux', q: 'Rayleigh scattering why sky is blue sunset red explanation' },
  { area: 'lux', q: 'underwater light attenuation per meter red green blue absorption' },
  { area: 'lux', q: 'underwater visibility color absorption caustics physics' },
  { area: 'lux', q: 'crepuscular rays god rays physics underwater' },
  { area: 'lux', q: 'moonlight color temperature 4100K sunlight 5800K' },
  { area: 'lux', q: 'Overcast day illuminance 1000 lux lighting levels reference' },

  // Area 4 — night darkness design
  { area: 'night', q: 'how dark should night be in survival games design' },
  { area: 'night', q: 'horror game darkness rendering techniques fog vignette' },
  { area: 'night', q: 'Minecraft shader night darkness setting discussion' },
  { area: 'night', q: 'game design moonlight blue shift night level' },
  { area: 'night', q: 'survival horror games day night cycle darkness fear design' },
  { area: 'night', q: 'game lighting design contrast torch pools darkness' },
];

async function main() {
  const zai = await ZAI.create();
  const out: Record<string, unknown[]> = {};
  for (const { q, area } of QUERIES) {
    try {
      const results = (await zai.functions.invoke('web_search', { query: q, num: 8 })) as unknown[];
      out[area] = out[area] || [];
      out[area].push({ query: q, results });
      console.log(`OK [${area}] ${q} -> ${(results as unknown[]).length}`);
    } catch (e) {
      console.log(`FAIL ${q}: ${(e as Error).message}`);
      out[area] = out[area] || [];
      out[area].push({ query: q, error: (e as Error).message });
    }
  }
  writeFileSync('/home/z/my-project/agent-ctx/research/search-results.json', JSON.stringify(out, null, 2));
  console.log('saved search-results.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
