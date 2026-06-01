## Hamsters in Space

**Project**: Browser-based card game (Plain HTML + vanilla JS). You've crash-landed on a strange planet and must rebuild your spaceship before the space pirates capture you and make you run in a space-wheel forever.

Files: `prototype.html`, `js/config.js`, `js/game.js`, `js/render.js`, `js/helpers.js`, `js/art.js`, `js/main.js`, `styles/main.css`. Cache-busted with `?v=119` on all script/CSS links. Preview server runs on port `3457`.

---

### Turn Structure

Each turn has two sequential phases:

#### 1. Action Phase (2 actions)

The active player takes **any 2 actions** in any order (repeats allowed). Each action spends 1 slot; when both are spent the turn automatically advances to Resupply.

**Available actions:**

- **🃏 Deploy** — play 1 card from hand to tableau; resources (⚙️/🧵/👾) commit immediately. First card each turn gets doubled symbols with Coffee Machine (echo). Cards played this turn can be unplayed (reverses resources, restores action slot).
- **⚡ Steal** — discard an Engine card (or wild) from hand → pick target player → pick the exact tableau card to steal → defender may Block or Accept
- **💥 Attack** — discard a Weapons card (or wild) → pick target → pick exact tableau card to destroy, or destroy a pirate token, or damage a ship/pirate part → defender may Block or Accept
- **🧭 Sneak** — discard a Navigation card (or wild) → choose: **Take from Market** (up to 2 free cards, market refills immediately after each pick) OR **Search Junkyard** (3 random cards shown, keep up to 2). Cards go to hand; use remaining actions to deploy normally.
- **🛡️ Build** — click ▶ Build on the upgrade panel (requires 3 same-suit tableau cards, or 2 with A.E.G.I.S.) → pay 1 hand card (any suit) as build cost → choose power → ship part completed. 1 tableau card becomes the upgrade (goes to usedCards), the others + the hand card go to junkyard.
- **🔧 Repair** — restore a damaged or disabled ship/pirate part. Cost: 1 same-suit card from hand or tableau. If repair penalty is active: 1 same-suit card + 1 any-suit card (both from hand or tableau). Free with Rice Cooker.
- **⚙️ Salvage** — choose: +2 ⚙️ Scrap OR +1 🧵 Tech
- **👾 Sell** — select 1 card from hand or tableau → send to junkyard → gain 1 👾. Liquidator: sell any number at once, 1 👾 per card.
- **🏴‍☠️ Raid** (2 👾) — pick target → pick a suit column → target must discard 1 card of that suit from their tableau to junkyard. No block option.
- **🗑️ Sabotage** (1 👾, Power Bank only) — click a market card to send it to the junkyard
- **🫙 Disable Part** — (Balsamic Vinegar in tableau) target an opponent's undamaged ship part; it's disabled until their next turn start
- **🃏 Buy Pirate Card** — buy a card from the Pirate Market for 👾 cost (uses 1 action slot)

**NTL01–04 free-action activation**: Cards with a free ability (Giant Frisbee/BFG/Cute Drone/K-ML) can be **▶ Played** to tableau for resources, OR **⚡ Activated** by discarding from hand — NTL02/03/04 start Attack/Steal/Sneak without needing a ship part (costs 1 action slot); NTL01 (Giant Frisbee) can be discarded by the *defender* during an incoming attack to enable Block.

**✓ Done → Resupply**: player can skip remaining actions early at any time.

#### 2. Resupply Phase

- Spend ⚙️/🧵 to buy **up to 2 cards** from the card market; purchased slots refill immediately
- **🗑️ Junk Shop** (2 👾, mutually exclusive with market buys): view 3 random junkyard cards, take up to 2. Cancelling refunds the 2 👾.
- Click **✓ Done (end turn)** to pass to the next player

**Win condition**: be the first player to have **3 active ship parts**. Both undamaged regular ship parts and undamaged pirate parts count.

---

### Resource System

- **⚙️ Scrap** and **🧵 Tech** are stored as integers on each player (`p.scrap`, `p.tech`)
- Resources accumulate permanently — they do NOT reset between turns
- Playing a card to tableau grants its resources immediately; unplaying it reverses them
- Spending happens in Resupply Phase

---

### Suit Abilities

| Suit | Icon | Ability | Activation cost |
|------|------|---------|-----------------|
| Engine | ⚡ | **Steal** a specific tableau card from an opponent | Discard engine/wild card from hand |
| Weapons | 💥 | **Attack** — destroy a specific card, token, or damage a part | Discard weapons/wild card from hand |
| Navigation | 🧭 | **Sneak** — take free cards from market or junkyard | Discard nav/wild card from hand |
| Shield | 🛡️ | **Block** a steal or attack (defender only, reactive) | Discard shield/wild card from hand |

Wild cards (🌈) count for any suit activation. Ability buttons are enabled whenever you hold a matching or wild card and have the ship part built.

---

### Steal / Attack Defender Flow

- **Attacker picks the exact card** to steal/destroy from the defender's tableau (no suit guessing)
- **Defender's response**: Block (discard shield/wild or use NTL01) or Accept
- **Hand-targeted steal/attack**: attacker picks "steal from hand" / "attack hand card" — defender then picks which card to give up
- **Ship/pirate part attack**: defender Blocks or accepts damage; no card sacrifice
- **Raid**: no block option — defender picks which card of the chosen suit to discard

---

### Build Flow

1. Click **▶ Build** next to a suit in the Upgrade Options panel (requires enough same-suit tableau cards)
2. Click **💸 Pay** on any hand card (the build cost; goes to junkyard)
3. If >3 same-suit tableau cards: select exactly 3 to spend
4. If any card has an upgrade power: choose which power to embed (or none)
5. Ship part is created; 1 tableau card → usedCards, rest → junkyard

---

### Icons

| Symbol | Meaning |
|--------|---------|
| ⚡ | Engine suit |
| 💥 | Weapons suit |
| 🧭 | Navigation suit |
| 🛡️ | Shield suit |
| 🌈 | Wild card (any suit) |
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
  pirateCards:[{upside, downside, damaged?}] }
```

**Game state** (global `game`):
```js
{ players:[], currentPlayerIndex:0,
  deck:[], cardMarket:[5 slots],
  junkyard:[{type:'card', card},...],
  removed:[],            // destroyed cards (removed from game)
  pirateMarket:[4 slots], pirateDeck:[], log:[] }
```

**Turn phase** (module-level):
```js
currentPhase: 'action' | 'buy'
actionsRemaining: 0 | 1 | 2   // decremented by spendAction(); 0 auto-advances to buy
```

**Key pending states** (module-level globals):
```js
pendingSteal, pendingAttack, pendingDefenderChoice,
pendingJunkyardPick, pendingJunkyardShop,
pendingSneakChoice,      // { mode:null|'market', activationCard, marketPicksRemaining? }
pendingSneakJunkyard,    // { offeredCards:[...], selectedIds:[], activationCard }
pendingBuyPhase, pendingRepair, pendingCallForAid, pendingDiscard,
pendingAbilityPick,      // { mode, candidates, targetIdx? }
pendingBuildSelect,      // { suit, needed, suitCards, selectedIds, handCardId }
pendingBuildPowerChoice, // { suit, cardIds, cards, powerCardInstanceId, handCardId }
pendingBuildHandCost,    // { suit } — waiting for inline Pay click on a hand card
pendingSalvageChoice,    // boolean — showing +2 Scrap / +1 Tech choice
sellMode, sellSelection
playedThisTurn           // Set of instanceIds played this turn (for echo bonus + unplay)
```

`anyBlocking()` returns true if any interactive pending state is active — gates most actions.
`requireActionPhase()` — guard used by all action starters; also blocks if `anyBlocking()` or `actionsRemaining <= 0`.

---

### Cards

Card definitions in `config.js` across 4 suits (engine/weapons/navigation/shield) plus neutral. Each card has:
```js
{ id, title, suit, description, quantity,
  symbols: { scrap:N, tech:N },   // resources gained when played to tableau
  cost:    { scrap:N, tech:N },   // cost to buy from market
  power?:  { type, effect, value, resource?, text } }
```

Power types:
- `'upgrade'` — embedded in ship part at build time; active while part is undamaged and not disabled
- `'tableau'` — active while the card sits in the player's tableau
- `'instant'` — activated by discarding from hand via `useNeutralFreeAction()`

---

### Pirate Cards (permanent ship parts bought with 👾)

Each pirate card has:
- **Upside**: a bonus effect active while not damaged, tied to one suit (counts toward win condition)
- **Downside**: a penalty always active (revealed on purchase)
- **Damaged state**: both upside and downside suspended; repair with 1 same-suit card (action)

---

### Repair Rules

- **Base cost**: 1 same-suit card from hand or tableau
- **Repair Penalty** (downside active): 1 same-suit card + 1 any-suit card (both from hand or tableau)
- **Rice Cooker** (tableau power): repair is free — no cards needed
- Applies to both regular ship parts (damaged or disabled) and pirate parts (damaged)

---

### Junkyard

Fully visible sidebar showing all discarded cards. Cards enter the junkyard when: sold, destroyed by Attack, used as ability activation cost, used for Repair, or discarded at hand limit. Cards used to **build** go to each player's personal `usedCards[]` pile and are never reshuffled.

When the deck runs out, 50% of junkyard cards are randomly reshuffled back into the deck.

---

### Hand & Deploy Limits

- **Hand limit**: 5 cards (end-of-turn discard to junkyard if over limit; penalty effects can reduce it)
- **Deploy**: each Deploy action plays 1 card to tableau; cards played this turn can be unplayed (returns card to hand, reverses resources, restores the action slot)
- Tableau has no size limit
