#!/usr/bin/env node
/**
 * fetchEntityTextures.cjs — download vanilla Minecraft entity textures
 * into public/textures/entity/ so the game can use pixel-perfect vanilla skins.
 * Source: InventivetalentDev/minecraft-assets (official asset mirror) @ 1.20.4
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.4/assets/minecraft/textures/entity';
const OUT = path.join(__dirname, '..', '..', 'public', 'textures', 'entity');

// mob key → candidate paths (first that downloads wins)
const FILES = {
  pig: ['pig/pig.png', 'pig.png'],
  cow: ['cow/cow.png', 'cow.png'],
  mooshroom_red: ['cow/red_mooshroom.png', 'cow/mooshroom.png'],
  mooshroom_brown: ['cow/brown_mooshroom.png'],
  sheep_body: ['sheep/sheep.png'],
  sheep_fur: ['sheep/sheep_fur.png'],
  chicken: ['chicken.png', 'chicken/chicken.png'],
  zombie: ['zombie/zombie.png'],
  skeleton: ['skeleton/skeleton.png'],
  creeper: ['creeper/creeper.png'],
  spider: ['spider/spider.png'],
  enderman: ['enderman/enderman.png'],
  villager: ['villager/villager.png'],
  iron_golem: ['iron_golem/iron_golem.png'],
  witch: ['witch.png', 'witch/witch.png'],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0, fail = [];
  for (const [key, candidates] of Object.entries(FILES)) {
    let done = false;
    for (const rel of candidates) {
      try {
        const res = await fetch(`${BASE}/${rel}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 200) continue; // sane PNG size guard
        if (!(buf[0] === 0x89 && buf[1] === 0x50)) continue; // PNG magic
        fs.writeFileSync(path.join(OUT, `${key}.png`), buf);
        const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
        console.log(`OK  ${key}.png  <- ${rel}  (${w}x${h}, ${buf.length}B)`);
        ok++; done = true; break;
      } catch (e) { /* try next */ }
    }
    if (!done) { fail.push(key); console.log(`FAIL ${key}`); }
  }
  console.log(`\nDownloaded ${ok}/${Object.keys(FILES).length}`);
  if (fail.length) { console.log('MISSING: ' + fail.join(', ')); process.exit(1); }
})();
