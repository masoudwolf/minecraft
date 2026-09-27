// ─── Achievements: MC-style advancement popups ──────────────────────────────

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  /** atlas tile index for the icon (uses flat tile icon) */
  iconTile: number;
}

export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  getWood: { id: 'getWood', title: 'Getting Wood', desc: 'Punch a tree and pick up a log', iconTile: 8 },
  benchmarking: { id: 'benchmarking', title: 'Benchmarking', desc: 'Craft a crafting table', iconTile: 25 },
  timeToMine: { id: 'timeToMine', title: 'Time to Mine!', desc: 'Craft a wooden pickaxe', iconTile: 25 },
  gettingUpgrade: { id: 'gettingUpgrade', title: 'Getting an Upgrade', desc: 'Craft a stone pickaxe', iconTile: 4 },
  hotTopic: { id: 'hotTopic', title: 'Hot Topic', desc: 'Build a furnace', iconTile: 28 },
  acquireHardware: { id: 'acquireHardware', title: 'Acquire Hardware', desc: 'Smelt an iron ingot', iconTile: 14 },
  diamonds: { id: 'diamonds', title: 'DIAMONDS!', desc: 'Pick up a diamond', iconTile: 16 },
  monsterHunter: { id: 'monsterHunter', title: 'Monster Hunter', desc: 'Slay a hostile monster', iconTile: 13 },
  cowTipper: { id: 'cowTipper', title: 'Cow Tipper', desc: 'Harvest some leather', iconTile: 14 },
  ironBelly: { id: 'ironBelly', title: 'Iron Belly', desc: 'Eat a steak to survive', iconTile: 45 },
  sleepTight: { id: 'sleepTight', title: 'Sweet Dreams', desc: 'Sleep in a bed through the night', iconTile: 49 },
  lightItUp: { id: 'lightItUp', title: 'Let There Be Light', desc: 'Place a torch', iconTile: 38 },
  // phase 8
  sniperDuel: { id: 'sniperDuel', title: 'Sniper Duel', desc: 'Kill a mob with an arrow from over 12 blocks', iconTile: 23 },
  trader: { id: 'trader', title: 'The Trader', desc: 'Trade with a villager', iconTile: 40 },
  gardener: { id: 'gardener', title: 'Growth Spurt', desc: 'Fertilize the land with bone meal', iconTile: 45 },
};

export class AchievementManager {
  unlocked = new Set<string>();
  private onChange: ((a: AchievementDef) => void) | null = null;

  setCallback(cb: (a: AchievementDef) => void): void {
    this.onChange = cb;
  }

  /** unlock silently for saves (no toast) */
  restore(ids: string[]): void {
    for (const id of ids) this.unlocked.add(id);
  }

  unlock(id: string): void {
    if (this.unlocked.has(id)) return;
    const def = ACHIEVEMENTS[id];
    if (!def) return;
    this.unlocked.add(id);
    this.onChange?.(def);
  }

  has(id: string): boolean {
    return this.unlocked.has(id);
  }

  serialize(): string[] {
    return Array.from(this.unlocked);
  }
}
