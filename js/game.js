"use strict";

const SUITS = ['engine', 'weapons', 'navigation', 'shield'];
const SUIT_ICONS = { engine:icon('engine'), weapons:icon('weapons'), navigation:icon('nav'), shield:icon('shield'), wild:'🌈', neutral:'' };
const SHIP_PART_NAMES = { engine:'Engine', weapons:'Weapon', navigation:'Navigation', shield:'Shield' };
const SCRAP_ICON = icon('scrap');
const TECH_ICON  = icon('tech');

let game = null;
let nextInstanceId = 1;
let currentHandHidden = false;

// ── Turn phase: 'action' → 'buy' ────────────────────────────────────────────
let currentPhase = 'action';
let actionsRemaining = 2;

// ── Pending states ──────────────────────────────────────────────────────────
let pendingSteal = null;          // { stealerIdx, targetIdx:null, suit:null, activationCard:null }
let pendingAttack = null;         // { attackerIdx, targetIdx:null, suit:null, activationCard:null }
let pendingDefenderChoice = null; // { mode:'steal'|'attack'|'callForAid'|'attackPart'|'attackPiratePart', attackerIdx, targetIdx, suit }
let pendingJunkyardPick = null;   // { allCards:[{idx,item}], selectedIndices:[], maxPicks:N, fromSneak:bool }
let pendingJunkyardShop = null;   // { previewCards:[{junkIdx,item}], selectedIndices:[], maxPicks } — multi-pick, costs 1 👾
let pendingSneakChoice = null;    // { mode:null|'market'|'junkyard', activationCard, marketPicksRemaining? }
let pendingSneakJunkyard = null;  // { offeredCards:[{card},...], selectedIds:[] }
let pendingSneakPlay = null;      // { instanceId, hasMorePicks:bool }
let pendingSalvageChoice = false; // showing scrap/tech choice
let pendingBuyPhase = null;       // { cardsBought:0 }
let pendingPass = null;           // { mode:null|'scrap'|'tech' }
let pendingRepair = null;         // { suit, selectedCards:[] }
let pendingBuildPowerChoice = null; // { suit, cardIds:[], cards:[], powerCardInstanceId:null|id }
let pendingCallForAid = null;     // { mode:null|'attack', targetIdx:null, suit:null }
let pendingDiscard = false;
let pendingAbilityPick = null; // { mode:'steal'|'attack'|'sneak'|'block', candidates:[cards], targetIdx? }
let pendingBuildSelect = null; // { suit, needed, suitCards:[cards], selectedIds:[] }
let pendingBuildHandCost = null; // { suit, cardIds, power } — pay 1 hand card as build cost
let pendingWildSuitChoice = null; // { instanceId, fromSneak?, fromSneakTableau? }
let pendingPartDisable = null;    // { reason:'partMalfunction' } — player must choose a part to disable
let pendingDisablePartAction = null; // { step:'select-target'|'select-part', targetIdx? } — NTL06 disablePart action
let pendingSneakTableauSelect = null; // { instanceIds:[], selectedIds:Set, maxTableau:1 }
let pendingSabotageMode = false;   // Power Bank: sabotage market card selection active
let pendingBribeTarget = null;     // { activationCard } — Weird Statue: choosing redirect target
let pendingDoubleAgent = null;     // { slot, marketIdx } — Beard Oil: choose opponent for downside
let pendingSecondChance = null;    // { firstAbility } — Ouija Board: second ability prompt
let pendingScavenger = null;       // { card, attackerIdx, candidates:[] } — Cargo Pants: take destroyed card
let sneakPickedIds = [];   // accumulates junkyard+market card IDs during sneak before multi-select
let sneakTableauPlayQueue = [];  // queue of IDs being processed after sneak tableau confirm
let sellMode = false;
let sellSelection = [];
let lastDrawnInstanceId = null;
let playedThisTurn = new Set();

// ===== Action log =====

function addLog(html) {
  if (!game) return;
  game.log.unshift(html);
  if (game.log.length > 150) game.log.length = 150;
}
function logPlayer(name) { return `<strong class="log-player">${escape(name)}</strong>`; }
function logCard(title, suit) { return `<span class="log-card log-suit-${suit||'neutral'}">${escape(title)}</span>`; }

// ===== Effects helpers =====

function getPenaltyEffects(playerIdx) {
  const p = game.players[playerIdx];
  const fx = {
    handLimitMod:0, passPenalty:0, navDisabled:false, blockDisabled:false,
    weakAttack:false, buildCostMod:0, stealVulnerable:false, pirateTokenLeak:0,
    sellDisabled:false, noJunkyardPick:false,
    scrapPremium:0, techPremium:0, tokenPremium:0, sellPenalty:0, partMalfunction:false,
    stealAttackReward:0,
  };
  for (const pc of (p.pirateCards||[])) {
    if (!pc.damaged && pc.downside) applyEffect(fx, pc.downside.downsideEffect, pc.downside.downsideValue);
  }
  return fx;
}

// Returns flags indicating whether the player has an undamaged/enabled part for each ability.
// Having a part enables the ability — player must still discard a matching hand card as cost.
function getShipPartEffects(playerIdx) {
  const p = game.players[playerIdx];
  const fab = { stealEnabled:false, attackEnabled:false, sneakEnabled:false, blockEnabled:false };
  for (const sp of (p.shipParts||[])) {
    if (!sp.damaged && !sp.disabled) {
      if (sp.suit==='engine')     fab.stealEnabled=true;
      if (sp.suit==='weapons')    fab.attackEnabled=true;
      if (sp.suit==='navigation') fab.sneakEnabled=true;
      if (sp.suit==='shield')     fab.blockEnabled=true;
    }
  }
  for (const pc of (p.pirateCards||[])) {
    if (!pc.damaged && pc.upside) {
      if (pc.upside.suit==='engine')     fab.stealEnabled=true;
      if (pc.upside.suit==='weapons')    fab.attackEnabled=true;
      if (pc.upside.suit==='navigation') fab.sneakEnabled=true;
      if (pc.upside.suit==='shield')     fab.blockEnabled=true;
    }
  }
  return fab;
}

function getBonusEffects(playerIdx) {
  const p = game.players[playerIdx];
  const bfx = {
    pirateOnSteal:false, stealExtra:0, tokenPerTurn:0, mayday:false,
    drawOnAttack:false, attackLoot:false, passBonus:0, pirateTokenOnBuild:false,
    navBonusScrap:0, navBonusTech:0, navBonusPirate:0,
    buildFast:false, repairCheap:false, junkyardSalvage:false, extraDraw:0,
    blockStealBack:false, sellBonus:0, pirateTokenOnBlock:false, drawOnBlock:false,
    defensiveSteal:false, defensiveAttack:false, offensiveSneak:false, offensiveBlock:false,
    freeSteal:false, freeAttack:false, freeSneak:false, freeBlock:false,
    disablePart:false,
    harvest:false, reflex:false, sabotage:false, scavenger:false,
    doubleBarrel:false, pillage:false, taxCollector:false, corsair:false,
    echo:false, bribe:false, liquidator:false, doubleAgent:false,
    secondChance:false, insurance:false, encore:false,
  };
  const _applyNavBonus = (pwr) => {
    if (pwr.resource==='scrap')  bfx.navBonusScrap  += pwr.value||1;
    else if (pwr.resource==='tech')   bfx.navBonusTech   += pwr.value||1;
    else if (pwr.resource==='pirate') bfx.navBonusPirate += pwr.value||1;
  };
  // Ship part powers (chosen at build time) — only active while part is undamaged and not disabled
  for (const sp of (p.shipParts||[])) {
    if (!sp.damaged && !sp.disabled && sp.power && sp.power.effect !== 'turnStartResource') {
      if (sp.power.effect === 'navBonus') _applyNavBonus(sp.power);
      else applyEffect(bfx, sp.power.effect, sp.power.value||1);
    }
  }
  // Pirate card upsides
  for (const pc of (p.pirateCards||[])) {
    if (!pc.damaged && pc.upside) applyEffect(bfx, pc.upside.bonusEffect, pc.upside.bonusValue||1);
  }
  // Tableau card powers (type:'tableau') — active while card is in tableau
  for (const tc of (p.tableau||[])) {
    if (tc.power?.type === 'tableau') applyEffect(bfx, tc.power.effect, tc.power.value||1);
  }
  return bfx;
}

function applyEffect(fx, key, value) {
  if (key==null||!(key in fx)) return;
  if (typeof fx[key]==='boolean') fx[key]=true; else fx[key]+=(value||0);
}

function getTurnStartCardResources(playerIdx) {
  const p = game.players[playerIdx];
  const gains = { scrap:0, tech:0, pirate:0 };
  // Ship part powers (upgrade type, chosen at build time) — only active while undamaged and not disabled
  for (const sp of (p.shipParts||[])) {
    if (sp.damaged || sp.disabled || !sp.power) continue;
    if (sp.power.effect !== 'turnStartResource') continue;
    const resource = sp.power.resource;
    if (resource in gains) gains[resource] += sp.power.value||1;
  }
  // Tableau card powers (type:'tableau') — active while card is in tableau
  for (const tc of (p.tableau||[])) {
    if (tc.power?.type !== 'tableau') continue;
    if (tc.power.effect !== 'turnStartResource') continue;
    const resource = tc.power.resource;
    if (resource && resource in gains) gains[resource] += tc.power.value||1;
  }
  return gains;
}

// ===== Deck helpers =====

function buildDeck() {
  const deck = [];
  config.cards.forEach(card => {
    for (let i=0;i<card.quantity;i++) {
      deck.push({
        instanceId: nextInstanceId++,
        cardId: card.id,
        title: card.title,
        description: card.description,
        power: card.power ? {...card.power} : null,
        suit: card.suit||'neutral',
        symbols: { scrap:(card.symbols||{}).scrap||0, tech:(card.symbols||{}).tech||0 },
        cost: { scrap:(card.cost||{}).scrap||0, tech:(card.cost||{}).tech||0 },
        iconText: card.iconText || '',
      });
    }
  });
  shuffle(deck);
  return deck;
}

function drawFromDeck() {
  if (game.deck.length===0) {
    const junkCards = game.junkyard.filter(i=>i.type==='card');
    if (junkCards.length===0) return null;
    const take = Math.ceil(junkCards.length / 2);
    shuffle(junkCards);
    const toRefill = junkCards.slice(0, take);
    toRefill.forEach(item => {
      const idx = game.junkyard.indexOf(item);
      if (idx>=0) game.junkyard.splice(idx,1);
      game.deck.push(item.card);
    });
    shuffle(game.deck);
    flash(`Market restocked from junkyard (${take} cards)`);
    if (game.deck.length===0) return null;
  }
  return game.deck.pop();
}

function buildCardMarket() {
  const market = [];
  for (let i=0;i<5;i++) market.push(drawFromDeck()||null);
  return market;
}

function refillMarketSlot(idx) {
  game.cardMarket[idx] = drawFromDeck()||null;
}

function redrawCardMarket() {
  game.cardMarket.forEach(card => { if (card) game.junkyard.push({type:'card', card}); });
  game.cardMarket = buildCardMarket();
  addLog(`${logPlayer(currentPlayer().name)} 🔄 Redrew the card market`);
  flash('Card market redrawn!');
  renderGame();
}

// ===== Pirate market helpers =====

function buildAllPirateSlots() {
  const upsides  = shuffle(config.pirateUpsides.map(u=>({...u})));
  const downsides= shuffle(config.pirateDownsides.map(d=>({...d})));
  return shuffle(upsides.map((upside, i) => ({
    upside,
    downside: downsides[i] || null,   // null if fewer downsides than upsides
    downsideRevealed: false,
  })));
}

function redrawPirateMarket() {
  const nonNull = game.pirateMarket.filter(s => s !== null);

  if (game.pirateDeck.length === 0) {
    // Deck exhausted — recycle the cards currently visible in the market
    if (nonNull.length === 0) { flash("No pirate cards left!"); return; }
    game.pirateDeck = shuffle(nonNull.map(s => ({ ...s, downsideRevealed: false })));
    addLog(`${logPlayer(currentPlayer().name)} 🔄 Reshuffled remaining pirate cards`);
  } else {
    // Normal redraw: discard current market cards, draw fresh from deck
    // (discarded cards won't reappear until the deck runs dry)
    game.pirateDiscarded = (game.pirateDiscarded || []).concat(nonNull);
    addLog(`${logPlayer(currentPlayer().name)} 🔄 Redrew the pirate market`);
  }

  const newMarket = [];
  for (let i = 0; i < 4; i++) {
    newMarket.push(game.pirateDeck.length > 0 ? game.pirateDeck.shift() : null);
  }
  game.pirateMarket = newMarket;

  flash('Pirate market redrawn!');
  renderGame();
}

// ===== Win condition =====

function countActiveShipParts(playerIdx) {
  const p = game.players[playerIdx];
  const regularParts = p.shipParts.filter(sp=>!sp.damaged).length;
  const pirateParts = (p.pirateCards||[]).filter(pc=>!pc.damaged).length;
  return regularParts + pirateParts;
}

function checkWin(p) {
  const idx = game.players.indexOf(p);
  if (countActiveShipParts(idx) >= (config.rules.shipPartsToWin||3)) {
    document.getElementById('win-player-name').textContent=p.name;
    const regularTitles = p.shipParts.filter(sp=>!sp.damaged).map(sp=>sp.title);
    const pirateTitles = (p.pirateCards||[]).filter(pc=>!pc.damaged).map(pc=>pc.upside.title);
    const partsList = [...regularTitles, ...pirateTitles].join(', ');
    document.getElementById('win-parts-list').textContent=partsList;
    document.getElementById('win-dialog').showModal();
  }
}

// ===== Game start =====

function startGame(numPlayers, playerNames, playroomPlayerIds=[]) {
  nextInstanceId=1;
  currentPhase='action'; actionsRemaining=2;
  pendingSteal=null; pendingAttack=null; pendingDefenderChoice=null;
  pendingJunkyardPick=null; pendingJunkyardShop=null;
  pendingSneakChoice=null; pendingSneakPlay=null; pendingBuyPhase=null;
  pendingPass=null; pendingRepair=null; pendingCallForAid=null;
  pendingBuildPowerChoice=null; pendingAbilityPick=null; pendingBuildSelect=null;
  pendingBuildHandCost=null; pendingWildSuitChoice=null; pendingSneakTableauSelect=null;
  sneakPickedIds=[]; sneakTableauPlayQueue=[];
  pendingDiscard=false; sellMode=false; sellSelection=[];
  lastDrawnInstanceId=null; playedThisTurn=new Set();
  pendingSabotageMode=false; pendingBribeTarget=null;
  pendingDoubleAgent=null; pendingSecondChance=null; pendingScavenger=null;
  pendingSalvageChoice=false; pendingSneakJunkyard=null;

  game={
    players:[], currentPlayerIndex:0,
    deck:buildDeck(),
    cardMarket:[],
    firstTurnDone:false, junkyard:[], removed:[],
    pirateMarket:[], pirateDeck:[], pirateDiscarded:[],
    playroomPlayerIds,   // parallel array to players[]; used by each client to find their own index
    log:[]
  };
  game.cardMarket = buildCardMarket();
  const allPirateSlots = buildAllPirateSlots();
  game.pirateDeck   = allPirateSlots.slice(4);
  game.pirateMarket = allPirateSlots.slice(0, 4);

  const startingScrap = config.rules.startingScrapByPosition || [1, 2, 3, 4];
  for (let i=0;i<numPlayers;i++) {
    game.players.push({
      name: playerNames[i]||`Player ${i+1}`,
      hand:[], tableau:[],
      scrap: startingScrap[i] || 0,
      tech:0,
      shipParts:[], pirateTokens:0, pirateCards:[],
      usedCards:[],
      secondChanceUsed:false, sabotageUsedThisTurn:false,
      stealAttackRewardPaid:false, repairPenaltyPending:false, buildGiftDrawPending:false, marketBlockedThisTurn:false,
    });
  }
  for (let p=0;p<numPlayers;p++) {
    for (let c=0;c<config.rules.startingHandSize;c++) {
      const card=drawFromDeck(); if(card) game.players[p].hand.push(card);
    }
  }
  currentHandHidden=false;
  renderGame(); // renderGame() handles setup-view/game-view toggle
}

function currentPlayer() { return game.players[game.currentPlayerIndex]; }


// ===== Play card to tableau (action phase only) =====

function playCard(instanceId) {
  if (currentPhase !== 'action') { flash("Cards can only be played during Action Phase"); return; }
  if (anyBlocking()||pendingDiscard) { flash("Resolve the current action first"); return; }
  if (sellMode) { flash("Exit trade mode first"); return; }
  if (actionsRemaining <= 0) { flash("No actions remaining this turn"); return; }
  const p=currentPlayer(); const idx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (idx<0) return;
  const card=p.hand[idx];
  if (card.suit==='wild') {
    pendingWildSuitChoice={instanceId};
    renderGame();
    return;
  }
  p.hand.splice(idx,1);
  p.tableau.push(card);
  const bfxPlay=getBonusEffects(game.currentPlayerIndex);
  const echoMult=(bfxPlay.echo && playedThisTurn.size===0)?2:1;
  p.scrap+=(card.symbols?.scrap||0)*echoMult;
  p.tech+=(card.symbols?.tech||0)*echoMult;
  if((card.symbols?.pirate||0)>0){ p.pirateTokens+=(card.symbols.pirate)*echoMult; }
  if(echoMult===2) addLog(`${logPlayer(p.name)} Echo — ${logCard(card.title,card.suit)} symbols doubled`);
  addLog(`${logPlayer(p.name)} deployed ${logCard(card.title,card.suit)}`);
  playedThisTurn.add(instanceId);
  spendAction();
}

function confirmWildSuitChoice(suit) {
  if (!pendingWildSuitChoice) return;
  const {instanceId, fromSneak, fromSneakTableau}=pendingWildSuitChoice;
  const p=currentPlayer();
  const idx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (idx<0) { pendingWildSuitChoice=null; renderGame(); return; }
  const card=p.hand.splice(idx,1)[0];
  card.assignedSuit=suit;
  p.tableau.push(card);
  if (fromSneak||fromSneakTableau) {
    p.scrap+=(card.symbols?.scrap||0); p.tech+=(card.symbols?.tech||0);
    if((card.symbols?.pirate||0)>0) p.pirateTokens+=card.symbols.pirate;
    addLog(`${logPlayer(p.name)} played 🌈 ${escape(card.title)} as ${SUIT_ICONS[suit]} to tableau (sneak pick)`);
  } else {
    const bfxWild=getBonusEffects(game.currentPlayerIndex);
    const echoMultW=(bfxWild.echo && playedThisTurn.size===0)?2:1;
    p.scrap+=(card.symbols?.scrap||0)*echoMultW;
    p.tech+=(card.symbols?.tech||0)*echoMultW;
    if((card.symbols?.pirate||0)>0){ p.pirateTokens+=(card.symbols.pirate)*echoMultW; }
    if(echoMultW===2) addLog(`${logPlayer(p.name)} Echo — 🌈 ${escape(card.title)} symbols doubled`);
    addLog(`${logPlayer(p.name)} deployed 🌈 ${escape(card.title)} as ${SUIT_ICONS[suit]}`);
    playedThisTurn.add(instanceId);
  }
  pendingWildSuitChoice=null;
  if (fromSneak) _advanceSneakPlay();
  else if (fromSneakTableau) _processSneakTableauQueue();
  else spendAction();
}

function cancelWildSuitChoice() {
  const {fromSneak, fromSneakTableau}=pendingWildSuitChoice||{};
  pendingWildSuitChoice=null;
  if (fromSneak) _advanceSneakPlay();
  else if (fromSneakTableau) _processSneakTableauQueue();
  else renderGame();
}

// ===== Disable Part action (NTL06 Balsamic Vinegar tableau power) =====

function useDisablePartAbility() {
  if (!requireActionPhase()) return;
  const bfx=getBonusEffects(game.currentPlayerIndex);
  if (!bfx.disablePart) { flash("No Disable Part ability"); return; }
  const targets=game.players.filter((p,i)=>i!==game.currentPlayerIndex&&p.shipParts.some(sp=>!sp.damaged&&!sp.disabled));
  if (targets.length===0) { flash("No opponent has a part to disable"); return; }
  pendingDisablePartAction={step:'select-target'};
  renderGame();
}

function selectDisablePartTarget(targetIdx) {
  if (!pendingDisablePartAction) return;
  const target=game.players[targetIdx];
  const eligible=target.shipParts.filter(sp=>!sp.damaged&&!sp.disabled);
  if (eligible.length===0) { flash("No eligible parts"); return; }
  pendingDisablePartAction={step:'select-part', targetIdx};
  renderGame();
}

function confirmDisablePartAction(suit) {
  if (!pendingDisablePartAction||pendingDisablePartAction.step!=='select-part') return;
  const {targetIdx}=pendingDisablePartAction;
  const attacker=currentPlayer(); const target=game.players[targetIdx];
  const part=target.shipParts.find(sp=>sp.suit===suit&&!sp.damaged&&!sp.disabled);
  if (!part) { flash("Part not found"); return; }
  part.disabled=true;
  addLog(`${logPlayer(attacker.name)} 🫙 disabled ${logPlayer(target.name)}'s ${SUIT_ICONS[suit]} ${escape(part.title)} until their next turn`);
  flash(`Disabled ${target.name}'s ${part.title}!`);
  pendingDisablePartAction=null;
  spendAction();
}

function cancelDisablePartAbility() {
  pendingDisablePartAction=null;
  renderGame();
}

// ===== Part disable (partMalfunction downside) =====

function confirmPartDisable(suit) {
  if (!pendingPartDisable) return;
  const p=currentPlayer();
  const part=p.shipParts.find(sp=>sp.suit===suit&&!sp.damaged);
  if (!part) { flash("No valid part to disable"); return; }
  part.disabled=true;
  addLog(`${logPlayer(p.name)} 💔 ${escape(part.title)} is malfunctioning until next turn`);
  flash(`${part.title} is malfunctioning this turn!`);
  pendingPartDisable=null;
  renderGame();
}

function unplayCard(instanceId) {
  if (currentPhase !== 'action') return;
  if (!playedThisTurn.has(instanceId)) { flash("Can only unplay cards played this turn"); return; }
  const p=currentPlayer(); const idx=p.tableau.findIndex(c=>c.instanceId===instanceId);
  if (idx<0) return;
  const card=p.tableau.splice(idx,1)[0];
  // Reverse resources gained when the card was played
  p.scrap-=(card.symbols?.scrap||0);
  p.tech-=(card.symbols?.tech||0);
  if((card.symbols?.pirate||0)>0) p.pirateTokens-=(card.symbols.pirate||0);
  p.hand.push(card);
  playedThisTurn.delete(instanceId);
  actionsRemaining = Math.min(2, actionsRemaining + 1);
  renderGame();
}

// Helper: is any interactive pending state active?
function anyBlocking() {
  return !!(pendingSteal||pendingAttack||pendingDefenderChoice||
    pendingJunkyardPick||pendingJunkyardShop||pendingSneakChoice||pendingSneakPlay||
    pendingCallForAid||pendingRepair||pendingBuildPowerChoice||pendingAbilityPick||pendingBuildSelect||
    pendingWildSuitChoice||pendingPartDisable||pendingDisablePartAction||pendingSneakTableauSelect||
    pendingSabotageMode||pendingBribeTarget||pendingDoubleAgent||pendingSecondChance||pendingScavenger||
    pendingBuildHandCost||pendingSalvageChoice||pendingSneakJunkyard);
}

// ===== Discard hand card to use ability → goes to junkyard =====

// Returns the discarded card object, or null if no suitable hand card.
function activateAbility(suit, specificCard) {
  const p=currentPlayer();
  const card = specificCard || p.hand.find(c=>c.suit===suit);
  if (!card) return null;
  const idx = p.hand.indexOf(card);
  if (idx<0) return null;
  p.hand.splice(idx, 1);
  game.junkyard.push({type:'card', card});
  addLog(`${logPlayer(p.name)} discarded ${logCard(card.title,card.suit)} to activate ability`);
  return card;
}

// Returns the discarded card object, or null if no shield card in hand.
function activateBlockAbility(targetIdx, specificCard) {
  const p=game.players[targetIdx];
  const card = specificCard || p.hand.find(c=>c.suit==='shield');
  if (!card) return null;
  const idx = p.hand.indexOf(card);
  if (idx<0) return null;
  p.hand.splice(idx, 1);
  game.junkyard.push({type:'card', card});
  addLog(`${logPlayer(p.name)} discarded ${logCard(card.title,card.suit)} to block`);
  return card;
}

// Guard for action-phase-only actions
function requireActionPhase() {
  if (currentPhase !== 'action') { flash("Not in action phase"); return false; }
  if (anyBlocking()||pendingDiscard) { flash("Resolve current action first"); return false; }
  if (actionsRemaining <= 0) { flash("No actions remaining — click Done to go to Resupply"); return false; }
  return true;
}

// ===== Neutral free action (NTL01-04 activated from hand) =====

function useNeutralFreeAction(instanceId) {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer();
  const cardIdx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (cardIdx<0) return;
  const card=p.hand[cardIdx];
  const effect=card.power?.effect;
  if (!['freeAttack','freeSteal','freeSneak','disablePart'].includes(effect)) return;
  // Card itself is the activation cost — no additional suit card needed (goes to junkyard so cancel can return it)
  if (effect==='disablePart') {
    if (game.players.length<2) { flash("No targets available"); return; }
    const targets=game.players.filter((pl,i)=>i!==game.currentPlayerIndex&&pl.shipParts.some(sp=>!sp.damaged&&!sp.disabled));
    if (targets.length===0) { flash("No opponent has a part to disable"); return; }
    p.hand.splice(cardIdx,1); game.junkyard.push({type:'card',card});
    addLog(`${logPlayer(p.name)} ⚡ activated ${logCard(card.title,card.suit)} from hand`);
    pendingDisablePartAction={step:'select-target'};
    renderGame(); return;
  }
  if (effect==='freeAttack') {
    if (game.players.length<2) { flash("No targets available"); return; }
    p.hand.splice(cardIdx,1); game.junkyard.push({type:'card',card});
    addLog(`${logPlayer(p.name)} ⚡ activated ${logCard(card.title,card.suit)} from hand`);
    addLog(`${logPlayer(p.name)} ${icon('weapons')} initiated attack`);
    pendingAttack={attackerIdx:game.currentPlayerIndex,targetIdx:null,suit:null,activationCard:card};
  } else if (effect==='freeSteal') {
    if (game.players.length<2) { flash("No targets available"); return; }
    p.hand.splice(cardIdx,1); game.junkyard.push({type:'card',card});
    addLog(`${logPlayer(p.name)} ⚡ activated ${logCard(card.title,card.suit)} from hand`);
    addLog(`${logPlayer(p.name)} ${icon('engine')} initiated steal`);
    pendingSteal={stealerIdx:game.currentPlayerIndex,targetIdx:null,suit:null,activationCard:card};
  } else if (effect==='freeSneak') {
    const dfx=getPenaltyEffects(game.currentPlayerIndex);
    if (dfx.navDisabled) { flash("Sneak ability disabled by your pirate card."); return; }
    p.hand.splice(cardIdx,1); game.junkyard.push({type:'card',card});
    addLog(`${logPlayer(p.name)} ⚡ activated ${logCard(card.title,card.suit)} from hand`);
    pendingSneakChoice={mode:null,activationCard:card};
    renderGame(); return;
  }
  renderGame();
}

function defenderUseNeutralFreeBlock(instanceId) {
  if (!pendingDefenderChoice) return;
  const {mode,attackerIdx,targetIdx}=pendingDefenderChoice;
  const target=game.players[targetIdx];
  const cardIdx=target.hand.findIndex(c=>c.instanceId===instanceId);
  if (cardIdx<0) return;
  const card=target.hand[cardIdx];
  const dfx=getPenaltyEffects(targetIdx);
  if (dfx.blockDisabled) { flash(`${target.name}'s pirate card prevents blocking!`); return; }
  // The card itself IS the block — no additional shield card required
  target.hand.splice(cardIdx,1);
  game.junkyard.push({type:'card', card});
  addLog(`${logPlayer(target.name)} ⚡ activated ${logCard(card.title,card.suit)} to block`);
  addLog(`${logPlayer(target.name)} ${icon('shield')} blocked the ${mode==='steal'?'steal':'attack'}`);
  flash(`${target.name} blocked!`);
  _applyBlockBonuses(targetIdx,attackerIdx,mode);
  pendingDefenderChoice=null;
  spendAction();
}

function defenderBlockWithCard(instanceId) {
  if (!pendingDefenderChoice) return;
  const {mode,attackerIdx,targetIdx}=pendingDefenderChoice;
  const dfx=getPenaltyEffects(targetIdx);
  if (dfx.blockDisabled) { flash(`Block is disabled!`); return; }
  const defFab=getShipPartEffects(targetIdx);
  const defBfx=getBonusEffects(targetIdx);
  if (!defFab.blockEnabled&&!defBfx.freeBlock) { flash(`No Shield part built`); return; }
  const target=game.players[targetIdx];
  const card=target.hand.find(c=>c.instanceId===instanceId);
  if (!card) return;
  if (!activateBlockAbility(targetIdx,card)) return;
  addLog(`${logPlayer(target.name)} ${icon('shield')} blocked the ${mode==='steal'?'steal':'attack'}`);
  flash(`${target.name} blocked!`);
  _applyBlockBonuses(targetIdx,attackerIdx,mode);
  pendingDefenderChoice=null;
  spendAction();
}

// ===== Steal =====

function useStealAbility() {
  if (!requireActionPhase()||sellMode) return;
  if (game.players.length<2) { flash("No targets available"); return; }
  const p=currentPlayer(); const fab=getShipPartEffects(game.currentPlayerIndex);
  const bfx=getBonusEffects(game.currentPlayerIndex);
  if (!fab.stealEnabled && !bfx.freeSteal) { flash("Build the Engine first to unlock Steal"); return; }
  const candidates=p.hand.filter(c=>c.suit==='engine'||c.suit==='wild'||(bfx.offensiveSneak&&c.suit==='navigation'));
  if (candidates.length===0) { flash(`Need an ${icon('engine')} Engine card in hand to steal`); return; }
  if (candidates.length===1) {
    const card=activateAbility('engine', candidates[0]);
    addLog(`${logPlayer(p.name)} ${icon('engine')} initiated steal`);
    pendingSteal={stealerIdx:game.currentPlayerIndex, targetIdx:null, suit:null, activationCard:card};
    renderGame();
  } else {
    pendingAbilityPick={mode:'steal', candidates};
    renderGame();
  }
}

function selectStealTarget(targetIdx) {
  if (!pendingSteal) return;
  if (targetIdx===pendingSteal.stealerIdx) { flash("Can't steal from yourself"); return; }
  pendingSteal={...pendingSteal, targetIdx};
  renderGame();
}

// ===== Shield tax routing =====


// ===== Steal target/suit selection =====

function selectStealCard(instanceId) {
  if (!pendingSteal||pendingSteal.targetIdx===null) return;
  const target=game.players[pendingSteal.targetIdx];
  const card=target.tableau.find(c=>c.instanceId===instanceId);
  if (!card) { flash("Card not found"); return; }
  const {stealerIdx, targetIdx, activationCard} = pendingSteal;
  pendingAttack=null; pendingSteal=null;
  pendingDefenderChoice={mode:'steal', attackerIdx:stealerIdx, targetIdx, specificCardId:instanceId, suit:card.suit, activationCard};
  renderGame();
}

function selectStealSuit(suit) {
  if (!pendingSteal||pendingSteal.targetIdx===null) return;
  const target=game.players[pendingSteal.targetIdx];
  if (!target.tableau.some(c=>c.suit===suit)) { flash(`${target.name} has no ${suit} cards in tableau`); return; }
  const {stealerIdx, targetIdx, activationCard} = pendingSteal;
  pendingAttack=null; pendingSteal=null;
  pendingDefenderChoice={mode:'steal', attackerIdx:stealerIdx, targetIdx, suit, activationCard};
  renderGame();
}

function selectStealHand() {
  if (!pendingSteal||pendingSteal.targetIdx===null) return;
  const target=game.players[pendingSteal.targetIdx];
  if (target.hand.length===0) { flash(`${target.name} has no cards in hand`); return; }
  const {stealerIdx, targetIdx, activationCard} = pendingSteal;
  pendingAttack=null; pendingSteal=null;
  pendingDefenderChoice={mode:'steal', attackerIdx:stealerIdx, targetIdx, suit:null, handTarget:true, activationCard};
  renderGame();
}

function stealPirateToken() {
  if (!pendingSteal||pendingSteal.targetIdx===null) return;
  const attacker=currentPlayer(); const target=game.players[pendingSteal.targetIdx];
  if (target.pirateTokens<=0) { flash("Target has no pirate tokens"); return; }
  target.pirateTokens--; attacker.pirateTokens++;
  const bfx=getBonusEffects(game.currentPlayerIndex);
  if (bfx.pirateOnSteal) { attacker.pirateTokens++; addLog(`${logPlayer(attacker.name)} +1 ${icon('pirate')} from steal bonus`); }
  addLog(`${logPlayer(attacker.name)} ${icon('engine')} stole 1 ${icon('pirate')} from ${logPlayer(target.name)}`);
  flash(`Stole 1 ${icon('pirate')} from ${target.name}!`);
  _checkStealAttackReward(pendingSteal.stealerIdx, pendingSteal.targetIdx);
  _applyEncore(bfx, pendingSteal.activationCard, attacker);
  pendingSteal=null; if(!offerSecondChance('steal')) spendAction();
}

function cancelSteal() {
  const card=pendingSteal?.activationCard; pendingSteal=null;
  if (card) {
    const ji=game.junkyard.findIndex(j=>j.type==='card'&&j.card===card);
    if(ji>=0){game.junkyard.splice(ji,1); currentPlayer().hand.push(card);}
  }
  flash("Steal cancelled."); renderGame();
}

// ===== Attack =====

function useAttackAbility() {
  if (!requireActionPhase()||sellMode) return;
  if (game.players.length<2) { flash("No targets available"); return; }
  const p=currentPlayer(); const fab=getShipPartEffects(game.currentPlayerIndex);
  const bfx=getBonusEffects(game.currentPlayerIndex);
  if (!fab.attackEnabled && !bfx.freeAttack) { flash("Build the Weapon first to unlock Attack"); return; }
  const candidates=p.hand.filter(c=>c.suit==='weapons'||c.suit==='wild'||(bfx.offensiveBlock&&c.suit==='shield'));
  if (candidates.length===0) { flash(`Need a ${icon('weapons')} Weapon card in hand to attack`); return; }
  if (candidates.length===1) {
    const card=activateAbility('weapons', candidates[0]);
    addLog(`${logPlayer(p.name)} ${icon('weapons')} initiated attack`);
    pendingAttack={attackerIdx:game.currentPlayerIndex, targetIdx:null, suit:null, activationCard:card};
    renderGame();
  } else {
    pendingAbilityPick={mode:'attack', candidates};
    renderGame();
  }
}

function selectAttackTarget(targetIdx) {
  if (!pendingAttack) return;
  if (targetIdx===pendingAttack.attackerIdx) { flash("Can't attack yourself"); return; }
  pendingAttack={...pendingAttack, targetIdx};
  renderGame();
}

function selectAttackCard(instanceId) {
  if (!pendingAttack||pendingAttack.targetIdx===null) return;
  const target=game.players[pendingAttack.targetIdx];
  const card=target.tableau.find(c=>c.instanceId===instanceId);
  if (!card) { flash("Card not found"); return; }
  const {attackerIdx, targetIdx, activationCard} = pendingAttack;
  pendingAttack=null; pendingSteal=null;
  pendingDefenderChoice={mode:'attack', attackerIdx, targetIdx, specificCardId:instanceId, suit:card.suit, activationCard};
  renderGame();
}

function selectAttackSuit(suit) {
  if (!pendingAttack||pendingAttack.targetIdx===null) return;
  const target=game.players[pendingAttack.targetIdx];
  if (!target.tableau.some(c=>c.suit===suit)) { flash(`${target.name} has no ${suit} cards in tableau`); return; }
  const {attackerIdx, targetIdx, activationCard} = pendingAttack;
  pendingAttack=null; pendingSteal=null;
  pendingDefenderChoice={mode:'attack', attackerIdx, targetIdx, suit, activationCard};
  renderGame();
}

function selectAttackHand() {
  if (!pendingAttack||pendingAttack.targetIdx===null) return;
  const target=game.players[pendingAttack.targetIdx];
  if (target.hand.length===0) { flash(`${target.name} has no cards in hand`); return; }
  const {attackerIdx, targetIdx, activationCard} = pendingAttack;
  pendingAttack=null; pendingSteal=null;
  pendingDefenderChoice={mode:'attack', attackerIdx, targetIdx, suit:null, handTarget:true, activationCard};
  renderGame();
}

function attackPirateToken() {
  if (!pendingAttack||pendingAttack.targetIdx===null) return;
  const attacker=currentPlayer(); const target=game.players[pendingAttack.targetIdx];
  if (target.pirateTokens<=0) { flash("Target has no pirate tokens"); return; }
  target.pirateTokens--;
  const bfx=getBonusEffects(game.currentPlayerIndex);
  addLog(`${logPlayer(attacker.name)} ${icon('weapons')} destroyed 1 ${icon('pirate')} from ${logPlayer(target.name)}`);
  flash(`Destroyed 1 ${icon('pirate')} from ${target.name}!`);
  if (bfx.drawOnAttack) { const c=drawFromDeck(); if(c){attacker.hand.push(c); addLog(`${logPlayer(attacker.name)} drew a card (attack bonus)`);} }
  _checkStealAttackReward(pendingAttack.attackerIdx, pendingAttack.targetIdx);
  _applyEncore(bfx, pendingAttack.activationCard, attacker);
  pendingAttack=null; if(!offerSecondChance('attack')) spendAction();
}

function attackShipPart(partIdx) {
  if (!pendingAttack||pendingAttack.targetIdx===null) return;
  const {attackerIdx,targetIdx}=pendingAttack;
  const attackerDfx=getPenaltyEffects(attackerIdx);
  if (attackerDfx.weakAttack) { flash("Your pirate card prevents attacking ship parts"); return; }
  const target=game.players[targetIdx];
  if (partIdx<0) {
    const pcIdx=Math.abs(partIdx)-1000;
    const pc=(target.pirateCards||[])[pcIdx];
    if (!pc||pc.damaged) { flash("Invalid target"); return; }
    pendingAttack=null; pendingSteal=null;
    pendingDefenderChoice={mode:'attackPiratePart', attackerIdx, targetIdx, pcIdx};
    renderGame();
  } else {
    const part=target.shipParts[partIdx];
    if (!part||part.damaged) { flash("Invalid target"); return; }
    pendingAttack=null; pendingSteal=null;
    pendingDefenderChoice={mode:'attackPart', attackerIdx, targetIdx, partIdx};
    renderGame();
  }
}

function cancelAttack() {
  const card=pendingAttack?.activationCard; pendingAttack=null;
  if (card) {
    const ji=game.junkyard.findIndex(j=>j.type==='card'&&j.card===card);
    if(ji>=0){game.junkyard.splice(ji,1); currentPlayer().hand.push(card);}
  }
  flash("Attack cancelled."); renderGame();
}

// ===== Defender choice =====

function _applyBlockBonuses(targetIdx, attackerIdx, mode) {
  const target=game.players[targetIdx]; const bfx=getBonusEffects(targetIdx);
  if (bfx.blockStealBack && mode==='steal') {
    const attacker=game.players[attackerIdx];
    if (attacker&&attacker.pirateTokens>0) { attacker.pirateTokens--; target.pirateTokens++; addLog(`${logPlayer(target.name)} counter-blocked — stole 1 ${icon('pirate')} from ${logPlayer(attacker.name)}`); }
  }
  if (bfx.pirateTokenOnBlock) { target.pirateTokens++; addLog(`${logPlayer(target.name)} +1 ${icon('pirate')} from blocking`); }
  if (bfx.drawOnBlock) { const c=drawFromDeck(); if(c){target.hand.push(c); addLog(`${logPlayer(target.name)} drew a card from blocking`);} }
}

// Block requires shield part (enabled) + shield card in hand
function defenderBlock() {
  if (!pendingDefenderChoice) return;
  const {mode, attackerIdx, targetIdx} = pendingDefenderChoice;
  const dfx=getPenaltyEffects(targetIdx);
  if (dfx.blockDisabled) { flash(`${game.players[targetIdx].name}'s pirate card prevents blocking!`); return; }
  const defFab=getShipPartEffects(targetIdx);
  const defBfx=getBonusEffects(targetIdx);
  if (!defFab.blockEnabled && !defBfx.freeBlock) { flash(`${game.players[targetIdx].name} needs the Defensive Shell to block`); return; }
  const candidates = game.players[targetIdx].hand.filter(c=>c.suit==='shield'||c.suit==='wild'||(defBfx.defensiveAttack&&c.suit==='weapons'));
  if (candidates.length===0) { flash(`${game.players[targetIdx].name} needs a ${icon('shield')} Shield card in hand to block`); return; }
  if (candidates.length===1) {
    if (!activateBlockAbility(targetIdx, candidates[0])) return;
    const target=game.players[targetIdx];
    addLog(`${logPlayer(target.name)} ${icon('shield')} blocked the ${mode==='steal'?'steal':'attack'}`);
    flash(`${target.name} blocked!`);
    _applyBlockBonuses(targetIdx, attackerIdx, mode);
    pendingDefenderChoice=null;
    spendAction();
  } else {
    pendingAbilityPick={mode:'block', candidates, targetIdx};
    renderGame();
  }
}

function _applyAttackBonuses(_attackerIdx, _targetIdx) {
  // Formerly applied pirateTokenOnAttack and attackToken; both removed from the game.
}

function _checkStealAttackReward(attackerIdx, targetIdx) {
  const target=game.players[targetIdx]; const attacker=game.players[attackerIdx];
  if (target.stealAttackRewardPaid) return;
  const reward=getPenaltyEffects(targetIdx).stealAttackReward;
  if (reward>0) {
    attacker.pirateTokens+=reward;
    target.stealAttackRewardPaid=true;
    addLog(`${logPlayer(attacker.name)} gained ${reward} ${icon('pirate')} (Steal/Attack Reward — first hit on ${logPlayer(target.name)})`);
  }
}

function defenderSacrificeForPiratePart() {
  if (!pendingDefenderChoice||pendingDefenderChoice.mode!=='attackPiratePart') return;
  const {attackerIdx, targetIdx, pcIdx}=pendingDefenderChoice;
  const attacker=game.players[attackerIdx]; const target=game.players[targetIdx];
  const pc=(target.pirateCards||[])[pcIdx];
  if (!pc) { pendingDefenderChoice=null; spendAction(); return; }
  pc.damaged=true;
  const bfx=getBonusEffects(attackerIdx);
  addLog(`${logPlayer(attacker.name)} ${icon('weapons')} damaged ${logPlayer(target.name)}'s ${icon('pirate')} ${escape(pc.upside?.title||'pirate part')}`);
  flash(`${pc.upside?.title||'pirate part'} damaged!`);
  if (bfx.drawOnAttack) { const c=drawFromDeck(); if(c){attacker.hand.push(c); addLog(`${logPlayer(attacker.name)} drew a card (attack bonus)`);} }
  _applyAttackBonuses(attackerIdx, targetIdx);
  if (getBonusEffects(targetIdx).insurance) { const ic=drawFromDeck(); if(ic){target.hand.push(ic); addLog(`${logPlayer(target.name)} drew a card (Insurance)`);} }
  _checkStealAttackReward(attackerIdx, targetIdx);
  _applyEncore(bfx, pendingDefenderChoice.activationCard, attacker);
  pendingDefenderChoice=null; if(!offerSecondChance('attack')) spendAction();
}

function defenderSacrifice(instanceId) {
  if (!pendingDefenderChoice) return;
  const {mode, attackerIdx, targetIdx, suit} = pendingDefenderChoice;
  const attacker=game.players[attackerIdx]; const target=game.players[targetIdx];
  // stealExtra/attackExtra: any suit allowed when suit===null
  const cardIdx = suit===null
    ? target.tableau.findIndex(c=>c.instanceId===instanceId)
    : target.tableau.findIndex(c=>c.instanceId===instanceId&&c.suit===suit);
  if (cardIdx<0) { flash("Pick a valid card"); return; }
  const card=target.tableau.splice(cardIdx,1)[0];
  const bfx=getBonusEffects(attackerIdx);
  if (mode==='steal') {
    attacker.hand.push(card);
    addLog(`${logPlayer(attacker.name)} ${icon('engine')} stole ${logCard(card.title,card.suit)} from ${logPlayer(target.name)}`);
    flash(`${attacker.name} stole ${card.title} from ${target.name}!`);
    if (bfx.pirateOnSteal) { attacker.pirateTokens++; addLog(`${logPlayer(attacker.name)} +1 ${icon('pirate')} from steal`); }
    _checkStealAttackReward(attackerIdx, targetIdx);
    if (bfx.stealExtra>0) {
      const hasSuit = target.tableau.some(c=>c.suit===suit) || target.hand.some(c=>c.suit===suit);
      const activationCard=pendingDefenderChoice.activationCard;
      pendingDefenderChoice={mode:'stealExtra', attackerIdx, targetIdx, suit:hasSuit?suit:null, activationCard};
      renderGame(); return;
    }
    _applyEncore(bfx, pendingDefenderChoice.activationCard, attacker);
  } else if (mode==='stealExtra') {
    attacker.hand.push(card);
    addLog(`${logPlayer(attacker.name)} ${icon('engine')} stole extra ${logCard(card.title,card.suit)} from ${logPlayer(target.name)} (bonus)`);
    flash(`${attacker.name} stole ${card.title} (bonus)!`);
    _applyEncore(bfx, pendingDefenderChoice.activationCard, attacker);
  } else if (mode==='callForAid') {
    game.junkyard.push({type:'card', card});
    addLog(`${logPlayer(attacker.name)} 🆘 forced ${logPlayer(target.name)} to discard ${logCard(card.title,card.suit)} to junkyard`);
    flash(`${target.name} sent ${card.title} to junkyard!`);
  } else if (mode==='attackExtra') {
    game.removed.push(card);
    addLog(`${logPlayer(attacker.name)} ${icon('weapons')} destroyed extra ${logCard(card.title,card.suit)} from ${logPlayer(target.name)} (bonus) — removed from game`);
    flash(`${target.name}'s ${card.title} destroyed (bonus)!`);
  } else {
    // Normal attack: destroy tableau card
    _checkScavenger(card, attackerIdx); // scavenger may intercept; card still goes to removed below if no takers
    game.removed.push(card);
    addLog(`${logPlayer(attacker.name)} ${icon('weapons')} destroyed ${logCard(card.title,card.suit)} from ${logPlayer(target.name)}'s tableau — removed from game`);
    flash(`${attacker.name} attacked ${target.name}'s ${card.title}!`);
    if (bfx.attackLoot) { attacker.tech++; addLog(`${logPlayer(attacker.name)} +1 ${TECH_ICON} (salvage strike)`); }
    if (bfx.drawOnAttack) { const c=drawFromDeck(); if(c){attacker.hand.push(c); addLog(`${logPlayer(attacker.name)} drew a card (attack bonus)`);} }
    _applyAttackBonuses(attackerIdx, targetIdx);
    // pillage: gain destroyed card's resource symbols
    if (bfx.pillage && (card.symbols?.scrap||card.symbols?.tech)) {
      attacker.scrap+=(card.symbols?.scrap||0); attacker.tech+=(card.symbols?.tech||0);
      addLog(`${logPlayer(attacker.name)} +${card.symbols?.scrap||0}${SCRAP_ICON} +${card.symbols?.tech||0}${TECH_ICON} (Pillage)`);
    }
    // reflex: target draws a replacement card
    if (getBonusEffects(targetIdx).reflex) { const rc=drawFromDeck(); if(rc){target.hand.push(rc); addLog(`${logPlayer(target.name)} drew a replacement card (Reflex)`);} }
    _checkStealAttackReward(attackerIdx, targetIdx);
    _applyEncore(bfx, pendingDefenderChoice.activationCard, attacker);
    // doubleBarrel: destroy a second tableau card
    if (bfx.doubleBarrel && target.tableau.length>0) {
      const activationCard=pendingDefenderChoice.activationCard;
      pendingDefenderChoice={mode:'attackExtra', attackerIdx, targetIdx, suit:null, activationCard};
      renderGame(); return;
    }
  }
  pendingDefenderChoice=null;
  // Offer secondChance after a completed steal or attack ability (including bonus hits)
  const _scAbility = (mode==='steal'||mode==='stealExtra') ? 'steal' : (mode==='attack'||mode==='attackExtra') ? 'attack' : null;
  if (!_scAbility || !offerSecondChance(_scAbility)) spendAction();
}


// Defender accepts a specific-card steal/attack (no tableau sacrifice choice needed)
function defenderAccept() {
  if (!pendingDefenderChoice||!pendingDefenderChoice.specificCardId) return;
  defenderSacrifice(pendingDefenderChoice.specificCardId);
}

// Ship part attacked: damage auto-applied, no keep/sell choice
function defenderSacrificeForPart() {
  if (!pendingDefenderChoice||pendingDefenderChoice.mode!=='attackPart') return;
  const {attackerIdx, targetIdx, partIdx} = pendingDefenderChoice;
  const attacker=game.players[attackerIdx]; const target=game.players[targetIdx];
  const part=target.shipParts[partIdx];
  if (!part||part.damaged) { pendingDefenderChoice=null; spendAction(); return; }
  part.damaged=true;
  const bfx=getBonusEffects(attackerIdx);
  addLog(`${logPlayer(attacker.name)} ${icon('weapons')} damaged ${logPlayer(target.name)}'s ${logCard(part.title,part.suit)}`);
  flash(`${part.title} damaged!`);
  if (bfx.drawOnAttack) { const c=drawFromDeck(); if(c){attacker.hand.push(c); addLog(`${logPlayer(attacker.name)} drew a card (attack bonus)`);} }
  _applyAttackBonuses(attackerIdx, targetIdx);
  if (getBonusEffects(targetIdx).insurance) { const ic=drawFromDeck(); if(ic){target.hand.push(ic); addLog(`${logPlayer(target.name)} drew a card (Insurance)`);} }
  _checkStealAttackReward(attackerIdx, targetIdx);
  _applyEncore(bfx, pendingDefenderChoice.activationCard, attacker);
  pendingDefenderChoice=null;
  if(!offerSecondChance('attack')) spendAction();
}

function confirmAbilityPick(instanceId) {
  if (!pendingAbilityPick) return;
  const {mode, candidates, targetIdx} = pendingAbilityPick;
  const card = candidates.find(c=>c.instanceId===instanceId);
  if (!card) return;
  pendingAbilityPick = null;
  if (mode==='steal') {
    const c=activateAbility('engine', card);
    const p=currentPlayer();
    addLog(`${logPlayer(p.name)} ${icon('engine')} initiated steal`);
    pendingSteal={stealerIdx:game.currentPlayerIndex, targetIdx:null, suit:null, activationCard:c};
    renderGame();
  } else if (mode==='attack') {
    const c=activateAbility('weapons', card);
    const p=currentPlayer();
    addLog(`${logPlayer(p.name)} ${icon('weapons')} initiated attack`);
    pendingAttack={attackerIdx:game.currentPlayerIndex, targetIdx:null, suit:null, activationCard:c};
    renderGame();
  } else if (mode==='sneak') {
    const c=activateAbility('navigation', card);
    const p=currentPlayer();
    addLog(`${logPlayer(p.name)} ${icon('nav')} initiated Sneak`);
    pendingSneakChoice={mode:null, activationCard:c};
    renderGame();
  } else if (mode==='block') {
    if (!activateBlockAbility(targetIdx, card)) return;
    const {mode:defMode, attackerIdx} = pendingDefenderChoice;
    const target=game.players[targetIdx];
    addLog(`${logPlayer(target.name)} ${icon('shield')} blocked the ${defMode==='steal'?'steal':'attack'}`);
    flash(`${target.name} blocked!`);
    _applyBlockBonuses(targetIdx, attackerIdx, defMode);
    pendingDefenderChoice=null;
    spendAction();
  }
}

function cancelAbilityPick() {
  pendingAbilityPick=null;
  renderGame();
}

// ===== Repair ship part =====

function startRepair(suit) {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer();
  if (!p.shipParts.some(sp=>sp.suit===suit&&(sp.damaged||sp.disabled))) { flash("No damaged or disabled "+suit+" part to repair"); return; }
  pendingRepair={suit, selectedCards:[]};
  renderGame();
}

function startPirateRepair(suit) {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer();
  if (!(p.pirateCards||[]).some(pc=>pc.upside.suit===suit&&pc.damaged)) { flash("No damaged "+suit+" pirate part to repair"); return; }
  pendingRepair={suit, pirateRepair:true, selectedCards:[]};
  renderGame();
}

function toggleRepairCard(instanceId) {
  if (!pendingRepair) return;
  const {selectedCards}=pendingRepair;
  const penaltyExtra=currentPlayer().repairPenaltyPending?1:0;
  const maxRepair=1+penaltyExtra;
  const idx=selectedCards.indexOf(instanceId);
  if (idx>=0) { selectedCards.splice(idx,1); }
  else { if (selectedCards.length>=maxRepair){flash(`Maximum ${maxRepair} card${maxRepair!==1?'s':''} for repair`);return;} selectedCards.push(instanceId); }
  renderGame();
}

function confirmRepair() {
  if (!pendingRepair) return;
  const p=currentPlayer(); const {suit, selectedCards, pirateRepair}=pendingRepair;
  const bfx=getBonusEffects(game.currentPlayerIndex);
  const penaltyExtra = p.repairPenaltyPending ? 1 : 0;
  // Cards may come from hand or tableau
  const allSelected=selectedCards.map(id=>p.tableau.find(c=>c.instanceId===id)||p.hand.find(c=>c.instanceId===id)).filter(Boolean);
  const sameSuitCards=allSelected.filter(c=>c.suit===suit||c.suit==='wild');
  // Base: 1 same-suit card. Penalty: +1 any-suit card from anywhere (so 2 total, at least 1 same-suit)
  const sameSuitOk = penaltyExtra>0
    ? allSelected.length===2 && sameSuitCards.length>=1
    : allSelected.length===1 && sameSuitCards.length===1;
  // Rice Cooker: repair is always free — no cards accepted as payment
  const valid=bfx.repairCheap ? selectedCards.length===0 : sameSuitOk;
  if (!valid) {
    flash(bfx.repairCheap
      ? `Rice Cooker active — repair is free, just confirm with no cards selected`
      : penaltyExtra>0
        ? `Select 1 ${suit} card + 1 any-suit card (Repair Penalty)`
        : `Select 1 ${suit} card to repair`);
    return;
  }
  allSelected.forEach(card=>{ _removeCardFromPlayerPools(p, card.instanceId); });
  if (p.repairPenaltyPending) { p.repairPenaltyPending=false; addLog(`${logPlayer(p.name)} repair penalty cleared`); }
  if (pirateRepair) {
    const pc=(p.pirateCards||[]).find(pc=>pc.upside.suit===suit&&pc.damaged);
    if (!pc) { pendingRepair=null; renderGame(); return; }
    pc.damaged=false;
    addLog(`${logPlayer(p.name)} 🔧 repaired ${icon('pirate')} ${escape(pc.upside.title)} using ${allSelected.length} card${allSelected.length!==1?'s':''}`);
    flash(`${pc.upside.title} repaired!`);
  } else {
    const part=p.shipParts.find(sp=>sp.suit===suit&&(sp.damaged||sp.disabled));
    if (!part) { pendingRepair=null; renderGame(); return; }
    part.damaged=false; part.disabled=false; delete part.keepForRepair;
    addLog(`${logPlayer(p.name)} 🔧 repaired ${logCard(part.title,suit)} using ${allSelected.length} card${allSelected.length!==1?'s':''}`);
    flash(`${part.title} repaired!`);
  }
  pendingRepair=null;
  const activeCount=countActiveShipParts(game.currentPlayerIndex);
  if (activeCount>=(config.rules.shipPartsToWin||3)) { checkWin(p); renderGame(); return; }
  spendAction();
}

function cancelRepair() { pendingRepair=null; renderGame(); }

// ===== Build ship part (same-suit only) =====

function buildFromTableau(suit) {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer(); const dfx=getPenaltyEffects(game.currentPlayerIndex); const bfx=getBonusEffects(game.currentPlayerIndex);
  const needed=Math.max(1,(config.rules.buildSameSuitCount||3)+(dfx.buildCostMod||0)-(bfx.buildFast?1:0));
  const suitCards=p.tableau.filter(c=>c.suit===suit||(c.suit==='wild'&&c.assignedSuit===suit));
  if (suitCards.length<needed) { flash(`Need ${needed} ${SUIT_ICONS[suit]} cards in tableau`); return; }
  if ((p.pirateCards||[]).some(pc=>pc.upside.suit===suit)) { flash(`Already have a ${suit} pirate part`); return; }
  const existingIdx=p.shipParts.findIndex(sp=>sp.suit===suit);
  if (existingIdx>=0&&!p.shipParts[existingIdx].damaged) { flash(`Already have an active ${suit} ship part`); return; }
  if (p.hand.length===0) { flash("Need 1 card in hand to pay the build cost"); return; }
  // Ask for hand card payment first; tableau selection follows after
  pendingBuildHandCost={suit, cardIds:null, power:null};
  renderGame();
}

function _continueBuildAfterHandCard(suit, handCardId) {
  const p=currentPlayer(); const dfx=getPenaltyEffects(game.currentPlayerIndex); const bfx=getBonusEffects(game.currentPlayerIndex);
  const needed=Math.max(1,(config.rules.buildSameSuitCount||3)+(dfx.buildCostMod||0)-(bfx.buildFast?1:0));
  const suitCards=p.tableau.filter(c=>c.suit===suit||(c.suit==='wild'&&c.assignedSuit===suit));
  if (suitCards.length > needed) {
    pendingBuildSelect={suit, needed, suitCards, selectedIds:[], handCardId};
    renderGame();
    return;
  }
  const toSpend=suitCards.slice(0,needed);
  const cardsWithPower=toSpend.filter(c=>c.power&&c.power.type!=='tableau');
  if (cardsWithPower.length===0) {
    _finalizeBuild(suit, toSpend.map(c=>c.instanceId), null, handCardId);
  } else {
    pendingBuildPowerChoice={suit, cardIds:toSpend.map(c=>c.instanceId), cards:toSpend, powerCardInstanceId:undefined, handCardId};
    renderGame();
  }
}

function toggleBuildSelectCard(instanceId) {
  if (!pendingBuildSelect) return;
  const {selectedIds, needed} = pendingBuildSelect;
  const idx = selectedIds.indexOf(instanceId);
  if (idx>=0) { selectedIds.splice(idx,1); }
  else { if (selectedIds.length>=needed){flash(`Select exactly ${needed} cards`);return;} selectedIds.push(instanceId); }
  renderGame();
}

function confirmBuildSelect() {
  if (!pendingBuildSelect) return;
  const {suit, needed, suitCards, selectedIds, handCardId} = pendingBuildSelect;
  if (selectedIds.length!==needed) { flash(`Select exactly ${needed} cards`); return; }
  const toSpend = selectedIds.map(id=>suitCards.find(c=>c.instanceId===id)).filter(Boolean);
  pendingBuildSelect=null;
  const cardsWithPower=toSpend.filter(c=>c.power&&c.power.type!=='tableau');
  if (cardsWithPower.length===0) {
    _finalizeBuild(suit, toSpend.map(c=>c.instanceId), null, handCardId);
  } else {
    pendingBuildPowerChoice={suit, cardIds:toSpend.map(c=>c.instanceId), cards:toSpend, powerCardInstanceId:undefined, handCardId};
    renderGame();
  }
}

function cancelBuildSelect() {
  pendingBuildSelect=null; renderGame();
}

function selectBuildPower(instanceIdOrNull) {
  if (!pendingBuildPowerChoice) return;
  pendingBuildPowerChoice={...pendingBuildPowerChoice, powerCardInstanceId:instanceIdOrNull};
  renderGame();
}

function confirmBuildPowerChoice() {
  if (!pendingBuildPowerChoice||pendingBuildPowerChoice.powerCardInstanceId===undefined) { flash("Choose a power option first"); return; }
  const {suit, cardIds, cards, powerCardInstanceId, handCardId}=pendingBuildPowerChoice;
  pendingBuildPowerChoice=null;
  let power=null;
  if (powerCardInstanceId!==null) {
    const powerCard=cards.find(c=>c.instanceId===powerCardInstanceId);
    if (powerCard?.power) power={...powerCard.power, cardTitle:powerCard.title, instanceId:powerCardInstanceId};
  }
  _finalizeBuild(suit, cardIds, power, handCardId);
}

function cancelBuildPowerChoice() {
  pendingBuildPowerChoice=null; renderGame();
}

function selectBuildHandCost(instanceId) {
  if (!pendingBuildHandCost) return;
  const p=currentPlayer();
  const cardIdx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (cardIdx<0) return;
  const {suit}=pendingBuildHandCost;
  pendingBuildHandCost=null;
  _continueBuildAfterHandCard(suit, instanceId);
}

function cancelBuildHandCost() {
  pendingBuildHandCost=null; renderGame();
}

function _finalizeBuild(suit, cardIds, power, handCardId) {
  const p=currentPlayer();
  const needed=cardIds.length;
  const activeId=power?.instanceId??cardIds[0];
  cardIds.forEach(id=>{ const i=p.tableau.findIndex(c=>c.instanceId===id); if(i>=0){const [c]=p.tableau.splice(i,1); if(id===activeId){p.usedCards.push(c);}else{game.junkyard.push({type:'card',card:c});} } });
  // Pay 1 hand card as build cost
  const hi=p.hand.findIndex(c=>c.instanceId===handCardId);
  if (hi>=0) { const [hc]=p.hand.splice(hi,1); game.junkyard.push({type:'card',card:hc}); }
  const existingIdx=p.shipParts.findIndex(sp=>sp.suit===suit);
  if (existingIdx>=0) p.shipParts.splice(existingIdx,1);
  const title = (power&&power.cardTitle) ? power.cardTitle : SHIP_PART_NAMES[suit];
  p.shipParts.push({suit,title,power:power||null});
  const bfx=getBonusEffects(game.currentPlayerIndex);
  let logMsg=`${logPlayer(p.name)} 🚀 built ${logCard(title,suit)} (${needed} ${SUIT_ICONS[suit]} tableau + 1 hand card)`;
  if (power) logMsg+=` with power: ${escape(power.text)}`;
  if (bfx.pirateTokenOnBuild) { p.pirateTokens++; logMsg+=` → +1 ${icon('pirate')}`; }
  addLog(logMsg); flash(`${title} built!${power?` Power: ${power.text}`:''}`);
  // harvest: all players with harvest gain 1 pirate token when any ship part is built
  game.players.forEach((pl,i)=>{ if(getBonusEffects(i).harvest){ pl.pirateTokens++; addLog(`${logPlayer(pl.name)} +1 ${icon('pirate')} (Harvest)`); } });
  // buildGiftDraw: if builder has this pending downside, all opponents draw 1 card
  if (p.buildGiftDrawPending) {
    p.buildGiftDrawPending=false;
    game.players.forEach((pl,i)=>{ if(i!==game.currentPlayerIndex){ const c=drawFromDeck(); if(c){pl.hand.push(c); addLog(`${logPlayer(pl.name)} drew a card (Build Gift Draw)`);} } });
  }
  const activeCount=countActiveShipParts(game.currentPlayerIndex);
  if (activeCount>=(config.rules.shipPartsToWin||3)) { checkWin(p); renderGame(); }
  else { spendAction(); }
}

// ===== Sneak (Navigation ability) =====

function useSneakAbility() {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer(); const dfx=getPenaltyEffects(game.currentPlayerIndex);
  if (dfx.navDisabled) { flash("Sneak ability disabled by your pirate card."); return; }
  const fab=getShipPartEffects(game.currentPlayerIndex);
  const bfx=getBonusEffects(game.currentPlayerIndex);
  if (!fab.sneakEnabled && !bfx.freeSneak) { flash("Build the Navigation part first to unlock Sneak"); return; }
  const candidates=p.hand.filter(c=>c.suit==='navigation'||c.suit==='wild'||(bfx.defensiveSteal&&c.suit==='engine'));
  if (candidates.length===0) { flash(`Need a ${icon('nav')} Navigation card in hand to Sneak`); return; }
  if (candidates.length===1) {
    const card=activateAbility('navigation', candidates[0]);
    addLog(`${logPlayer(p.name)} ${icon('nav')} initiated Sneak`);
    pendingSneakChoice={mode:null, activationCard:card};
    renderGame();
  } else {
    pendingAbilityPick={mode:'sneak', candidates};
    renderGame();
  }
}

function _applySneakNavBonus() {
  const p=currentPlayer(); const bfx=getBonusEffects(game.currentPlayerIndex);
  if (bfx.navBonusScrap)  { p.scrap+=bfx.navBonusScrap;  addLog(`${logPlayer(p.name)} +${bfx.navBonusScrap} ${SCRAP_ICON} (nav scan)`); }
  if (bfx.navBonusTech)   { p.tech+=bfx.navBonusTech;    addLog(`${logPlayer(p.name)} +${bfx.navBonusTech} ${TECH_ICON} (nav scan)`); }
  if (bfx.navBonusPirate) { p.pirateTokens+=bfx.navBonusPirate; addLog(`${logPlayer(p.name)} +${bfx.navBonusPirate} ${icon('pirate')} (nav scan)`); }
}

function selectSneakMarket() {
  if (!pendingSneakChoice||pendingSneakChoice.mode!==null) return;
  _applySneakNavBonus();
  pendingSneakChoice={...pendingSneakChoice, mode:'market', marketPicksRemaining:2};
  renderGame();
}

function selectSneakJunkyard() {
  if (!pendingSneakChoice||pendingSneakChoice.mode!==null) return;
  _applySneakNavBonus();
  const activationCard=pendingSneakChoice.activationCard;
  pendingSneakChoice=null;
  const junkCards=game.junkyard.filter(i=>i.type==='card');
  if (junkCards.length===0) { flash("No cards in junkyard"); _endSneakAction(); return; }
  shuffle(junkCards);
  const offered=junkCards.slice(0,3);
  // Remove offered cards from junkyard temporarily
  offered.forEach(item=>{ const idx=game.junkyard.indexOf(item); if(idx>=0) game.junkyard.splice(idx,1); });
  pendingSneakJunkyard={offeredCards:offered.map(i=>i.card), selectedIds:[], activationCard};
  renderGame();
}

function toggleSneakJunkyardCard(idx) {
  if (!pendingSneakJunkyard) return;
  const {selectedIds}=pendingSneakJunkyard;
  const pos=selectedIds.indexOf(idx);
  if (pos>=0) { selectedIds.splice(pos,1); }
  else { if (selectedIds.length>=2){flash("Pick up to 2 cards");return;} selectedIds.push(idx); }
  renderGame();
}

function confirmSneakJunkyard() {
  if (!pendingSneakJunkyard) return;
  const {offeredCards, selectedIds}=pendingSneakJunkyard;
  const p=currentPlayer();
  offeredCards.forEach((card,idx)=>{
    if (selectedIds.includes(idx)) {
      p.hand.push(card);
      addLog(`${logPlayer(p.name)} ${icon('nav')} Sneaked ${logCard(card.title,card.suit)} from junkyard`);
    } else {
      game.junkyard.push({type:'card',card}); // return to junkyard
    }
  });
  if (selectedIds.length>0) flash(`Sneak! Took ${selectedIds.length} card${selectedIds.length!==1?'s':''} from junkyard.`);
  pendingSneakJunkyard=null;
  _endSneakAction();
}

function cancelSneakJunkyard() {
  if (!pendingSneakJunkyard) return;
  const {offeredCards,activationCard}=pendingSneakJunkyard;
  // Return all offered cards back to junkyard
  offeredCards.forEach(card=>game.junkyard.push({type:'card',card}));
  pendingSneakJunkyard=null;
  // Return activation card to hand if any
  if (activationCard) {
    const ji=game.junkyard.findIndex(j=>j.type==='card'&&j.card===activationCard);
    if(ji>=0){game.junkyard.splice(ji,1); currentPlayer().hand.push(activationCard);}
  }
  flash("Sneak cancelled."); renderGame();
}

function sneakPickMarketCard(marketIdx) {
  if (!pendingSneakChoice||pendingSneakChoice.mode!=='market') return;
  const p=currentPlayer();
  const card=game.cardMarket[marketIdx];
  if (!card) { flash("No card in that slot"); return; }
  p.hand.push(card);
  game.cardMarket[marketIdx]=drawFromDeck()||null; // refill immediately
  addLog(`${logPlayer(p.name)} ${icon('nav')} Sneaked 1 card from market`);
  flash(`Sneak! Took 1 card for free.`);
  const remaining=(pendingSneakChoice.marketPicksRemaining||1)-1;
  if (remaining>0) {
    pendingSneakChoice={...pendingSneakChoice, marketPicksRemaining:remaining};
    renderGame();
  } else {
    pendingSneakChoice=null;
    _endSneakAction();
  }
}

function _endSneakAction() {
  game.cardMarket.forEach((slot,i) => { if (!slot) game.cardMarket[i]=drawFromDeck()||null; });
  if(!offerSecondChance('sneak')) spendAction();
}

function _finalizeSneakPicks() {
  if (sneakPickedIds.length>0) {
    pendingSneakTableauSelect={instanceIds:sneakPickedIds.slice(), selectedIds:new Set(), maxTableau:1};
    sneakPickedIds=[];
  } else {
    _endSneakAction();
  }
}

function _advanceSneakPlay() {
  const {playQueue=[], hasMorePicks}=pendingSneakPlay;
  pendingSneakPlay=null;
  if (playQueue.length>0) {
    pendingSneakPlay={instanceId:playQueue[0], hasMorePicks:false, playQueue:playQueue.slice(1)};
    renderGame();
  } else if (hasMorePicks) {
    renderGame(); // pendingSneakChoice still active with remaining market picks
  } else {
    if (sneakPickedIds.length>0) { _finalizeSneakPicks(); renderGame(); }
    else _endSneakAction();
  }
}

function toggleSneakTableauCard(instanceId) {
  if (!pendingSneakTableauSelect) return;
  const sel=pendingSneakTableauSelect.selectedIds;
  const max=pendingSneakTableauSelect.maxTableau??Infinity;
  if (sel.has(instanceId)) { sel.delete(instanceId); }
  else { if(sel.size>=max) sel.clear(); sel.add(instanceId); }
  renderGame();
}

function confirmSneakTableauSelect() {
  if (!pendingSneakTableauSelect) return;
  const {instanceIds, selectedIds}=pendingSneakTableauSelect;
  pendingSneakTableauSelect=null;
  sneakTableauPlayQueue=instanceIds.filter(id=>selectedIds.has(id));
  _processSneakTableauQueue();
}

function cancelSneakTableauSelect() {
  pendingSneakTableauSelect=null;
  _endSneakAction();
}

function _processSneakTableauQueue() {
  if (sneakTableauPlayQueue.length===0) { _endSneakAction(); return; }
  const id=sneakTableauPlayQueue.shift();
  const p=currentPlayer();
  const card=p.hand.find(c=>c.instanceId===id);
  if (!card) { _processSneakTableauQueue(); return; }
  if (card.suit==='wild'&&!card.assignedSuit) {
    pendingWildSuitChoice={instanceId:id, fromSneakTableau:true};
    renderGame(); return;
  }
  const idx=p.hand.findIndex(c=>c.instanceId===id);
  if (idx>=0) {
    const played=p.hand.splice(idx,1)[0];
    p.tableau.push(played);
    p.scrap+=(played.symbols?.scrap||0); p.tech+=(played.symbols?.tech||0);
    addLog(`${logPlayer(p.name)} played ${logCard(played.title,played.suit)} to tableau (sneak pick)`);
  }
  _processSneakTableauQueue();
}

function sneakPlayCardToTableau() {
  if (!pendingSneakPlay) return;
  const p=currentPlayer(); const {instanceId}=pendingSneakPlay;
  const card=p.hand.find(c=>c.instanceId===instanceId);
  if (card && card.suit==='wild') {
    pendingWildSuitChoice={instanceId, fromSneak:true};
    renderGame();
    return;
  }
  const idx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (idx>=0) {
    const played=p.hand.splice(idx,1)[0];
    p.tableau.push(played);
    p.scrap+=(played.symbols?.scrap||0); p.tech+=(played.symbols?.tech||0);
    addLog(`${logPlayer(p.name)} played ${logCard(played.title,played.suit)} to tableau (sneak pick)`);
  }
  _advanceSneakPlay();
}

function sneakKeepInHand() {
  if (!pendingSneakPlay) return;
  _advanceSneakPlay();
}

function cancelSneak() {
  const card=pendingSneakChoice?.activationCard; pendingSneakChoice=null;
  pendingSneakTableauSelect=null; sneakPickedIds=[]; sneakTableauPlayQueue=[];
  game.cardMarket.forEach((slot,i) => { if (!slot) game.cardMarket[i]=drawFromDeck()||null; });
  if (card) {
    const ji=game.junkyard.findIndex(j=>j.type==='card'&&j.card===card);
    if(ji>=0){game.junkyard.splice(ji,1); currentPlayer().hand.push(card);}
  }
  flash("Sneak cancelled."); renderGame();
}

// ===== Raid =====

const RAID_COST = 2;

function useRaid() {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer();
  if (p.pirateTokens<RAID_COST) { flash(`Need ${RAID_COST} ${icon('pirate')} to Raid`); return; }
  if (game.players.length<2) { flash("No targets available"); return; }
  p.pirateTokens-=RAID_COST;
  addLog(`${logPlayer(p.name)} 🏴‍☠️ launched a Raid (paid ${RAID_COST} ${icon('pirate')})`);
  pendingCallForAid={mode:'attack', targetIdx:null, suit:null, paidCost:RAID_COST};
  renderGame();
}

function selectCallForAidTarget(targetIdx) {
  if (!pendingCallForAid||pendingCallForAid.mode!=='attack') return;
  if (targetIdx===game.currentPlayerIndex) { flash("Can't target yourself"); return; }
  pendingCallForAid={...pendingCallForAid, targetIdx};
  renderGame();
}

function selectCallForAidSuit(suit) {
  if (!pendingCallForAid||pendingCallForAid.targetIdx===null) return;
  const target=game.players[pendingCallForAid.targetIdx];
  if (!target.tableau.some(c=>c.suit===suit)) { flash(`${target.name} has no ${suit} cards in tableau`); return; }
  pendingDefenderChoice={mode:'callForAid', attackerIdx:game.currentPlayerIndex, targetIdx:pendingCallForAid.targetIdx, suit};
  pendingCallForAid=null;
  renderGame();
}

function cancelCallForAid() {
  const refund=pendingCallForAid?.paidCost??RAID_COST;
  pendingCallForAid=null;
  const p=currentPlayer(); p.pirateTokens+=refund;
  flash("Raid cancelled — tokens refunded."); renderGame();
}

// ===== Encore helper =====
function _applyEncore(bfx, activationCard, attacker) {
  if (!bfx.encore || !activationCard) return;
  const ji=game.junkyard.findIndex(j=>j.type==='card'&&j.card.instanceId===activationCard.instanceId);
  if (ji>=0) { game.junkyard.splice(ji,1); attacker.hand.push(activationCard); addLog(`${logPlayer(attacker.name)} activation card returned to hand (Encore)`); }
}

// ===== Sabotage (Power Bank) =====
function useSabotage() {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer(); const bfx=getBonusEffects(game.currentPlayerIndex);
  if (!bfx.sabotage) { flash("No Sabotage ability"); return; }
  if (p.sabotageUsedThisTurn) { flash("Already used Sabotage this turn"); return; }
  if (p.pirateTokens<1) { flash(`Need 1 ${icon('pirate')} to Sabotage`); return; }
  if (!game.cardMarket.some(Boolean)) { flash("Market is empty"); return; }
  pendingSabotageMode=true; renderGame();
}
function sabotagePick(marketIdx) {
  if (!pendingSabotageMode) return;
  const card=game.cardMarket[marketIdx];
  if (!card) { flash("No card in that slot"); return; }
  const p=currentPlayer();
  p.pirateTokens--;
  game.junkyard.push({type:'card',card});
  game.cardMarket[marketIdx]=null; refillMarketSlot(marketIdx);
  p.sabotageUsedThisTurn=true;
  addLog(`${logPlayer(p.name)} sabotaged ${logCard(card.title,card.suit)} → junkyard (Sabotage)`);
  flash(`Sabotaged ${card.title}!`);
  pendingSabotageMode=false; spendAction();
}
function cancelSabotage() { pendingSabotageMode=false; renderGame(); }

// ===== Corsair Raid (Smelly Sock) =====
function startCorsairRaid() {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer(); const bfx=getBonusEffects(game.currentPlayerIndex);
  if (!bfx.corsair) { flash("No Corsair ability"); return; }
  const corsairCost=RAID_COST+1;
  if (p.pirateTokens<corsairCost) { flash(`Need ${corsairCost} ${icon('pirate')} for Corsair Raid`); return; }
  if (game.players.length<2) { flash("No targets available"); return; }
  p.pirateTokens-=corsairCost;
  addLog(`${logPlayer(p.name)} 🏴‍☠️ Corsair Raid — hitting all opponents! (paid ${corsairCost} ${icon('pirate')})`);
  let hits=0;
  game.players.forEach((target,ti)=>{
    if (ti===game.currentPlayerIndex||target.tableau.length===0) return;
    // pick a random tableau card from target
    const pick=target.tableau.splice(Math.floor(Math.random()*target.tableau.length),1)[0];
    game.junkyard.push({type:'card',card:pick});
    addLog(`${logPlayer(p.name)} raided ${logPlayer(target.name)}: ${logCard(pick.title,pick.suit)} → junkyard`);
    hits++;
  });
  if (hits===0) addLog(`Corsair Raid hit no one (all opponents had empty tableaux)`);
  flash(`Corsair Raid! Hit ${hits} opponent${hits!==1?'s':''}!`);
  spendAction();
}

// ===== Bribe (Weird Statue) =====
function useBribe() {
  if (!pendingDefenderChoice) return;
  const targetIdx=pendingDefenderChoice.targetIdx;
  const target=game.players[targetIdx];
  if (getBonusEffects(targetIdx).bribe && target.pirateTokens>=2) {
    target.pirateTokens-=2;
    addLog(`${logPlayer(target.name)} paid 2 ${icon('pirate')} to Bribe — redirecting attack`);
    pendingBribeTarget={savedChoice:{...pendingDefenderChoice}};
    pendingDefenderChoice=null;
    renderGame();
  } else {
    flash("Not enough pirate tokens to Bribe (need 2)");
  }
}
function confirmBribeTarget(newTargetIdx) {
  if (!pendingBribeTarget) return;
  const {savedChoice}=pendingBribeTarget;
  const attacker=game.players[savedChoice.attackerIdx];
  const newTarget=game.players[newTargetIdx];
  if (newTargetIdx===savedChoice.attackerIdx) { flash("Can't redirect to the attacker"); return; }
  if (savedChoice.suit && !newTarget.tableau.some(c=>c.suit===savedChoice.suit)) {
    // new target lacks the suit — retarget any suit
    pendingDefenderChoice={...savedChoice, targetIdx:newTargetIdx, suit:null};
  } else {
    pendingDefenderChoice={...savedChoice, targetIdx:newTargetIdx};
  }
  addLog(`${logPlayer(attacker.name)}'s ${savedChoice.mode} redirected to ${logPlayer(newTarget.name)} (Bribe)`);
  pendingBribeTarget=null; renderGame();
}
function cancelBribe() { pendingBribeTarget=null; renderGame(); }

// ===== Scavenger (Cargo Pants) =====
function _checkScavenger(card, attackerIdx) {
  // Called before putting a destroyed card into game.removed.
  // If any non-attacker player has scavenger and >=1 token, queue them for scavenge prompt.
  const candidates=[];
  game.players.forEach((pl,i)=>{
    if (i===attackerIdx) return;
    if (getBonusEffects(i).scavenger && pl.pirateTokens>=1) candidates.push(i);
  });
  if (candidates.length>0) {
    pendingScavenger={card, attackerIdx, candidates:[...candidates]};
  }
}
function confirmScavenge() {
  if (!pendingScavenger) return;
  const {card, candidates}=pendingScavenger;
  const takerIdx=candidates[0];
  const taker=game.players[takerIdx];
  taker.pirateTokens--;
  taker.hand.push(card);
  // remove card from game.removed since scavenger claimed it
  const ri=game.removed.indexOf(card);
  if (ri>=0) game.removed.splice(ri,1);
  addLog(`${logPlayer(taker.name)} scavenged ${logCard(card.title,card.suit)} (paid 1 ${icon('pirate')}) (Scavenger)`);
  flash(`${taker.name} scavenged ${card.title}!`);
  pendingScavenger=null; renderGame();
}
function skipScavenge() {
  if (!pendingScavenger) return;
  const remaining=pendingScavenger.candidates.slice(1);
  if (remaining.length>0) {
    pendingScavenger={...pendingScavenger, candidates:remaining};
    renderGame();
  } else {
    pendingScavenger=null; renderGame();
  }
}

// ===== Pirate downside purchase side-effects =====
function _applyPirateDownsideOnPurchase(p, downside, playerIdx) {
  if (!downside) return;
  const de=downside.downsideEffect, dv=downside.downsideValue||1;
  if (de==='opponentLottery') {
    game.players.forEach((pl,i)=>{ if(i!==playerIdx){ pl.scrap+=2; pl.tech+=1; pl.pirateTokens+=1; addLog(`${logPlayer(pl.name)} +2${SCRAP_ICON} +1${TECH_ICON} +1${icon('pirate')} (Opponent Lottery)`); } });
  }
  if (de==='marketBlock') { p.marketBlockedThisTurn=true; addLog(`${logPlayer(p.name)} cannot buy from market this turn (downside)`); }
  if (de==='buildGiftDraw') { p.buildGiftDrawPending=true; addLog(`${logPlayer(p.name)} opponents draw 1 card next time they build (downside)`); }
  if (de==='repairPenalty') { p.repairPenaltyPending=true; addLog(`${logPlayer(p.name)} next repair costs 1 extra card (downside)`); }
  if (de==='stealAttackReward') { addLog(`${logPlayer(p.name)} first opponent to Steal/Attack them gains ${dv} ${icon('pirate')} (downside)`); }
}

// ===== Double Agent (Beard Oil) =====
function _completePirateBuy(p, slot, marketIdx) {
  p.pirateCards.push({upside:{...slot.upside}, downside:slot.downside ? {...slot.downside} : null});
  if (!game.pirateMarket[marketIdx]) { // already cleared by caller if needed
    if (game.pirateDeck && game.pirateDeck.length>0) { game.pirateMarket[marketIdx]=game.pirateDeck.shift(); addLog(`Pirate market refilled (${game.pirateDeck.length} remaining)`); }
  }
  const downsideLabel=slot.downside ? escape(slot.downside.downsideDesc) : 'none';
  addLog(`${logPlayer(p.name)} ${icon('pirate')} smuggled pirate part <span class="log-pirate">${escape(slot.upside.title)}</span> (downside: ${downsideLabel})`);
  flash(`Bought ${slot.upside.title}! Downside: ${slot.downside ? slot.downside.downsideDesc : 'none'}`);
  _applyPirateDownsideOnPurchase(p, slot.downside, game.currentPlayerIndex);
  // harvest: all players with harvest gain 1 pirate token when any part is bought
  game.players.forEach((pl,i)=>{ if(getBonusEffects(i).harvest){ pl.pirateTokens++; addLog(`${logPlayer(pl.name)} +1 ${icon('pirate')} (Harvest)`); } });
  const activeCount=countActiveShipParts(game.currentPlayerIndex);
  if (activeCount>=(config.rules.shipPartsToWin||3)) { checkWin(p); renderGame(); } else { spendAction(); }
}
function confirmDoubleAgent(targetIdx) {
  if (!pendingDoubleAgent) return;
  const {slot}=pendingDoubleAgent;
  const p=currentPlayer(); const target=game.players[targetIdx];
  // Buyer gets upside only; target gets downside only
  p.pirateCards.push({upside:{...slot.upside}, downside:null});
  if (slot.downside) target.pirateCards.push({upside:null, downside:{...slot.downside}});
  const downsideLabel=slot.downside ? escape(slot.downside.downsideDesc) : 'none';
  addLog(`${logPlayer(p.name)} ${icon('pirate')} smuggled <span class="log-pirate">${escape(slot.upside.title)}</span> — gave downside (${downsideLabel}) to ${logPlayer(target.name)} (Double Agent)`);
  flash(`Bought ${slot.upside.title}! Downside pushed to ${target.name}!`);
  // Downside fires on the target (who received it), not the buyer
  _applyPirateDownsideOnPurchase(target, slot.downside, targetIdx);
  game.players.forEach((pl,i)=>{ if(getBonusEffects(i).harvest){ pl.pirateTokens++; addLog(`${logPlayer(pl.name)} +1 ${icon('pirate')} (Harvest)`); } });
  pendingDoubleAgent=null;
  const activeCount=countActiveShipParts(game.currentPlayerIndex);
  if (activeCount>=(config.rules.shipPartsToWin||3)) { checkWin(p); renderGame(); } else { spendAction(); }
}
function cancelDoubleAgent() {
  if (!pendingDoubleAgent) return;
  const {slot, marketIdx}=pendingDoubleAgent; pendingDoubleAgent=null;
  _completePirateBuy(currentPlayer(), slot, marketIdx);
}

// ===== Second Chance (Ouija Board) =====
function offerSecondChance(firstAbility) {
  const p=currentPlayer(); const bfx=getBonusEffects(game.currentPlayerIndex);
  if (bfx.secondChance && !p.secondChanceUsed) {
    pendingSecondChance={firstAbility}; renderGame(); return true;
  }
  return false;
}
function useSecondChance() {
  if (!pendingSecondChance) return;
  currentPlayer().secondChanceUsed=true;
  pendingSecondChance=null;
  startActionPhase();
}
function skipSecondChance() {
  pendingSecondChance=null; spendAction();
}

// ===== Junkyard pick (multi-select: Sneak junkyard mode) =====

function selectJunkyardItem(junkIdx) {
  if (!pendingJunkyardPick) return;
  const {selectedIndices, maxPicks} = pendingJunkyardPick;
  const pos = selectedIndices.indexOf(junkIdx);
  if (pos >= 0) {
    selectedIndices.splice(pos, 1);
  } else {
    if (selectedIndices.length >= maxPicks) { flash(`Maximum ${maxPicks} cards`); return; }
    selectedIndices.push(junkIdx);
  }
  renderGame();
}

function confirmJunkyardPick() {
  if (!pendingJunkyardPick) return;
  const {allCards, selectedIndices, fromSneak} = pendingJunkyardPick;
  if (selectedIndices.length === 0) { flash("Select at least 1 card"); return; }
  const p=currentPlayer();
  const addedCards=[];
  const sortedIndices=[...selectedIndices].sort((a,b)=>b-a);
  for (const junkIdx of sortedIndices) {
    const item=game.junkyard.splice(junkIdx,1)[0];
    if (item?.type==='card') {
      p.hand.push(item.card);
      addedCards.unshift(item.card); // preserve order
    }
  }
  if (addedCards.length>0) addLog(`${logPlayer(p.name)} ♻️ picked ${addedCards.length} card${addedCards.length!==1?'s':''} from junkyard`);
  flash(`Took ${addedCards.length} card${addedCards.length!==1?'s':''} from junkyard`);
  const {bonusMarketPick} = pendingJunkyardPick;
  pendingJunkyardPick=null;
  if (fromSneak) {
    addedCards.forEach(c=>sneakPickedIds.push(c.instanceId));
    if (bonusMarketPick) {
      // Coffee Machine: give 1 free market pick after junkyard
      pendingSneakChoice={mode:'market', marketPicksRemaining:1, activationCard:null};
      renderGame();
    } else {
      _finalizeSneakPicks();
      renderGame();
    }
  } else {
    startBuyPhase();
  }
}

function cancelJunkyardPick() { pendingJunkyardPick=null; renderGame(); }

// ===== Junkyard Shop — pick any 2 cards (pirate action, costs 1 👾) =====

function startJunkyardShop() {
  if (currentPhase!=='buy'||!pendingBuyPhase) { flash("Junkyard Shop is only available during Resupply"); return; }
  if (pendingBuyPhase.junkyardUsed) { flash("Already used Junkyard Shop this turn"); return; }
  if (pendingBuyPhase.cardsBought>0) { flash("Already bought from market — can't also use Junkyard Shop"); return; }
  const p=currentPlayer(); const dfx=getPenaltyEffects(game.currentPlayerIndex);
  if (dfx.noJunkyardPick) { flash("Your pirate card prevents junkyard picks"); return; }
  if (p.pirateTokens<2) { flash(`Need 2 ${icon('pirate')} for Junkyard Shop`); return; }
  const junkyardCards=game.junkyard.map((item,i)=>({junkIdx:i,item})).filter(x=>x.item.type==='card');
  if (junkyardCards.length===0) { flash("No cards in junkyard"); return; }
  p.pirateTokens-=2;
  addLog(`${logPlayer(p.name)} 🗑️ opened junkyard shop (paid 2 ${icon('pirate')})`);
  const bfx=getBonusEffects(game.currentPlayerIndex);
  const showCount = bfx.junkyardSalvage ? 4 : 3;
  const shuffledJunk=junkyardCards.slice(); shuffle(shuffledJunk); const previewCards=shuffledJunk.slice(0,showCount);
  pendingJunkyardShop={previewCards, selectedIndices:[], maxPicks:2};
  renderGame();
}

function toggleJunkyardShopCard(idx) {
  if (!pendingJunkyardShop) return;
  const {selectedIndices, maxPicks=2}=pendingJunkyardShop;
  const pos=selectedIndices.indexOf(idx);
  if (pos>=0) { selectedIndices.splice(pos,1); }
  else { if (selectedIndices.length>=maxPicks){flash(`Select up to ${maxPicks} cards`);return;} selectedIndices.push(idx); }
  renderGame();
}

function confirmJunkyardShop() {
  if (!pendingJunkyardShop) return;
  const p=currentPlayer(); const {previewCards, selectedIndices}=pendingJunkyardShop;
  if (selectedIndices.length===0) { flash("Select at least 1 card"); return; }
  const picked=selectedIndices.map(i=>previewCards[i]);
  let shopCount=0;
  for (const {item} of picked) {
    const actualIdx=game.junkyard.indexOf(item);
    if (actualIdx>=0) {
      game.junkyard.splice(actualIdx,1);
      if (item.type==='card') { p.hand.push(item.card); shopCount++; }
    }
  }
  if (shopCount>0) addLog(`${logPlayer(p.name)} 🗑️ took ${shopCount} card${shopCount!==1?'s':''} from junkyard shop`);
  flash(`Junkyard Shop! Took ${shopCount} card${shopCount!==1?'s':''}`);
  pendingJunkyardShop=null;
  if (pendingBuyPhase) pendingBuyPhase.junkyardUsed=true;
  renderGame();
}

function cancelJunkyardShop() {
  pendingJunkyardShop=null;
  currentPlayer().pirateTokens+=2;
  addLog(`${logPlayer(currentPlayer().name)} 🗑️ junkyard shop cancelled — 2 ${icon('pirate')} refunded`);
  renderGame();
}

// ===== Skip =====

function startSalvage() {
  if (!requireActionPhase()||sellMode) return;
  pendingSalvageChoice=true;
  renderGame();
}

function doSalvage(type) {
  if (!pendingSalvageChoice) return;
  pendingSalvageChoice=false;
  const p=currentPlayer();
  const dfx=getPenaltyEffects(game.currentPlayerIndex); const bfx=getBonusEffects(game.currentPlayerIndex);
  if (type==='scrap') {
    const gain=Math.max(0,(config.rules.passScrap||2)+(bfx.passBonus||0)-(dfx.passPenalty||0));
    p.scrap+=gain;
    addLog(`${logPlayer(p.name)} salvaged +${gain} ${SCRAP_ICON}`);
    flash(`Salvaged +${gain} scrap!`);
  } else {
    const gain=config.rules.passTech||1;
    p.tech+=gain;
    addLog(`${logPlayer(p.name)} salvaged +${gain} ${TECH_ICON}`);
    flash(`Salvaged +${gain} tech!`);
  }
  spendAction();
}

function cancelSalvage() { pendingSalvageChoice=false; renderGame(); }

function initSkip() { startSalvage(); }

// ===== Trade cards (pirate action) =====

function enterSellMode() {
  if (!requireActionPhase()) return;
  const dfx=getPenaltyEffects(game.currentPlayerIndex);
  if (dfx.sellDisabled) { flash("Your pirate card prevents trading cards"); return; }
  sellMode=true; sellSelection=[]; renderGame();
}

function toggleSellSelection(instanceId) {
  const bfxSell=getBonusEffects(game.currentPlayerIndex);
  const idx=sellSelection.indexOf(instanceId);
  if (idx>=0) sellSelection.splice(idx,1);
  else { if (!bfxSell.liquidator && sellSelection.length>=1){flash("Select exactly 1 card to trade");return;} sellSelection.push(instanceId); }
  renderGame();
}

function _removeCardFromPlayerPools(p, instanceId) {
  let idx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (idx>=0) { const card=p.hand.splice(idx,1)[0]; game.junkyard.push({type:'card',card}); return; }
  idx=p.tableau.findIndex(c=>c.instanceId===instanceId);
  if (idx>=0) { const card=p.tableau.splice(idx,1)[0]; game.junkyard.push({type:'card',card}); }
}

function confirmSell() {
  const p=currentPlayer(); const bfx=getBonusEffects(game.currentPlayerIndex); const dfx=getPenaltyEffects(game.currentPlayerIndex);
  if (bfx.liquidator) {
    if (sellSelection.length===0) { flash("Select at least 1 card to trade"); return; }
    const count=sellSelection.length;
    sellSelection.slice().forEach(instanceId=>{ _removeCardFromPlayerPools(p, instanceId); });
    p.pirateTokens+=count; sellSelection=[]; sellMode=false;
    addLog(`${logPlayer(p.name)} 🗑️ traded ${count} card${count!==1?'s':''} → +${count} ${icon('pirate')} (Liquidator)`);
    flash(`Traded ${count} card${count!==1?'s':''} → +${count} ${icon('pirate')}!`);
  } else {
    if (sellSelection.length!==1) { flash("Select exactly 1 card to trade"); return; }
    const tokenAmount=Math.max(0,(config.rules.sellTokens||1)+bfx.sellBonus-(dfx.sellPenalty||0));
    sellSelection.slice().forEach(instanceId=>{ _removeCardFromPlayerPools(p, instanceId); });
    p.pirateTokens+=tokenAmount; sellSelection=[]; sellMode=false;
    addLog(`${logPlayer(p.name)} 🗑️ traded 1 card → +${tokenAmount} ${icon('pirate')}`);
    flash(`Traded 1 card → +${tokenAmount} ${icon('pirate')}.`);
  }
  // taxCollector: opponents with Tax Collector gain 1 token
  game.players.forEach((pl,i)=>{ if(i!==game.currentPlayerIndex && getBonusEffects(i).taxCollector){ pl.pirateTokens++; addLog(`${logPlayer(pl.name)} +1 ${icon('pirate')} (Tax Collector)`); } });
  spendAction();
}

function cancelSell() { sellMode=false; sellSelection=[]; renderGame(); }


function startActionPhase() {
  if (anyBlocking()||pendingDiscard) return;
  currentPhase='action';
  renderGame();
}

// ===== Buy phase =====

function startBuyPhase() {
  if (anyBlocking()||sellMode||pendingDiscard) return;
  currentPhase='buy';
  pendingBuyPhase={cardsBought:0, junkyardUsed:false};
  renderGame();
}

function spendAction() {
  actionsRemaining = Math.max(0, actionsRemaining - 1);
  renderGame();
}

function buyFromMarket(marketIdx) {
  if (!pendingBuyPhase) return;
  if (pendingBuyPhase.junkyardUsed) { flash("Already used Junkyard Shop — can't also buy from market"); return; }
  if ((pendingBuyPhase.cardsBought||0)>=2) { flash("Maximum 2 cards per buy phase"); return; }
  const p=currentPlayer();
  if (p.marketBlockedThisTurn) { flash("Your pirate downside prevents buying from market this turn"); return; }
  const card=game.cardMarket[marketIdx];
  if (!card) return;
  const cost=card.cost||{};
  const dfx=getPenaltyEffects(game.currentPlayerIndex);
  const bfx=getBonusEffects(game.currentPlayerIndex);
  const effScrap=(cost.scrap||0)+((cost.scrap||0)>0?dfx.scrapPremium:0);
  const effTech=(cost.tech||0)+((cost.tech||0)>0?dfx.techPremium:0);
  if (effScrap>p.scrap) { flash(`Need ${effScrap} ${SCRAP_ICON} (have ${p.scrap})`); return; }
  if (effTech>p.tech) { flash(`Need ${effTech} ${TECH_ICON} (have ${p.tech})`); return; }
  p.scrap-=effScrap; p.tech-=effTech;
  p.hand.push(card);
  pendingBuyPhase.cardsBought++;
  game.cardMarket[marketIdx]=null; refillMarketSlot(marketIdx);
  addLog(`${logPlayer(p.name)} bought ${logCard(card.title,card.suit)} from market`); flash(`Bought: ${card.title}!`);
  if (pendingBuyPhase.cardsBought>=2) { endBuyPhase(); return; }
  renderGame();
}

function endBuyPhase() {
  if (!pendingBuyPhase) return;
  pendingBuyPhase=null;
  endTurn();
}

// ===== Pirate market (pirate action) =====

function buyPirateCard(idx) {
  if (!requireActionPhase()||sellMode) return;
  const p=currentPlayer(); const slot=game.pirateMarket[idx];
  if (!slot) return;
  const dfx=getPenaltyEffects(game.currentPlayerIndex);
  const cost=slot.upside.pirateTokenCost+(dfx.tokenPremium||0);
  if (p.pirateTokens<cost) { flash(`Need ${cost} ${icon('pirate')} (have ${p.pirateTokens})`); return; }
  const suit=slot.upside.suit;
  if (p.shipParts.some(sp=>sp.suit===suit)) { flash(`Already have a ${suit} ship part`); return; }
  if ((p.pirateCards||[]).some(pc=>pc.upside.suit===suit)) { flash(`Already have a ${suit} pirate part`); return; }
  p.pirateTokens-=cost;
  const bfxBuy=getBonusEffects(game.currentPlayerIndex);
  // doubleAgent: offer to give downside to an opponent instead
  if (bfxBuy.doubleAgent && slot.downside && game.players.length>1) {
    slot.downsideRevealed=true;
    pendingDoubleAgent={slot:{...slot, upside:{...slot.upside}, downside:{...slot.downside}}, marketIdx:idx};
    game.pirateMarket[idx]=null;
    if (game.pirateDeck && game.pirateDeck.length>0) { game.pirateMarket[idx]=game.pirateDeck.shift(); addLog(`Pirate market refilled (${game.pirateDeck.length} remaining)`); }
    renderGame(); return;
  }
  _completePirateBuy(p, slot, idx);
}

// ===== Turn end =====

function endTurn() {
  pendingSteal=null; pendingAttack=null; pendingDefenderChoice=null;
  pendingJunkyardPick=null; pendingJunkyardShop=null;
  pendingSneakChoice=null; pendingSneakPlay=null; pendingPass=null;
  pendingRepair=null; pendingCallForAid=null; pendingBuildPowerChoice=null;
  pendingAbilityPick=null; pendingBuildSelect=null; pendingBuildHandCost=null;
  pendingSneakTableauSelect=null; sneakPickedIds=[]; sneakTableauPlayQueue=[];
  sellMode=false; sellSelection=[]; pendingBuyPhase=null;
  pendingSabotageMode=false; pendingBribeTarget=null;
  pendingDoubleAgent=null; pendingSecondChance=null; pendingScavenger=null;
  pendingSalvageChoice=false; pendingSneakJunkyard=null;
  const dfx=getPenaltyEffects(game.currentPlayerIndex);
  const limit=(config.rules.handSizeLimit||4)+(dfx.handLimitMod||0);
  const p=currentPlayer();
  if (p.hand.length>limit) { pendingDiscard=true; renderGame(); return; }
  advanceTurn();
}

function advanceTurn() {
  pendingDiscard=false; pendingPartDisable=null; pendingBuildHandCost=null; playedThisTurn=new Set();
  pendingSabotageMode=false; pendingSecondChance=null;
  game.currentPlayerIndex=(game.currentPlayerIndex+1)%game.players.length;
  currentPlayer().sabotageUsedThisTurn=false;
  lastDrawnInstanceId=null;
  // Re-enable any disabled ship parts for the new current player
  currentPlayer().shipParts.forEach(sp=>{ delete sp.disabled; });
  if (game.firstTurnDone) {
    const nextP=currentPlayer(); const nextIdx=game.currentPlayerIndex;
    const nextDfx=getPenaltyEffects(nextIdx); const nextBfx=getBonusEffects(nextIdx);
    nextP.marketBlockedThisTurn=false;
    if (nextDfx.pirateTokenLeak>0) {
      const leak=Math.min(nextDfx.pirateTokenLeak,nextP.pirateTokens);
      if (leak>0) { nextP.pirateTokens-=leak; addLog(`${logPlayer(nextP.name)} lost ${leak} ${icon('pirate')} (pirate leak)`); }
    }
    if (nextBfx.tokenPerTurn>0) { nextP.pirateTokens+=nextBfx.tokenPerTurn; addLog(`${logPlayer(nextP.name)} gained ${nextBfx.tokenPerTurn} ${icon('pirate')} (turn bonus)`); }
    if (nextBfx.extraDraw>0) {
      for (let i=0;i<nextBfx.extraDraw;i++) { const c=drawFromDeck(); if(c){nextP.hand.push(c);if(i===0)lastDrawnInstanceId=c.instanceId;} }
      addLog(`${logPlayer(nextP.name)} drew ${nextBfx.extraDraw} card${nextBfx.extraDraw!==1?'s':''} (turn start)`);
    }
    // mayday: draw 1 junkyard card at turn start if hand is empty
    if (nextBfx.mayday && nextP.hand.length===0) {
      const junkCards=game.junkyard.filter(j=>j.type==='card');
      const picks=junkCards.slice(-1); // take the most recently added card
      picks.forEach(item=>{
        const ji=game.junkyard.indexOf(item);
        if(ji>=0){ game.junkyard.splice(ji,1); nextP.hand.push(item.card); lastDrawnInstanceId=item.card.instanceId; }
      });
      if(picks.length>0) addLog(`${logPlayer(nextP.name)} drew 1 card from Junkyard (Mayday!)`);
    }
    triggerTableauEffects();
    // partMalfunction: must disable one undamaged ship part this turn
    if (nextDfx.partMalfunction && nextP.shipParts.some(sp=>!sp.damaged)) {
      pendingPartDisable={reason:'partMalfunction'};
    }
  }
  game.firstTurnDone=true; currentHandHidden=isPassAndPlay();
  currentPhase='action'; actionsRemaining=2;
  renderGame();
}

function triggerTableauEffects() {
  const p = currentPlayer();
  const gains = getTurnStartCardResources(game.currentPlayerIndex);
  if (gains.scrap) p.scrap += gains.scrap;
  if (gains.tech) p.tech += gains.tech;
  if (gains.pirate) p.pirateTokens += gains.pirate;
  const parts = [];
  if (gains.scrap) parts.push(`+${gains.scrap}${SCRAP_ICON}`);
  if (gains.tech) parts.push(`+${gains.tech}${TECH_ICON}`);
  if (gains.pirate) parts.push(`+${gains.pirate}${icon('pirate')}`);
  if (parts.length) {
    addLog(`${logPlayer(p.name)} gained ${parts.join(' ')} from tableau powers`);
  }
}

function discardForHandLimit(instanceId) {
  const p=currentPlayer(); const idx=p.hand.findIndex(c=>c.instanceId===instanceId);
  if (idx<0) return; const [card]=p.hand.splice(idx,1);
  game.junkyard.push({type:'card', card});
  addLog(`${logPlayer(p.name)} discarded 1 card to junkyard (hand limit)`);
  const dfx=getPenaltyEffects(game.currentPlayerIndex);
  const limit=(config.rules.handSizeLimit||4)+(dfx.handLimitMod||0);
  if (p.hand.length<=limit) advanceTurn(); else renderGame();
}

function toggleHand() { currentHandHidden=!currentHandHidden; renderGame(); }
