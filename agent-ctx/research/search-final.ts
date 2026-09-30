/** Final spaced retry pass — 8s delay between queries. */
import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync, readFileSync } from 'fs';

const QUERIES: [string, string][] = [
  ['ue', 'UE5 Nanite virtualized geometry explained'],
  ['ue', 'UE5 auto exposure eye adaptation curve explanation'],
  ['ue', 'Unreal Engine eye adaptation EV100 ISO exposure settings'],
  ['mc', 'BSL shader settings night brightness explanation'],
  ['mc', 'SEUS PTGI path traced global illumination technique'],
  ['mc', 'Optifine shader gbuffers composite deferred pipeline explained'],
  ['lux', 'scotopic mesopic photopic vision Purkinje effect'],
  ['lux', 'crepuscular rays god rays physics underwater'],
  ['lux', 'moonlight color temperature kelvin vs sunlight'],
  ['lux', 'Overcast day illuminance lux lighting levels reference table'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const zai = await ZAI.create();
  const out = JSON.parse(readFileSync('/home/z/my-project/agent-ctx/research/search-results.json', 'utf8'));
  for (const [area, q] of QUERIES) {
    const arr: any[] = out[area];
    if (arr.some((x) => x.query === q && x.results)) { console.log('SKIP', q); continue; }
    try {
      const results = await zai.functions.invoke('web_search', { query: q, num: 8 });
      arr.push({ query: q, results });
      console.log('OK', q);
    } catch (e: any) {
      console.log('FAIL', q, e.message?.slice(0, 60));
    }
    await sleep(8000);
  }
  writeFileSync('/home/z/my-project/agent-ctx/research/search-results.json', JSON.stringify(out, null, 2));
  console.log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
