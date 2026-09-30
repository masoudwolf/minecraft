/** Retry failed searches with backoff + delay, merging into existing JSON. */
import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync, readFileSync } from 'fs';

type Query = { q: string; area: string };

const QUERIES: Query[] = [
  { area: 'ue', q: 'why Unreal Engine games look good post processing effects' },
  { area: 'ue', q: 'Unreal Engine eye adaptation EV100 ISO exposure settings' },
  { area: 'ue', q: 'UE5 Lumen software ray tracing vs hardware ray tracing' },
  { area: 'mc', q: 'SEUS PTGI path traced global illumination technique' },
  { area: 'mc', q: 'Photon shader sixthsurge settings explanation' },
  { area: 'mc', q: 'Bliss shader Chocapic13 techniques explanation' },
  { area: 'mc', q: 'Rethinking Voxels shader technique explanation' },
  { area: 'mc', q: 'Optifine shader gbuffers composite deferred pipeline explained' },
  { area: 'lux', q: 'starlight lux level night ambient light level' },
  { area: 'lux', q: 'scotopic mesopic photopic vision Purkinje effect' },
  { area: 'lux', q: 'underwater visibility color absorption caustics physics' },
  { area: 'lux', q: 'crepuscular rays god rays physics underwater' },
  { area: 'lux', q: 'moonlight color temperature 4100K sunlight 5800K' },
  { area: 'lux', q: 'Overcast day illuminance 1000 lux lighting levels reference' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const zai = await ZAI.create();
  const out = JSON.parse(readFileSync('/home/z/my-project/agent-ctx/research/search-results.json', 'utf8'));
  for (const { q, area } of QUERIES) {
    const arr: any[] = out[area] || (out[area] = []);
    if (arr.some((x) => x.query === q && x.results)) { console.log('SKIP', q); continue; }
    let done = false;
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        const results = await zai.functions.invoke('web_search', { query: q, num: 8 });
        arr.push({ query: q, results });
        console.log('OK', q);
        done = true;
      } catch (e: any) {
        console.log(`retry${attempt} ${q}: ${e.message?.slice(0, 80)}`);
        await sleep(3000 * attempt);
      }
    }
    if (!done) arr.push({ query: q, error: 'all retries failed' });
    await sleep(1500);
  }
  writeFileSync('/home/z/my-project/agent-ctx/research/search-results.json', JSON.stringify(out, null, 2));
  console.log('merged');
}
main().catch((e) => { console.error(e); process.exit(1); });
