"use strict";

// Card structure:
//   symbols: { scrap:N } or { tech:N } — production when in tableau
//   cost:    { scrap:N } or { tech:N } or both — buy cost (mixed allowed for wild/neutral cards)
//   power:   { type, effect, value, resource?, text }
//     type 'upgrade'  — active when card is built into a ship part (all existing suit cards)
//     type 'tableau'  — passive, active while card sits in your tableau (neutral/wild cards)

const DEFAULT_CARDS = [
  // ── ENGINE ────────────────────────────────────────────────────────────────
  { id:"ENG01", title:"Toaster",          suit:"engine",     symbols:{scrap:2},  cost:{scrap:1},  description:"If it's stupid but it works..",       quantity:1, iconText:"+2⚙️" },
  { id:"ENG02", title:"Hamster Wheel",    suit:"engine",     symbols:{scrap:3},  cost:{scrap:1},  description:"Perpetual motion machine.",           quantity:1, iconText:"+3⚙️" },
  { id:"ENG03", title:"Vacuum Cleaner",   suit:"engine",     symbols:{tech:1},   cost:{scrap:2},  description:"It's a Dyson.",                       quantity:1, iconText:"+1🧵" },
  { id:"ENG04", title:"Pirate Monkey",    suit:"engine",     symbols:{scrap:1,tech:1}, cost:{scrap:3},  description:"Is that a banana? Not anymore.",                   quantity:1, iconText:"⚡ ➡ +1👾",
    power:{ effect:"pirateOnSteal", value:1, text:"Potassium Gainz: Gain +1 👾 on successful Steal" } },
  { id:"ENG05", title:"Broomstick",       suit:"engine",     symbols:{tech:2},   cost:{scrap:3},  description:"Precision reactor core.",             quantity:1, iconText:"🔄 ➡ +1👾",
    power:{ effect:"tokenPerTurn", value:1, text:"Witch Power: Gain +1 👾 at the start of your turn" } },
  { id:"ENG06", title:"Big Magnet",       suit:"engine",     symbols:{scrap:1,tech:1}, cost:{tech:1},   description:"It's really big.",                    quantity:1, iconText:"🔄 ➡ +2⚙️",
    power:{ effect:"turnStartResource", resource:"scrap", value:2, text:"Magnetic Pull: Gain +2 ⚙️ at the start of your turn" } },
  { id:"ENG07", title:"Fusion Core",      suit:"engine",     symbols:{tech:1},   cost:{tech:2},   description:"A perpetual motion machine!",         quantity:1, iconText:"🔄 ➡ +1🧵",
    power:{ effect:"turnStartResource", resource:"tech", value:1, text:"Nuclear Byproduct: Gain +1 🧵 at the start of your turn" } },

  // ── WEAPONS ───────────────────────────────────────────────────────────────
  { id:"WPN01", title:"Butter Knife",       suit:"weapons",    symbols:{scrap:2},  cost:{scrap:1},  description:"Cuts through butter like butter.",    quantity:1, iconText:"+2⚙️" },
  { id:"WPN02", title:"Cheese Revolver",    suit:"weapons",    symbols:{scrap:3},  cost:{scrap:1},  description:"Fires aged gouda.",                   quantity:1, iconText:"+3⚙️" },
  { id:"WPN03", title:"Laser Pointer",      suit:"weapons",    symbols:{tech:1},   cost:{scrap:2},  description:"Must. Engage. Enemy.",                quantity:1, iconText:"+1🧵" },
  { id:"WPN04", title:"Broccoli Launcher",  suit:"weapons",    symbols:{scrap:1,tech:1}, cost:{scrap:3},  description:"Eat your greens, Carl!",              quantity:1, iconText:"💥 ➡ +1🃏",
    power:{ effect:"drawOnAttack", value:1, text:"Antioxidants: Draw +1 🃏 on successful Attack" } },
  { id:"WPN05", title:"Plasma Katana",      suit:"weapons",    symbols:{tech:2},   cost:{scrap:3},  description:"Samurais hate this one trick!",       quantity:1, iconText:"🏗️ ➡ +1👾",
    power:{ effect:"pirateTokenOnBuild", value:1, text:"Bushido: Gain +1 👾 each time you build a ship part" } },
  { id:"WPN06", title:"Gravity Gun",        suit:"weapons",    symbols:{scrap:1,tech:1}, cost:{tech:1},   description:"What cat?",                           quantity:1, iconText:"💥 ➡ +1🧵",
    power:{ effect:"attackLoot", value:1, text:"Gravitational Pull: Gain +1 🧵 on successful attack" } },
  { id:"WPN07", title:"Magician's Hat",     suit:"weapons",    symbols:{tech:1},   cost:{tech:2},   description:"Abraca-what?",                        quantity:1, iconText:"🔄 ➡ +1🃏",
    power:{ effect:"extraDraw", value:1, text:"Overclock: Draw +1 🃏 at the start of your turn" } },

  // ── NAVIGATION ────────────────────────────────────────────────────────────
  { id:"NAV01", title:"Star Chart",         suit:"navigation", symbols:{scrap:2},  cost:{scrap:1},  description:"Pretty sure that's not the Little Dipper.", quantity:1, iconText:"+2⚙️" },
  { id:"NAV02", title:"Broken Compass",     suit:"navigation", symbols:{scrap:3},  cost:{scrap:1},  description:"A broken compass is right twice a day.", quantity:1, iconText:"+3⚙️" },
  { id:"NAV03", title:"Marcus the Dog",     suit:"navigation", symbols:{tech:1},   cost:{scrap:2},  description:"Who let the dogs out?",               quantity:1, iconText:"+1🧵" },
  { id:"NAV04", title:"Abacus",             suit:"navigation", symbols:{scrap:1,tech:1}, cost:{scrap:3},  description:"Quick mafs.",                         quantity:1, iconText:"🧭 ➡ +2⚙️",
    power:{ effect:"navBonus", resource:"scrap",  value:2, text:"Cosmic Beads: Sneak also gives you +2 ⚙️" } },
  { id:"NAV05", title:"Calculator",         suit:"navigation", symbols:{tech:2},   cost:{scrap:3},  description:"Quicker maths.",                      quantity:1, iconText:"🧭 ➡ +1🧵",
    power:{ effect:"navBonus", resource:"pirate", value:1, text:"Quant: Sneak also gives you +1 👾" } },
  { id:"NAV06", title:"Asian Dude",         suit:"navigation", symbols:{scrap:1,tech:1}, cost:{tech:1},   description:"Guy with an abacus and a calculator.", quantity:1, iconText:"🧭 ➡ +1👾",
    power:{ effect:"navBonus", resource:"tech",   value:1, text:"A- Student: Sneak also gives you +1 🧵" } },
  { id:"NAV07", title:"Marauder's Map",     suit:"navigation", symbols:{tech:1},   cost:{tech:2},   description:"I solemnly swear I'm no good.",       quantity:1, iconText:"🗑️ ➡ +1🃏?",
    power:{ effect:"junkyardSalvage", value:1, text:"Homonculus: Junkyard Shop reveals +1 🃏 to browse" } },

  // ── SHIELD ────────────────────────────────────────────────────────────────
  { id:"SHD01", title:"Colander",           suit:"shield",     symbols:{scrap:2},  cost:{scrap:1},  description:"60% of the time, it works every time.", quantity:1, iconText:"+2⚙️" },
  { id:"SHD02", title:"Skin Coat",          suit:"shield",     symbols:{scrap:3},  cost:{scrap:1},  description:"Were you expecting a fur coat? You monster!",      quantity:1, iconText:"+3⚙️" },
  { id:"SHD03", title:"Invisibility Cloak", suit:"shield",     symbols:{tech:1},   cost:{scrap:2},  description:"You're a hamster, Harry.",             quantity:1, iconText:"+1🧵" },
  { id:"SHD04", title:"Shiny Mirror",       suit:"shield",     symbols:{scrap:1,tech:1}, cost:{scrap:3},  description:"Where's my super suit?",              quantity:1, iconText:"🛡️ ➡ +1🃏",
    power:{ effect:"drawOnBlock", value:1, text:"Glare: Draw +1 🃏 on successful Block" } },
  { id:"SHD05", title:"Vibranium Shield",   suit:"shield",     symbols:{tech:2},   cost:{scrap:3},  description:"Stolen from Captain Hamerica.",       quantity:1, iconText:"🛡️ ➡ +1👾",
    power:{ effect:"pirateTokenOnBlock", value:1, text:"Bounty Hunter: Gain +1 👾 on successful Block" } },
  { id:"SHD06", title:"Pandora's Box",      suit:"shield",     symbols:{scrap:1,tech:1}, cost:{tech:1},   description:"Open Sesame?",                        quantity:1, iconText:"💰 ➡ +1👾",
    power:{ effect:"sellBonus", value:1, text:"Hidden Compartment: Sell now gives +1 👾" } },
  { id:"SHD07", title:"Nanobot Swarm",      suit:"shield",     symbols:{tech:1},   cost:{tech:2},   description:"Nanobots, roll out!",                 quantity:1, iconText:"🛡️ vs⚡ ➡ +1👾",
    power:{ effect:"blockStealBack", value:1, text:"Counter Theft: Blocking a Steal gives 1 👾 from attacker" } },

  // ── ENGINE (extra) ────────────────────────────────────────────────────────
  { id:"ENG08", title:"TH0R-9",           suit:"engine",     symbols:{scrap:2,tech:1}, cost:{scrap:1,tech:2}, description:"Made by Loki Industries.",            quantity:1, iconText:"⚡ ➡ 🧭",
    power:{ effect:"defensiveSteal",  value:1, text:"Dual Use: Your Engine cards can be used to Sneak" } },

  // ── WEAPONS (extra) ───────────────────────────────────────────────────────
  { id:"WPN08", title:"Shock Rifle",      suit:"weapons",    symbols:{scrap:2,tech:1}, cost:{scrap:1,tech:2}, description:"And stay down!",                     quantity:1, iconText:"💥 ➡ 🛡️",
    power:{ effect:"defensiveAttack", value:1, text:"Dual Use: Your Weapon cards can be used to Block" } },

  // ── NAVIGATION (extra) ────────────────────────────────────────────────────
  { id:"NAV08", title:"Rubik's Cube",     suit:"navigation", symbols:{scrap:2,tech:1}, cost:{scrap:1,tech:2}, description:"Even a blind man could solve this.",  quantity:1, iconText:"🧭 ➡ ⚡",
    power:{ effect:"offensiveSneak",  value:1, text:"Dual Use: Your Navigation cards can be used to Steal" } },

  // ── SHIELD (extra) ────────────────────────────────────────────────────────
  { id:"SHD08", title:"Laser Wall",       suit:"shield",     symbols:{scrap:2,tech:1}, cost:{scrap:1,tech:2}, description:"Sliced n' diced.",                    quantity:1, iconText:"🛡️ ➡ 💥",
    power:{ effect:"offensiveBlock",  value:1, text:"Dual Use: Your Shield cards can be used to Attack" } },

  // ── NEUTRAL ───────────────────────────────────────────────────────────────
  { id:"NTL01", title:"Giant Frisbee",     suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"Physics.",                             quantity:1, iconText:"★🛡️",
    power:{ type:"instant", effect:"freeBlock",     value:1, text:"Overdrive: Can use Block once without Shield" } },
  { id:"NTL02", title:"The B.F.G.",        suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"Kaboom, baby!",                        quantity:1, iconText:"★💥",
    power:{ type:"instant", effect:"freeAttack",    value:1, text:"Overdrive: Can use Attack once without Weapon" } },
  { id:"NTL03", title:"Cute Drone",        suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"Look at those puppy dog eyes!",        quantity:1, iconText:"★⚡",
    power:{ type:"instant", effect:"freeSteal",     value:1, text:"Overdrive: Can use Steal once without Engine" } },
  { id:"NTL04", title:"K-ML",             suit:"neutral",    symbols:{scrap:2,tech:2}, cost:{scrap:3,tech:1}, description:"No one's gonna suspect a camel.",      quantity:1, iconText:"★🧭",
    power:{ type:"instant", effect:"freeSneak",     value:1, text:"Overdrive: Can use Sneak once without Navigation" } },
  { id:"NTL05", title:"Ham Radio",         suit:"neutral",    symbols:{scrap:1},  cost:{scrap:2},        description:"Picks up pirate broadcasts too.",      quantity:1, iconText:"🔄 ➡ +1👾",
    power:{ type:"tableau", effect:"tokenPerTurn",  value:1, text:"Out-of-Band: Gain +1 👾 at the start of each turn." } },
  { id:"NTL06", title:"Balsamic Vinegar",  suit:"neutral",    symbols:{scrap:1},  cost:{tech:1},         description:"Draws fire. Works great.",             quantity:1, iconText:"⚠️🚀",
    power:{ type:"tableau", effect:"disablePart",   value:1, text:"Anti-Glycemic: Disable a ship part until your next turn" } },
  { id:"NTL07", title:"Rice Cooker",       suit:"neutral",    symbols:{scrap:1},  cost:{scrap:3,tech:1}, description:"Fluffs up the bumpy parts.",           quantity:1, iconText:"🔧 = 🆓",
    power:{ type:"tableau", effect:"repairCheap",   value:1, text:"Quick-Fix: Repair is now free of cost" } },
  { id:"NTL08", title:"Cash Register",     suit:"neutral",    symbols:{tech:1},   cost:{tech:2},         description:"Ka-ching!",                            quantity:1, iconText:"💰 ➡ +1👾",
    power:{ type:"tableau", effect:"sellBonus",     value:1, text:"Skim Profits: Sell now gives +1 👾" } },

  // ── WILDCARD ──────────────────────────────────────────────────────────────
  { id:"WLD01", title:"Rainbow Drive",        suit:"wild", symbols:{scrap:2},       cost:{scrap:2, tech:1}, description:"Stores up to 1024 HB.", quantity:1, iconText:"🌈, +2⚙️" },
  { id:"WLD02", title:"Prism",                suit:"wild", symbols:{tech:1},        cost:{scrap:2, tech:1}, description:"Dark side of *some* moon.", quantity:1, iconText:"🌈, +1🧵" },
  { id:"WLD03", title:"Translucent Watch",    suit:"wild", symbols:{scrap:2},       cost:{scrap:2, tech:1}, description:"You know what time it is.", quantity:1, iconText:"🌈, +2⚙️" },
  { id:"WLD04", title:"Pizza",                suit:"wild", symbols:{tech:1},        cost:{scrap:2, tech:1}, description:"Planet-eroni with extra cheese.", quantity:1, iconText:"🌈, +1🧵" },
];

// ── PIRATE MARKET: FACE-UP UPSIDES (16 cards, 4 per suit) ────────────────────
const DEFAULT_PIRATE_UPSIDES = [
  // ENGINE
  { id:"PIRUP_ENG1", suit:"engine",     title:"Lemon",         pirateTokenCost:3, bonusEffect:"turnStartResource", bonusValue:1, bonusResource:"scrap", bonusDesc:"Gain +1 ⚙️ at the start of each turn", iconText:"🔄 ➡ +1⚙️" },
  { id:"PIRUP_ENG2", suit:"engine",     title:"Roomba",        pirateTokenCost:4, bonusEffect:"pirateOnSteal",     bonusValue:1, bonusDesc:"Gain +1 👾 on successful Steal", iconText:"⚡ ➡ +1👾" },
  { id:"PIRUP_ENG3", suit:"engine",     title:"Power Bank",    pirateTokenCost:4, bonusEffect:"tokenPerTurn",      bonusValue:1, bonusDesc:"Gain +1 👾 at start of each turn", iconText:"🔄 ➡ +1👾" },
  { id:"PIRUP_ENG4", suit:"engine",     title:"Cargo Pants",   pirateTokenCost:3, bonusEffect:"handLimitUp",       bonusValue:2, bonusDesc:"Hand size limit +2", iconText:"✋+2" },

  // WEAPONS
  { id:"PIRUP_WPN1", suit:"weapons",    title:"Electric Guitar", pirateTokenCost:3, bonusEffect:"pirateTokenOnAttack", bonusValue:1, bonusDesc:"Gain +1 👾 when you successfully Attack", iconText:"💥 ➡ +1👾" },
  { id:"PIRUP_WPN2", suit:"weapons",    title:"Candlestick",   pirateTokenCost:4, bonusEffect:"attackToken",       bonusValue:1, bonusDesc:"Opponents lose 1 👾 on a successfully Attack", iconText:"💥 ➡ 👤-1👾" },
  { id:"PIRUP_WPN3", suit:"weapons",    title:"Gold Monocle",  pirateTokenCost:4, bonusEffect:"pirateTokenOnBuild", bonusValue:2, bonusDesc:"Gain +2 👾 each time you build a ship part", iconText:"🏗️ ➡ +2👾" },
  { id:"PIRUP_WPN4", suit:"weapons",    title:"Smelly Sock",   pirateTokenCost:4, bonusEffect:"turnStartResource", bonusValue:2, bonusResource:"scrap", bonusDesc:"Gain +2 ⚙️ at start of each turn", iconText:"🔄 ➡ +2⚙️" },

  // NAVIGATION
  { id:"PIRUP_NAV1", suit:"navigation", title:"Coffee Machine", pirateTokenCost:4, bonusEffect:"sneakFreeMarket",  bonusValue:1, bonusDesc:"Sneak always gives +1 free 🃏 from market", iconText:"🧭 ➡ +1🛒" },
  { id:"PIRUP_NAV2", suit:"navigation", title:"Weird Statue",  pirateTokenCost:4, bonusEffect:"turnStartResource", bonusValue:1, bonusResource:"tech", bonusDesc:"Gain +1 🧵 at start of each turn", iconText:"🔄 ➡ +1🧵" },
  { id:"PIRUP_NAV3", suit:"navigation", title:"Old Telephone", pirateTokenCost:4, bonusEffect:"pirateDiscount",    bonusValue:1, bonusDesc:"Your Raid cost is reduced to 1 👾", iconText:"🏴‍☠️ 1👾" },
  { id:"PIRUP_NAV4", suit:"navigation", title:"J.A.R.V.I.S.", pirateTokenCost:5, bonusEffect:"buildFast",         bonusValue:1, bonusDesc:"Ship parts can be built using 2 deployed cards", iconText:"2🃏 = 🏗️" },

  // SHIELD
  { id:"PIRUP_SHD1", suit:"shield",     title:"Beard Oil",     pirateTokenCost:3, bonusEffect:"blockStealBack",    bonusValue:1, bonusDesc:"Block also steals 1 👾 from the attacker", iconText:"🛡️ vs⚡ ➡ +1👾" },
  { id:"PIRUP_SHD2", suit:"shield",     title:"Ouija Board",   pirateTokenCost:3, bonusEffect:"sellBonus",         bonusValue:1, bonusDesc:"Selling now gives +1 👾", iconText:"💰 ➡ +1👾" },
  { id:"PIRUP_SHD3", suit:"shield",     title:"Sunscreen",     pirateTokenCost:3, bonusEffect:"pirateTokenOnBlock", bonusValue:1, bonusDesc:"Gain +1 👾 when you successfully Block", iconText:"🛡️ ➡ +1👾" },
  { id:"PIRUP_SHD4", suit:"shield",     title:"Moonscreen",    pirateTokenCost:4, bonusEffect:"drawOnBlock",       bonusValue:1, bonusDesc:"Draw 1 card when you successfully Block", iconText:"🛡️ ➡ +1🃏" },
];

// ── PIRATE MARKET: FACE-DOWN DOWNSIDES (12 cards) ────────────────────────────
const DEFAULT_PIRATE_DOWNSIDES = [
  { id:"PIRDOWN01", downsideEffect:"scrapPremium",             downsideValue:1,  downsideDesc:"Cards that cost ⚙️ now cost +1 extra", iconText:"⚙️ cost +1" },
  { id:"PIRDOWN02", downsideEffect:"techPremium",              downsideValue:1,  downsideDesc:"Cards that cost 🧵 now cost +1 extra", iconText:"🧵 cost +1" },
  { id:"PIRDOWN03", downsideEffect:"handLimitMod",             downsideValue:-2, downsideDesc:"Hand size limit −2", iconText:"✋-2" },
  { id:"PIRDOWN04", downsideEffect:"tokenPremium",             downsideValue:1,  downsideDesc:"Cards that cost 👾 now cost +1 extra", iconText:"👾 cost +1" },
  { id:"PIRDOWN05", downsideEffect:"passPenalty",              downsideValue:1,  downsideDesc:"Gain 1 fewer ⚙️ when skipping", iconText:"⏭️ ➡ -1⚙️" },
  { id:"PIRDOWN06", downsideEffect:"sellPenalty",              downsideValue:1,  downsideDesc:"Gain 1 fewer 👾 when selling cards", iconText:"💰 ➡ -1👾" },
  { id:"PIRDOWN07", downsideEffect:"partMalfunction",          downsideValue:1,  downsideDesc:"Disable one of your other parts until the start of your next turn", iconText:"⚠️🐹🚀" },
  { id:"PIRDOWN08", downsideEffect:"stealVulnerable",          downsideValue:1,  downsideDesc:"When stolen from, the attacker chooses which card you lose (not you)", iconText:"vs⚡ ➡ 👤🎯🃏" },
  { id:"PIRDOWN09", downsideEffect:"opponentLottery",          downsideValue:1,  downsideDesc:"All opponents get +1 🧵 immediately", iconText:"👥 +1🧵" },
  { id:"PIRDOWN10", downsideEffect:"sellDisabled",             downsideValue:1,  downsideDesc:"Cannot sell cards for pirate tokens", iconText:"🚫💰" },
  { id:"PIRDOWN11", downsideEffect:"noJunkyardPick",           downsideValue:1,  downsideDesc:"Cannot pick from the junkyard", iconText:"🚫🗑️" },
  { id:"PIRDOWN12", downsideEffect:"opponentPirateOnYourTurn", downsideValue:1,  downsideDesc:"Each opponent gains +1 👾 at the start of your turn", iconText:"🔄 ➡ 👥+1👾" },
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
  sellTokens: 2,            // pirate tokens gained from selling cards (each sellBonus effect adds +1)
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
