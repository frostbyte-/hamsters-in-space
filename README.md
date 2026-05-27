## Hamsters in Space

**Project**: Browser-based card game (Plain HTML + vanilla JS). You've crash-landed on a strange planet and must rebuild your spaceship before the space pirates capture you and make you run in a space-wheel forever.

Files: `prototype.html`, `js/config.js`, `js/game.js`, `js/render.js`, `js/helpers.js`, `js/art.js`, `js/main.js`, `styles/main.css`. Cache-busted with `?v=62` on all script/CSS links. Preview server runs on port `3457`.

---

### Turn Structure

Each turn has two sequential phases:

#### 1. Action Phase

**Choose one action:**
- **🃏 Deploy** — play up to 2 cards from hand to tableau; resources commit immediately
- **⚡ Steal** — discard an Engine card from hand (or use engine ship part) → pick target → pick suit → defender may block or lose a card of that suit from their tableau
- **💥 Attack** — same activation → destroy a target's tableau card (goes to junkyard, attacker gains +1🧵 with `attackLoot`) or damage a ship part / disable a pirate part; defender may block
- **🧭 Sneak** — same activation → pick up to **2 free cards from market** (3 with Coffee Machine) OR up to **3 free cards from junkyard**; after picking, choose which cards to deploy to tableau via multi-select; bonus resources applied on pick if nav bonus ship-part powers are active
- **Skip** → gain +2⚙️ Scrap and +1🧵 Tech
- **Build** — spend 3 same-suit tableau cards → complete a ship part; choose which card's upgrade power to embed (or none)
- **Repair** — select 2 same-suit OR 3 any-suit **hand cards** → restore a damaged ship part (1 any-suit card with Rice Cooker in tableau)
- **♻️ Salvage** — take up to 3 cards from the junkyard to hand (available anytime; requires Navigation ship part or Marauder's Map pirate card)
- **🫙 Disable Part** — (Balsamic Vinegar in tableau) target an opponent's ship part to disable it until their next turn

**NTL01–04 free-action activation**: Cards with a free ability (Giant Frisbee/BFG/Cute Drone/K-ML) can be **played to tableau** for their resource value, OR **⚡ Activated** by discarding directly from hand — NTL02/03/04 immediately start the Attack/Steal/Sneak without needing a ship part; NTL01 can be discarded by the defender during an incoming attack to enable Block.

**Pirate Actions** (can be taken instead of any other action):
- **👾 Sell** — select 2 hand cards → send to junkyard → gain 2 👾 (3 👾 with Contraband Hold bonus)
- **🏴‍☠️ Pirate Attack** (2 👾) → force an opponent to discard one tableau card of a chosen suit to junkyard
- **🗑️ Junk Shop** (1 👾) → view all junkyard cards, pick up to 2 to take to hand
- **Buy Pirate Card** from pirate market (3–4 👾 cost)
- **🔧 Repair Pirate Part** (2 👾) — re-enable a disabled pirate card you own

#### 2. Buy Phase
- Spend ⚙️/🧵 to buy **up to 2 cards** from the card market; purchased slots refill immediately
- Click **"Done Buying"** to end turn and pass to next player

**Win condition**: be the first player to have **3 active ship parts**. Both regular undamaged ship parts and undamaged pirate parts count. Damaged/disabled parts do not count.

---

### Resource System

- **⚙️ Scrap** and **🧵 Tech** are stored as integers on each player (`p.scrap`, `p.tech`)
- Resources accumulate permanently — they do NOT reset between turns or on card removal
- Spending happens in Buy Phase; tableau cards stay put until used to build, stolen, attacked, or used as ability activation cost

---

### Ship Part Activation Cost

When you own an undamaged ship part (or enabled pirate part) of a suit, using that suit's ability (Steal/Attack/Sneak) gives you a **choice** of how to pay:

1. **Discard a matching hand card** (normal cost) — part is unaffected
2. **Damage your ship part** — no hand card needed; repair later with the Repair action
3. **Disable your pirate part** — no hand card needed; effects suspended until repaired for 2 👾

If you have no part and no matching hand card, the ability is unavailable.

---

### Suit Abilities

| Suit | Icon | Ability | Cost |
|------|------|---------|------|
| Engine | ⚡ | **Steal** a tableau card from an opponent | Discard engine card OR damage engine part |
| Weapons | 💥 | **Attack** — destroy/damage opponent's tableau or ship part | Discard weapons card OR damage weapons part |
| Navigation | 🧭 | **Sneak** — take free cards from market or junkyard | Discard nav card OR damage nav part |
| Shield | 🛡️ | **Block** a steal or attack | Discard shield card OR damage shield part (defender only) |

---

### Steal / Attack Defender Flow

- **Steal**: attacker picks target → picks suit column → defender can **block** (discard shield card / damage shield part) or **sacrifice** a card of that suit (goes to attacker's hand)
- **Attack (tableau)**: same flow but sacrificed card goes to junkyard (or attacker's hand with `attackLoot` bonus)
- **Attack (ship part)**: defender accepts damage or blocks; damaged part stays (repair later)
- **Attack (pirate part)**: defender accepts disable or blocks; disabled pirate part suspends both upside and downside until repaired (2 👾)
- **Pirate Attack Targeted Strike**: defender picks which card of that suit goes to junkyard — no block option

---

### Icons

| Symbol | Meaning |
|--------|---------|
| ⚡ | Engine suit |
| 💥 | Weapons suit |
| 🧭 | Navigation suit |
| 🛡️ | Shield suit |
| ⚙️ | Scrap resource |
| 🧵 | Tech resource |
| 👾 | Pirate tokens |

---

### Key Data Structures

**Player state**:
```js
{ name, hand:[], tableau:[],
  scrap:0, tech:0,
  shipParts:[{suit, title, power?, damaged?, disabled?}],
  usedCards:[],          // cards spent on build — personal pile, not reshuffled
  pirateTokens:0,
  pirateCards:[{upside, downside, disabled?}] }
```

**Game state** (global `game`):
```js
{ players:[], currentPlayerIndex:0,
  deck:[], discard:[], cardMarket:[5 slots],
  junkyard:[{type:'card', card},...],
  pirateMarket:[4 slots], log:[] }
```

**Turn phase** (module-level):
```js
currentPhase: 'action' | 'buy'
```

**Pending states** (module-level globals):
```js
pendingSteal, pendingAttack, pendingDefenderChoice,
pendingPartActivation,   // { suit, action, phase:'choose'|'keepOrDiscard', ... }
pendingDamagedShipPart,
pendingJunkyardPick, pendingJunkyardShop,
pendingBuyPhase, pendingPass, pendingRepair,
pendingCallForAid, pendingDiscard,
pendingAbilityPick,        // { mode:'steal'|'attack'|'sneak'|'block', candidates, targetIdx }
pendingBuildSelect,        // { suit, selectedIds, required }
pendingSneakTableauSelect, // { instanceIds:[], selectedIds:Set } — multi-select deploy after sneak picks
sellMode, sellSelection
playedThisTurn   // Set of instanceIds played this turn
sneakPickedIds   // accumulates all sneak picks (market + junkyard) before multi-select
sneakTableauPlayQueue  // processes confirmed sneak tableau plays sequentially
```

`anyBlocking()` returns true if any interactive pending state is active — gates most actions.

`requireActionPhase()` — guard used by all action starters; also blocks if `anyBlocking()`.

---

### Cards

32 card definitions across 4 suits (engine/weapons/navigation/shield), quantity 1 each. Each card has:
```js
{ id, title, suit, description, quantity,
  symbols: { scrap:N, tech:N },   // resources gained when played to tableau
  cost:    { scrap:N, tech:N },   // cost to buy from market
  power?:  { effect, value, resource?, text } } // optional tableau power
```

Ship-part upgrade powers (type `'upgrade'`) are embedded at build time and active while the part is undamaged and not disabled. Neutral/wild tableau powers (type `'tableau'`) are active while the card sits in the player's tableau.

Supported power effects:
- `turnStartResource` — gain scrap/tech each turn start (resource field selects which)
- `tokenPerTurn` — gain +1 👾 each turn start
- `pirateOnSteal` — extra 👾 per successful steal
- `drawOnAttack` — draw 1 card after each successful attack
- `attackLoot` — gain +1🧵 after each successful attack
- `pirateTokenOnBuild` — gain +1 👾 each time a ship part is built or a pirate card is bought
- `pirateTokenOnBlock` — gain +1 👾 each time you successfully Block
- `drawOnBlock` — draw 1 card each time you successfully Block
- `blockStealBack` — when you block a steal, take 1 👾 from the attacker
- `sellBonus` — selling cards now gives 3 👾
- `extraDraw` — draw 1 extra card at turn start
- `navBonus` — Sneak gives bonus resource (resource field: `scrap`/`tech`/`pirate`)
- `junkyardSalvage` — Sneak junkyard mode gives 3 picks instead of default
- `sneakFreeMarket` — Sneak market mode gives 1 extra free pick
- `disablePart` — action: disable an opponent's ship part until their next turn
- `repairCheap` — repair any damaged part for just 1 card (any suit)
- `buildFast` — (unused) would reduce build cost by 1 card
- `defensiveSteal` — engine cards also accepted as Sneak payment
- `defensiveAttack` — weapons cards also accepted as Block payment
- `offensiveSneak` — navigation cards also accepted as Steal payment
- `offensiveBlock` — shield cards also accepted as Attack payment
- `freeSteal` — can use Steal without an Engine ship part (tableau or hand discard)
- `freeAttack` — can use Attack without a Weapons ship part
- `freeSneak` — can use Sneak without a Navigation ship part
- `freeBlock` — can use Block without a Shield ship part

---

### Pirate Cards (permanent ship parts bought with 👾)

Each pirate card has:
- **Upside**: a bonus effect active while enabled, tied to one suit
- **Downside**: a penalty always active (revealed when bought), tied to no suit
- **Disabled state**: both upside and downside suspended; repair for 2 👾

Undamaged (enabled) pirate cards count toward the **3-part win condition**. Disabled pirate cards do not count.

---

### Build & Repair Rules (from `config.rules`)

```js
{ startingHandSize:4, handSizeLimit:5,
  shipPartsToWin:3,
  buildSameSuitCount:3,    // 3 same-suit tableau cards → build part (same-suit only)
  passScrap:2, passTech:1,
  repairSameSuitCount:2,   // 2 same-suit hand cards → repair damaged part
  repairAnySuitCount:3,    // 3 any-suit hand cards → repair damaged part
                           // repairCheap effect (Rice Cooker) allows 1 any-suit card instead
  sellTokens:2,            // pirate tokens gained from selling cards
  sellBonusTokens:3,       // pirate tokens when sellBonus effect is active
  PIRATE_ATTACK_COST:2,    // pirate tokens to launch a Pirate Attack
}
```

---

### Junkyard

Fully visible sidebar showing all discarded cards. Cards enter the junkyard when: sold, attacked (tableau destroyed), ability cards used for Steal/Attack/Sneak/Block, used in Repair, end-of-turn discards, or Pirate Attack Targeted Strike. Cards used to **build** go to each player's personal **used-cards pile** (`usedCards[]`) and are never reshuffled.

When the deck runs out, 50% of junkyard cards are randomly reshuffled back into the deck.

---

### Hand & Tableau Limits

- **Hand limit**: 5 cards (end-of-turn discard to junkyard if over limit; penalty effects can reduce it)
- **Deploy action**: max 2 cards played to tableau per turn
- Tableau has no size limit; cards stay until used to build, stolen, attacked, or used as ability activation
