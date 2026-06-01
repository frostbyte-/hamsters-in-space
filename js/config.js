"use strict";

// Card structure:
//   symbols: { scrap:N } or { tech:N } — production when in tableau
//   cost:    { scrap:N } or { tech:N } or both — buy cost (mixed allowed for wild/neutral cards)
//   power:   { type, effect, value, resource?, text }
//     type 'upgrade'  — active when card is built into a ship part (all existing suit cards)
//     type 'tableau'  — passive, active while card sits in your tableau (neutral/wild cards)

const DEFAULT_CARDS = [
  // ── ENGINE ────────────────────────────────────────────────────────────────
  { id:"ENG01", title:"Toaster",          suit:"engine",     symbols:{scrap:2},  cost:{scrap:1},  description:"If it's stupid but it works..",       quantity:1 },
  { id:"ENG02", title:"Hamster Wheel",    suit:"engine",     symbols:{scrap:2},  cost:{scrap:1},  description:"Perpetual motion machine. Sort of.",  quantity:1 },
  { id:"ENG03", title:"Small Battery",          suit:"engine",     symbols:{tech:1},   cost:{scrap:2},  description:"It's rechargeable.",                  quantity:1 },
  { id:"ENG04", title:"Pirate Monkey",    suit:"engine",     symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:1}, description:"Is that a banana? Not anymore.",                   quantity:1, iconText:"⚡ ➡ +1👾",
    power:{ effect:"pirateOnSteal", value:1, text:"Potassium Gainz: Gain +1 👾 on successful Steal" } },
  { id:"ENG05", title:"Broomstick",       suit:"engine",     symbols:{scrap:2,tech:1}, cost:{scrap:3}, description:"'Clean' energy.",                     quantity:1, iconText:"🔄 ➡ +1👾",
    power:{ effect:"tokenPerTurn", value:1, text:"Witch Power: Gain +1 👾 at the start of your turn" } },
  { id:"ENG06", title:"Big Magnet",       suit:"engine",     symbols:{scrap:1,tech:1}, cost:{scrap:2,tech:1}, description:"It's really big.",                    quantity:1, iconText:"🔄 ➡ +2⚙️",
    power:{ effect:"turnStartResource", resource:"scrap", value:2, text:"Magnetic Pull: Gain +2 ⚙️ at the start of your turn" } },
  { id:"ENG07", title:"Fusion Core",      suit:"engine",     symbols:{scrap:2,tech:1,pirate:1}, cost:{scrap:2,tech:2}, description:"Gets a bit too much actually.",    quantity:1, iconText:"🔄 ➡ +1🧵",
    power:{ effect:"turnStartResource", resource:"tech", value:1, text:"Nuclear Byproduct: Gain +1 🧵 at the start of your turn" } },

  // ── WEAPONS ───────────────────────────────────────────────────────────────
  { id:"WPN01", title:"Butter Knife",       suit:"weapons",    symbols:{scrap:2},  cost:{scrap:1},  description:"Cuts through butter like butter.",    quantity:1 },
  { id:"WPN02", title:"Cheese Revolver",    suit:"weapons",    symbols:{scrap:2},  cost:{scrap:1},  description:"Fires aged gouda.",                   quantity:1 },
  { id:"WPN03", title:"Laser Pointer",      suit:"weapons",    symbols:{tech:1},   cost:{scrap:2},  description:"Must. Engage. Enemy.",                quantity:1 },
  { id:"WPN04", title:"Broccoli Launcher",  suit:"weapons",    symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:1}, description:"Eat your greens, Carl!",              quantity:1, iconText:"💥 ➡ +1🃏",
    power:{ effect:"drawOnAttack", value:1, text:"Antioxidants: Draw +1 🃏 on successful Attack" } },
  { id:"WPN05", title:"Plasma Katana",      suit:"weapons",    symbols:{scrap:2,tech:1}, cost:{scrap:3}, description:"Samurais hate this one trick!",       quantity:1, iconText:"🏗️ ➡ +1👾",
    power:{ effect:"pirateTokenOnBuild", value:1, text:"Bushido: Gain +1 👾 each time you build a ship part" } },
  { id:"WPN06", title:"Implosion Grenade",  suit:"weapons",    symbols:{scrap:1,tech:1}, cost:{scrap:2,tech:1}, description:"It implodes, so it must be better.",  quantity:1, iconText:"💥 ➡ +1🧵",
    power:{ effect:"attackLoot", value:1, text:"Gravitational Pull: Gain +1 🧵 on successful attack" } },
  { id:"WPN07", title:"Magician's Hat",     suit:"weapons",    symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:2}, description:"Abraca-what's that?",                 quantity:1, iconText:"🔄 ➡ +1🃏",
    power:{ effect:"extraDraw", value:1, text:"Overclock: Draw +1 🃏 at the start of your turn" } },

  // ── NAVIGATION ────────────────────────────────────────────────────────────
  { id:"NAV01", title:"Star Chart",         suit:"navigation", symbols:{scrap:2},  cost:{scrap:1},  description:"Pretty sure that's not the Little Dipper.", quantity:1 },
  { id:"NAV02", title:"Broken Compass",     suit:"navigation", symbols:{scrap:2},  cost:{scrap:1},  description:"A broken compass is right twice a day.", quantity:1 },
  { id:"NAV03", title:"Marcus the Dog",     suit:"navigation", symbols:{tech:1},   cost:{scrap:2},  description:"Who let the dogs out?",               quantity:1 },
  { id:"NAV04", title:"Abacus",             suit:"navigation", symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:1}, description:"Quick maths.",                        quantity:1, iconText:"🧭 ➡ +2⚙️",
    power:{ effect:"navBonus", resource:"scrap",  value:2, text:"Cosmic Beads: Sneak also gives you +2 ⚙️" } },
  { id:"NAV05", title:"Calculator",         suit:"navigation", symbols:{scrap:2,tech:1}, cost:{scrap:3}, description:"Quicker maths.",                      quantity:1, iconText:"🧭 ➡ +1🧵",
    power:{ effect:"navBonus", resource:"pirate", value:1, text:"Quant: Sneak also gives you +1 👾" } },
  { id:"NAV06", title:"Ham-Scan",           suit:"navigation", symbols:{scrap:1,tech:1}, cost:{scrap:2,tech:1}, description:"It can scan everything.",             quantity:1, iconText:"🧭 ➡ +1👾",
    power:{ effect:"navBonus", resource:"tech",   value:1, text:"A- Student: Sneak also gives you +1 🧵" } },
  { id:"NAV07", title:"H.P.S.",           suit:"navigation", symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:2}, description:"Hamster Positioning System.",         quantity:1, iconText:"🗑️ ➡ +1🃏?",
    power:{ effect:"junkyardSalvage", value:1, text:"Homonculus: Junkyard Shop reveals +1 🃏 to browse" } },

  // ── SHIELD ────────────────────────────────────────────────────────────────
  { id:"SHD01", title:"Colander",           suit:"shield",     symbols:{scrap:2},  cost:{scrap:1},  description:"Works most of the time.",             quantity:1 },
  { id:"SHD02", title:"Titan Armor",        suit:"shield",     symbols:{scrap:2},  cost:{scrap:1},  description:"Comes in hamster size too.",           quantity:1 },
  { id:"SHD03", title:"Riot Shield",        suit:"shield",     symbols:{tech:1},   cost:{scrap:2},  description:"Blocks up to ten hamsters.",           quantity:1 },
  { id:"SHD04", title:"Shiny Mirror",       suit:"shield",     symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:1}, description:"Right back at ya!",              quantity:1, iconText:"🛡️ ➡ +1🃏",
    power:{ effect:"drawOnBlock", value:1, text:"Glare: Draw +1 🃏 on successful Block" } },
  { id:"SHD05", title:"Phase Barrier",      suit:"shield",     symbols:{scrap:2,tech:1}, cost:{scrap:3}, description:"Made with CryptoNight.",              quantity:1, iconText:"🛡️ ➡ +1👾",
    power:{ effect:"pirateTokenOnBlock", value:1, text:"Bounty Hunter: Gain +1 👾 on successful Block" } },
  { id:"SHD06", title:"Pandora's Box",      suit:"shield",     symbols:{scrap:1,tech:1}, cost:{scrap:2,tech:1}, description:"Open Sesame?",                        quantity:1, iconText:"💰 ➡ +1👾",
    power:{ effect:"sellBonus", value:1, text:"Hidden Compartment: Trade now gives +1 👾" } },
  { id:"SHD07", title:"Nanobot Swarm",      suit:"shield",     symbols:{scrap:2,pirate:1}, cost:{scrap:2,tech:2}, description:"Like picobots, but bigger.",          quantity:1, iconText:"🛡️ vs⚡ ➡ +1👾",
    power:{ effect:"blockStealBack", value:1, text:"Counter Theft: Blocking a Steal gives 1 👾 from attacker" } },

  // ── ENGINE (extra) ────────────────────────────────────────────────────────
  { id:"ENG08", title:"TH0R-9",           suit:"engine",     symbols:{scrap:1,tech:1}, cost:{scrap:1,tech:2}, description:"Made by Lowkey Industries.",          quantity:1, iconText:"🧭 ➡ ⚡",
    power:{ effect:"offensiveSneak",  value:1, text:"Dual Use: Your Navigation cards can be used to Steal" } },

  // ── WEAPONS (extra) ───────────────────────────────────────────────────────
  { id:"WPN08", title:"The Zapper",       suit:"weapons",    symbols:{scrap:1,tech:1}, cost:{scrap:1,tech:2}, description:"Zzap!",                              quantity:1, iconText:"🛡️ ➡ 💥",
    power:{ effect:"offensiveBlock",  value:1, text:"Dual Use: Your Shield cards can be used to Attack" } },

  // ── NAVIGATION (extra) ────────────────────────────────────────────────────
  { id:"NAV08", title:"Rubik's Cube",     suit:"navigation", symbols:{scrap:1,tech:1}, cost:{scrap:1,tech:2}, description:"Even a blind man could solve this.",  quantity:1, iconText:"⚡ ➡ 🧭",
    power:{ effect:"defensiveSteal",  value:1, text:"Dual Use: Your Engine cards can be used to Sneak" } },

  // ── SHIELD (extra) ────────────────────────────────────────────────────────
  { id:"SHD08", title:"Laser Wall",       suit:"shield",     symbols:{scrap:1,tech:1}, cost:{scrap:1,tech:2}, description:"Sliced n' diced.",                    quantity:1, iconText:"💥 ➡ 🛡️",
    power:{ effect:"defensiveAttack", value:1, text:"Dual Use: Your Weapon cards can be used to Block" } },

  // ── NEUTRAL ───────────────────────────────────────────────────────────────
  { id:"NTL01", title:"Giant Frisbee",     suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"Physics.",                             quantity:1, iconText:"★🛡️",
    power:{ type:"instant", effect:"freeBlock",     value:1, text:"Discard to Block once (even without Shield)" } },
  { id:"NTL02", title:"B.U.N.N.Y.",        suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"There's a lot more where that came from.", quantity:1, iconText:"★💥",
    power:{ type:"instant", effect:"freeAttack",    value:1, text:"Discard to Attack once (even without Weapon)" } },
  { id:"NTL03", title:"Cute Drone",        suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"Look at those puppy dog eyes!",        quantity:1, iconText:"★⚡",
    power:{ type:"instant", effect:"freeSteal",     value:1, text:"Discard to Steal once (even without Engine)" } },
  { id:"NTL04", title:"K-ML",             suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"No one's gonna suspect a camel.",      quantity:1, iconText:"★🧭",
    power:{ type:"instant", effect:"freeSneak",     value:1, text:"Discard to Sneak once (even without Navigation)" } },
  { id:"NTL05", title:"Ham Radio",         suit:"neutral",    symbols:{scrap:1},  cost:{scrap:2},        description:"Picks up pirate broadcasts too.",      quantity:1, iconText:"🖐? ➡ 2🗑️",
    power:{ type:"tableau", effect:"mayday",        value:1, text:"Mayday: At the start of your turn, draw 2 cards from Junkyard if your hand is empty" } },
  { id:"NTL06", title:"Balsamic Vinegar",  suit:"neutral",    symbols:{scrap:1,tech:1,pirate:1}, cost:{tech:1}, description:"Serve generously for best results.",   quantity:1, iconText:"⚠️🚀",
    power:{ type:"instant", effect:"disablePart",   value:1, text:"Anti-Glycemic: Play from hand — disable one of an opponent's ship parts until their next turn." } },
  { id:"NTL07", title:"Rice Cooker",       suit:"neutral",    symbols:{scrap:1},  cost:{scrap:3,tech:1}, description:"Fluffs up the bumpy parts.",           quantity:1, iconText:"🔧 = 🆓",
    power:{ type:"tableau", effect:"repairCheap",   value:1, text:"Quick-Fix: Repair is now free of cost" } },
  { id:"NTL08", title:"Cash Register",     suit:"neutral",    symbols:{tech:1},   cost:{tech:2},         description:"Ka-ching!",                            quantity:1, iconText:"💰 ➡ +1👾",
    power:{ type:"tableau", effect:"sellBonus",     value:1, text:"Skim Profits: Trade now gives +1 👾" } },

  // ── WILDCARD ──────────────────────────────────────────────────────────────
  { id:"WLD01", title:"Rainbow Drive",        suit:"wild", symbols:{scrap:1, pirate:1}, cost:{scrap:2, tech:1}, description:"Stores up to 1024 HB.", quantity:1, iconText:"🌈" },
  { id:"WLD02", title:"Prism",                suit:"wild", symbols:{scrap:1,tech:1},    cost:{scrap:2, tech:1}, description:"Dark side of *some* moon.", quantity:1, iconText:"🌈" },
  { id:"WLD03", title:"Translucent Watch",    suit:"wild", symbols:{scrap:1, pirate:1}, cost:{scrap:2, tech:1}, description:"You know what time it is.", quantity:1, iconText:"🌈" },
  { id:"WLD04", title:"Pizza",                suit:"wild", symbols:{scrap:1,tech:1},    cost:{scrap:2, tech:1}, description:"Planet-eroni with extra cheese.", quantity:1, iconText:"🌈" },
];

// ── PIRATE MARKET: FACE-UP UPSIDES (16 cards, 4 per suit) ────────────────────
const DEFAULT_PIRATE_UPSIDES = [
  // ENGINE
  { id:"PIRUP_ENG1", suit:"engine",     title:"Lemon",          pirateTokenCost:3, bonusEffect:"harvest",      bonusValue:1, bonusDesc:"Harvest: Whenever any player builds a ship part, you gain 1 pirate token" },
  { id:"PIRUP_ENG2", suit:"engine",     title:"Robovac 2000",   pirateTokenCost:4, bonusEffect:"reflex",       bonusValue:1, bonusDesc:"Reflex: Whenever any card you own is destroyed by an opponent's Attack, draw a replacement" },
  { id:"PIRUP_ENG3", suit:"engine",     title:"Power Bank",     pirateTokenCost:4, bonusEffect:"sabotage",     bonusValue:1, bonusDesc:"Sabotage: Once per turn, spend 1 pirate token to move any market card to the junkyard" },
  { id:"PIRUP_ENG4", suit:"engine",     title:"Cargo Pants",    pirateTokenCost:4, bonusEffect:"scavenger",    bonusValue:1, bonusDesc:"Scavenger: When any card is destroyed by any Attack, you may take it by paying 1 pirate token" },

  // WEAPONS
  { id:"PIRUP_WPN1", suit:"weapons",    title:"Electric Guitar", pirateTokenCost:4, bonusEffect:"doubleBarrel", bonusValue:1, bonusDesc:"Double-Barrel: Your Attack destroys 2 tableau cards simultaneously instead of 1" },
  { id:"PIRUP_WPN2", suit:"weapons",    title:"Candlestick",    pirateTokenCost:4, bonusEffect:"pillage",      bonusValue:1, bonusDesc:"Pillage: When you destroy a tableau card via Attack, gain resources equal to that card's symbol value" },
  { id:"PIRUP_WPN3", suit:"weapons",    title:"Gold Monocle",   pirateTokenCost:4, bonusEffect:"taxCollector", bonusValue:1, bonusDesc:"Tax Collector: Whenever any opponent trades cards, you gain 1 pirate token" },
  { id:"PIRUP_WPN4", suit:"weapons",    title:"Smelly Sock",    pirateTokenCost:4, bonusEffect:"corsair",      bonusValue:1, bonusDesc:"Corsair: Your Raid hits all opponents simultaneously if you pay 1 extra pirate token" },

  // NAVIGATION
  { id:"PIRUP_NAV1", suit:"navigation", title:"Coffee Machine", pirateTokenCost:4, bonusEffect:"echo",         bonusValue:1, bonusDesc:"Echo: The first tableau card you play each turn produces its symbols twice" },
  { id:"PIRUP_NAV2", suit:"navigation", title:"Weird Statue",   pirateTokenCost:3, bonusEffect:"bribe",        bonusValue:1, bonusDesc:"Bribe: When targeted by an Attack/Raid, spend 2 👾 to redirect to another player" },
  { id:"PIRUP_NAV3", suit:"navigation", title:"Old Telephone",  pirateTokenCost:4, bonusEffect:"liquidator",   bonusValue:1, bonusDesc:"Liquidator: When you trade, trade any number of cards at once and gain 1 pirate token per card" },
  { id:"PIRUP_NAV4", suit:"navigation", title:"A.E.G.I.S.",     pirateTokenCost:5, bonusEffect:"buildFast",    bonusValue:1, bonusDesc:"Robotics: Ship parts can be upgraded using 2 deployed cards instead of 3" },

  // SHIELD
  { id:"PIRUP_SHD1", suit:"shield",     title:"Beard Oil",      pirateTokenCost:4, bonusEffect:"doubleAgent",  bonusValue:1, bonusDesc:"Double Agent: When buying a pirate part, you may give the downside to an opponent instead" },
  { id:"PIRUP_SHD2", suit:"shield",     title:"Ouija Board",    pirateTokenCost:4, bonusEffect:"secondChance", bonusValue:1, bonusDesc:"Second Chance: Once per game, after resolving an ability, you may immediately use a second different ability" },
  { id:"PIRUP_SHD3", suit:"shield",     title:"Sunscreen",      pirateTokenCost:3, bonusEffect:"insurance",    bonusValue:1, bonusDesc:"Insurance: When one of your ship parts is damaged, draw a card" },
  { id:"PIRUP_SHD4", suit:"shield",     title:"Moonscreen",     pirateTokenCost:4, bonusEffect:"encore",       bonusValue:1, bonusDesc:"Encore: When you successfully Steal or Attack, your activation card returns to your hand" },
];

// ── PIRATE MARKET: FACE-DOWN DOWNSIDES (12 cards) ────────────────────────────
const DEFAULT_PIRATE_DOWNSIDES = [
  { id:"PIRDOWN01", downsideEffect:"scrapPremium",        downsideValue:1,  downsideDesc:"Cards that cost ⚙️ now cost +1 extra" },
  { id:"PIRDOWN02", downsideEffect:"techPremium",         downsideValue:1,  downsideDesc:"Cards that cost 🧵 now cost +1 extra" },
  { id:"PIRDOWN03", downsideEffect:"handLimitMod",        downsideValue:-2, downsideDesc:"Hand size limit −2" },
  { id:"PIRDOWN04", downsideEffect:"tokenPremium",        downsideValue:1,  downsideDesc:"Cards that cost 👾 now cost +1 extra" },
  { id:"PIRDOWN05", downsideEffect:"sellPenalty",         downsideValue:1,  downsideDesc:"Gain 1 fewer 👾 when you Trade" },
  { id:"PIRDOWN06", downsideEffect:"partMalfunction",     downsideValue:1,  downsideDesc:"Disable one of your other parts until the start of your next turn" },
  { id:"PIRDOWN07", downsideEffect:"opponentLottery",     downsideValue:1,  downsideDesc:"All opponents get +2 ⚙️, +1 🧵 and +1 👾 immediately" },
  { id:"PIRDOWN08", downsideEffect:"noJunkyardPick",      downsideValue:1,  downsideDesc:"Cannot pick from the junkyard for the rest of the game" },
  { id:"PIRDOWN09", downsideEffect:"stealAttackReward",   downsideValue:3,  downsideDesc:"The first opponent to successfully Steal or Attack you gains 3 👾" },
  { id:"PIRDOWN10", downsideEffect:"repairPenalty",       downsideValue:1,  downsideDesc:"Your next repair costs 1 extra card (any suit)" },
  { id:"PIRDOWN11", downsideEffect:"buildGiftDraw",       downsideValue:1,  downsideDesc:"The next time you build a Ship Part, all opponents draw 1 free card" },
  { id:"PIRDOWN12", downsideEffect:"marketBlock",         downsideValue:1,  downsideDesc:"You may not buy from the Market this turn (only Junkyard)" },
];


const DEFAULT_RULES = {
  startingHandSize: 4,
  handSizeLimit: 5,
  shipPartsToWin: 3,
  buildSameSuitCount: 3,    // cards of same suit needed in tableau to build
  passScrap: 2,             // scrap gained from skipping (choose scrap option)
  passTech: 1,              // tech gained from skipping (choose tech option)
  repairSameSuitCount: 1,   // same-suit hand cards needed to repair a damaged ship part (buy phase)
  repairAnySuitCount: 2,    // any-suit hand cards needed to repair a damaged ship part (buy phase)
  sellTokens: 1,            // pirate tokens gained from selling 1 card (each sellBonus effect adds +1)
  // Starting scrap by player position (index 0 = first player)
  startingScrapByPosition: [1, 2, 3, 4],
};

const config = {
  cards: DEFAULT_CARDS.map(c => ({...c, symbols:{...c.symbols}, cost:{...c.cost}, power:c.power?{...c.power}:null})),
  pirateUpsides: DEFAULT_PIRATE_UPSIDES.map(c => ({...c})),
  pirateDownsides: DEFAULT_PIRATE_DOWNSIDES.map(c => ({...c})),
  rules: {...DEFAULT_RULES},
};

function loadCardsCSV(_text) { flash("Card CSV format changed — custom cards not supported in this version"); }
function loadPromptsCSV(_text) {}

function loadRulesJSON(text) {
  const json = JSON.parse(text);
  const keys = ['startingHandSize', 'shipPartsToWin', 'buildSameSuitCount', 'passScrap', 'passTech', 'repairSameSuitCount', 'repairAnySuitCount'];
  for (const k of keys) {
    if (typeof json[k] === 'number') config.rules[k] = json[k];
  }
}
