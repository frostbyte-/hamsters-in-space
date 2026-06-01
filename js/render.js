"use strict";

const SUIT_LABELS = { engine:'ENG', weapons:'WPN', navigation:'NAV', shield:'SHD', wild:'WILD', neutral:'NTL' };
const SUIT_NAMES = { engine:'Engine', weapons:'Weapon', navigation:'Navigation', shield:'Shield' };
const SUIT_ABILITY_LABELS = { engine:icon('engine')+' Steal', weapons:icon('weapons')+' Attack', navigation:icon('nav')+' Sneak', shield:icon('shield')+' Block' };

function isPassAndPlay() { return document.getElementById('pass-and-play').checked; }
function isUltrawide() { return document.body.classList.contains('ultrawide'); }

function renderSymbols(symbols) {
  if (!symbols) return '';
  let s='';
  if (symbols.scrap)  for(let i=0;i<symbols.scrap;i++)  s+=SCRAP_ICON;
  if (symbols.tech)   for(let i=0;i<symbols.tech;i++)   s+=TECH_ICON;
  if (symbols.pirate) for(let i=0;i<symbols.pirate;i++) s+=icon('pirate');
  return s;
}

function renderCost(cost) {
  if (!cost) return '';
  let s='';
  if (cost.scrap) s+=`${SCRAP_ICON}×${cost.scrap}`;
  if (cost.tech)  s+=`${s?' ':''}${TECH_ICON}×${cost.tech}`;
  return s;
}

function renderCostCompact(cost) {
  if (!hasCost(cost)) return 'Free';
  const parts = [];
  if (cost.scrap) parts.push(`${cost.scrap}${SCRAP_ICON}`);
  if (cost.tech) parts.push(`${cost.tech}${TECH_ICON}`);
  return parts.join(' ');
}

function hasCost(cost) { return cost && ((cost.scrap||0)+(cost.tech||0)>0); }

function renderCardPower(card, condensed=false, inactive=false) {
  if (!card?.power?.text) return '';
  const text = escape(card.power.text);
  const isTableau = card.power.type === 'tableau';
  const isInstant = card.power.type === 'instant';
  if (condensed) {
    const cls = isTableau ? ' tableau-power' : isInstant ? ' instant-power' : '';
    return `<div class="condensed-power-text${cls}${inactive?' power-inactive':''}">${text}${inactive?' <em>(inactive)</em>':''}</div>`;
  }
  if (isTableau) {
    return `<div class="card-power-text tableau-power"><span class="card-tableau-power-label">On Play</span> ${text}</div>`;
  }
  if (isInstant) {
    return `<div class="card-power-text instant-power"><span class="card-instant-power-label">Instant</span> ${text}</div>`;
  }
  return `<div class="card-power-text"><span class="card-power-label">On Upgrade</span> ${text}</div>`;
}

function renderResourcesWithPending(p) {
  return `<span class="loose-tokens">${SCRAP_ICON}${p.scrap} ${TECH_ICON}${p.tech}</span>`;
}

function renderGame() {
  if (!game) return;
  // Ensure views are correct — non-host clients arrive here via the sync RPC handler,
  // never via startGame(), so we handle the toggle here unconditionally.
  document.getElementById('setup-view').hidden = true;
  document.getElementById('game-view').hidden   = false;
  const phaseLabel = currentPhase==='buy' ? '🛒 Resupply' : `▶ Action (${actionsRemaining}/2)`;
  document.getElementById('status-bar').innerHTML = `
    <div class="turn-indicator">&#9654; ${escape(currentPlayer().name)}'s turn</div>
    <div class="phase-indicator">${phaseLabel}</div>
    <div>Deck: <strong>${game.deck.length}</strong></div>`;
  document.getElementById('market-section').innerHTML = renderCardMarket();
  document.getElementById('action-section').innerHTML = renderActionPanel();
  document.getElementById('pirate-section').innerHTML = renderPirateSection();
  document.getElementById('log-section').innerHTML = renderLog();

  const passPlay = isPassAndPlay();
  if (isUltrawide()) {
    const splitAt = Math.ceil(game.players.length / 2);
    let leftHtml = '', rightHtml = '';
    game.players.forEach((p,i) => {
      const html = renderPlayerPanel(p, i, i===game.currentPlayerIndex, passPlay);
      if (i < splitAt) leftHtml += html; else rightHtml += html;
    });
    document.getElementById('players-left').innerHTML = leftHtml;
    document.getElementById('players-right').innerHTML = rightHtml;
    document.getElementById('players-section').innerHTML = '';
  } else {
    let html = '';
    game.players.forEach((p,i) => { html += renderPlayerPanel(p, i, i===game.currentPlayerIndex, passPlay); });
    document.getElementById('players-section').innerHTML = html;
    document.getElementById('players-left').innerHTML = '';
    document.getElementById('players-right').innerHTML = '';
  }
}

// ===== Card Market =====

function renderCardMarket() {
  const _mpMode   = typeof window.myPlayerIndex === 'number';
  const _isMyTurn = !_mpMode || game.currentPlayerIndex === window.myPlayerIndex;
  const p = currentPlayer();
  const inBuy = !!pendingBuyPhase;
  const bought = inBuy ? (pendingBuyPhase.cardsBought||0) : 0;
  const atBuyLimit = inBuy && bought >= 2;

  let html = `<div class="market-header">&#127981; Card Market`;
  if (inBuy) {
    html += ` &mdash; <span class="buy-pool-inline">${SCRAP_ICON}${p.scrap} ${TECH_ICON}${p.tech} available</span>`;
    html += ` <span class="buy-count-badge${atBuyLimit?' buy-limit-reached':''}">${bought}/2 bought</span>`;
  }
  html += `</div><div class="market-content-row"><div class="deck-pile-wrapper">
    ${renderHiddenCard(`<div class="deck-count-badge">${game.deck.length}</div>`,'deck-pile-card')}
    <div class="deck-pile-label">DECK</div>
  </div><div class="card-market-grid">`;

  const isSneakMarket = !!(pendingSneakChoice && pendingSneakChoice.mode==='market' && !pendingSneakPlay);
  const isSabotageMode = !!pendingSabotageMode && _isMyTurn;

  game.cardMarket.forEach((card, idx) => {
    if (!card) { html += `<div class="market-slot empty-slot"><span>Empty</span></div>`; return; }
    const costStr = renderCostCompact(card.cost);

    let actions;
    if (isSabotageMode) {
      actions = [{label:'🗑️ Junk this', fn:`sabotagePick(${idx})`, primary:true, danger:true}];
    } else if (isSneakMarket && _isMyTurn) {
      actions = [{label:'&#9670; Take (free)', fn:`sneakPickMarketCard(${idx})`, primary:true}];
    } else if (inBuy && _isMyTurn && !atBuyLimit && !pendingBuyPhase.junkyardUsed && !p.marketBlockedThisTurn) {
      const dfxBuy=getPenaltyEffects(game.currentPlayerIndex);
      const effS=(card.cost.scrap||0)+((card.cost.scrap||0)>0?(dfxBuy.scrapPremium||0):0);
      const effT=(card.cost.tech||0)+((card.cost.tech||0)>0?(dfxBuy.techPremium||0):0);
      const canAfford = effS<=p.scrap && effT<=p.tech;
      actions = [{label:`Buy (${costStr})`, fn:`buyFromMarket(${idx})`, primary:canAfford, disabled:!canAfford}];
    } else if (inBuy && _isMyTurn && p.marketBlockedThisTurn) {
      actions = [{label:'Market blocked (downside)', disabled:true}];
    } else if (inBuy && (atBuyLimit || pendingBuyPhase.junkyardUsed)) {
      actions = [{label:'Limit reached', disabled:true}];
    } else {
      actions = [{label:`Buy (${costStr})`, disabled:true}];
    }
    html += renderCard(card, actions, ' market-card');
  });
  html += `</div></div>`; /* close card-market-grid + market-content-row */

  html += `<div class="market-redraw-bar">
    <button class="redraw-btn" onclick="redrawCardMarket()" title="Discard all market cards to junkyard and deal fresh ones">🔄 Redraw Market</button>
  </div>`;

  if (inBuy) {
    const junkyardBadge = pendingBuyPhase.junkyardUsed ? ` <span class="buy-count-badge" style="background:#76522a;color:#fff;">🗑️ Junk Shop used</span>` : '';
    if (_isMyTurn) {
      const dfxBuy = getPenaltyEffects(game.currentPlayerIndex);
      const hasJunkCards = game.junkyard.some(j=>j.type==='card');
      const canShopJunk = !pendingBuyPhase.junkyardUsed && pendingBuyPhase.cardsBought===0
        && p.pirateTokens>=2 && hasJunkCards && !dfxBuy.noJunkyardPick;
      html += `<div class="buy-phase-bar">
        <span class="buy-phase-label">&#128178; Resupply Phase — buy up to 2 cards${junkyardBadge} (${SCRAP_ICON}${p.scrap} ${TECH_ICON}${p.tech} available)</span>
        ${canShopJunk ? `<button onclick="startJunkyardShop()">🗑️ Junk Shop (2 ${icon('pirate')})</button>` : ''}
        <button class="primary" onclick="endBuyPhase()">&#10003; Done (end turn)</button>
      </div>`;
    } else {
      html += `<div class="buy-phase-bar">
        <span class="buy-phase-label">&#128178; ${escape(currentPlayer().name)} is in Resupply Phase${junkyardBadge}</span>
      </div>`;
    }
  }
  if (isSneakMarket) {
    const remaining = pendingSneakChoice.marketPicksRemaining||1;
    html += `<div class="buy-phase-bar nav-pick-bar">
      <span class="buy-phase-label">&#9670; Sneak — pick ${remaining} more free card${remaining!==1?'s':''} from market</span>
      <button onclick="cancelSneak()">&#10007; Cancel</button>
    </div>`;
  }
  if (isSabotageMode) {
    html += `<div class="buy-phase-bar nav-pick-bar">
      <span class="buy-phase-label">🗑️ Sabotage — click a market card to send it to the junkyard (costs 1 ${icon('pirate')})</span>
      <button onclick="cancelSabotage()">&#10007; Cancel</button>
    </div>`;
  }
  return html;
}

// ===== Pile display (junkyard / destroyed) =====

function renderPileDisplay(count, label, extraClass='') {
  const empty = count === 0;
  const badge = `<div class="pile-count-badge">${count}</div>`;
  const classes = `mini-pile-card${extraClass?' '+extraClass:''}${empty?' empty-pile':''}`;
  return `<div class="mini-pile-wrapper">
    ${renderHiddenCard(badge, classes)}
    <div class="deck-pile-label">${label}</div>
  </div>`;
}

// ===== Junkyard sidebar (replaces component pool) =====

function renderJunkyardSidebar() {
  const junkCount = game.junkyard.filter(i=>i.type==='card').length;
  const removedCount = (game.removed||[]).length;
  return `<div class="pile-display-col">
    ${renderPileDisplay(junkCount, 'JUNKYARD')}
    ${renderPileDisplay(removedCount, 'REMOVED', 'destroyed-pile')}
  </div>`;
}

// ===== Log =====

function renderLog() {
  if (!game.log||game.log.length===0) return `<div class="log-empty">No actions yet.</div>`;
  return game.log.map(e=>`<div class="log-entry">${e}</div>`).join('');
}

// ===== Action panel =====

function renderActionPanel() {
  // ── Multiplayer turn gating ───────────────────────────────────────────────
  // myPlayerIndex is null in solo/pass-and-play; a number in multiplayer.
  const _mpMode    = typeof window.myPlayerIndex === 'number';
  const _isMyTurn  = !_mpMode || game.currentPlayerIndex === window.myPlayerIndex;
  const _amDefender = _mpMode && !!pendingDefenderChoice
                      && pendingDefenderChoice.targetIdx === window.myPlayerIndex;

  // ── Disable Part action (NTL06 Balsamic Vinegar) ──────────────────────────
  if (pendingDisablePartAction) {
    if (pendingDisablePartAction.step==='select-target') {
      let html = `<div class="action-panel damage-panel">
        <div class="action-panel-title">🫙 Disable Part — choose a target:</div>
        <div class="action-choices" style="margin-top:8px;">`;
      game.players.forEach((p,idx) => {
        if (idx===game.currentPlayerIndex) return;
        const eligible=p.shipParts.filter(sp=>!sp.damaged&&!sp.disabled);
        html += `<button class="action-player-btn" onclick="selectDisablePartTarget(${idx})" ${eligible.length?'':'disabled'}>
          ${escape(p.name)} (${eligible.length} eligible part${eligible.length!==1?'s':''})
        </button>`;
      });
      html += `</div><button onclick="cancelDisablePartAbility()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
      return html;
    }
    if (pendingDisablePartAction.step==='select-part') {
      const target=game.players[pendingDisablePartAction.targetIdx];
      const eligible=target.shipParts.filter(sp=>!sp.damaged&&!sp.disabled);
      return `<div class="action-panel damage-panel">
        <div class="action-panel-title">🫙 Disable one of ${escape(target.name)}'s parts:</div>
        <div class="action-choices" style="margin-top:8px;">
          ${eligible.map(sp=>`<button class="suit-btn-${sp.suit}" onclick="confirmDisablePartAction('${sp.suit}')">${SUIT_ICONS[sp.suit]||''} ${escape(sp.title)}</button>`).join('')}
        </div>
        <button onclick="cancelDisablePartAbility()" style="margin-top:8px;">&#10007; Cancel</button>
      </div>`;
    }
  }

  // ── Part Malfunction — force player to disable one undamaged part ──────────
  if (pendingPartDisable) {
    const p = currentPlayer();
    const eligibleParts = p.shipParts.filter(sp => !sp.damaged && !sp.disabled);
    if (eligibleParts.length === 0) { pendingPartDisable = null; }
    else {
      return `<div class="action-panel damage-panel">
        <div class="action-panel-title">&#9889; Part Malfunction — disable one ship part</div>
        <div class="action-step">Choose one of your undamaged parts to disable until the start of your next turn.</div>
        <div class="action-choices" style="margin-top:8px;">
          ${eligibleParts.map(sp=>`<button class="suit-btn-${sp.suit}" onclick="confirmPartDisable('${sp.suit}')">${SUIT_ICONS[sp.suit]||''} ${escape(sp.title)}</button>`).join('')}
        </div>
      </div>`;
    }
  }

  // ── Wild suit assignment (also handles sneak-played wilds) ─────────────────
  if (pendingWildSuitChoice) {
    const p=currentPlayer();
    const card=p.hand.find(c=>c.instanceId===pendingWildSuitChoice.instanceId);
    const cardName = card ? escape(card.title) : 'Wild card';
    const cancelLabel = pendingWildSuitChoice.fromSneak ? '&#8594; Keep in hand' : '&#10007; Cancel';
    return `<div class="action-panel wild-panel">
      <div class="action-panel-title">🌈 ${cardName} — choose a suit column</div>
      <div class="action-step">This card will permanently join that suit's tableau column and count toward upgrading it.</div>
      <div class="action-choices" style="margin-top:8px;">
        ${SUITS.map(s=>`<button class="suit-btn-${s}" onclick="confirmWildSuitChoice('${s}')">${SUIT_ICONS[s]||''} ${s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
      </div>
      <div class="action-choices" style="margin-top:4px;">
        <button onclick="cancelWildSuitChoice()">${cancelLabel}</button>
      </div>
    </div>`;
  }

  // ── Build power choice ──────────────────────────────────────────────────────
  if (pendingBuildPowerChoice) {
    const {suit, cards, powerCardInstanceId} = pendingBuildPowerChoice;
    const cardsWithPower = cards.filter(c=>c.power);
    const selected = powerCardInstanceId;
    const confirmed = selected !== undefined;
    let html = `<div class="action-panel build-power-panel">
      <div class="action-panel-title">🚀 ${escape(SHIP_PART_NAMES[suit]||suit)} — choose a power for this part:</div>
      <div class="action-step">Select one card's power to activate when this part is complete, or choose none.</div>
      <div class="build-power-choices">`;
    const cardsWithoutPower = cards.filter(c=>!c.power);
    cardsWithPower.forEach(card => {
      const isSel = selected === card.instanceId;
      html += `<button class="build-power-option suit-btn-${card.suit}${isSel?' build-power-selected':''}" onclick="selectBuildPower(${card.instanceId})">
        ${isSel?'&#10003; ':''}${SUIT_ICONS[card.suit]} <strong>${escape(card.title)}</strong>
        <div class="build-power-desc">${escape(card.power.text)}</div>
      </button>`;
    });
    const noSel = selected === null;
    cardsWithoutPower.forEach(card => {
      html += `<button class="build-power-option build-power-none${noSel?' build-power-selected':''}" onclick="selectBuildPower(null)">
        ${noSel?'&#10003; ':''}${SUIT_ICONS[card.suit]} <strong>${escape(card.title)}</strong>
        <div class="build-power-desc">No bonus</div>
      </button>`;
    });
    html += `</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="confirmBuildPowerChoice()" ${confirmed?'':'disabled'}>&#9654; Upgrade ${escape(SUIT_NAMES[suit])} Part</button>
        <button onclick="cancelBuildPowerChoice()">&#10007; Cancel</button>
      </div>
    </div>`;
    return html;
  }

  // ── Repair — select hand cards ───────────────────────────────────────────────
  if (pendingRepair) {
    const p=currentPlayer(); const {suit, selectedCards, pirateRepair}=pendingRepair;
    const bfxR=getBonusEffects(game.currentPlayerIndex);
    const titleIcon = pirateRepair ? icon('pirate') : SUIT_ICONS[suit];
    if (bfxR.repairCheap) {
      return `<div class="action-panel repair-panel">
        <div class="action-panel-title">🔧 Repair ${titleIcon} ${escape(SHIP_PART_NAMES[suit]||suit)}</div>
        <div class="action-step"><strong>🔧 Free! (Rice Cooker)</strong> — no cards needed.</div>
        <div class="action-choices" style="margin-top:8px;">
          <button class="primary" onclick="confirmRepair()">&#8617; Confirm Repair (Free)</button>
          <button onclick="cancelRepair()">&#10007; Cancel</button>
        </div>
      </div>`;
    }

    const penaltyExtra=p.repairPenaltyPending?1:0;
    const cards=selectedCards.map(id=>p.tableau.find(c=>c.instanceId===id)||p.hand.find(c=>c.instanceId===id)).filter(Boolean);
    const sameSuitCards=cards.filter(c=>c.suit===suit||c.suit==='wild');
    const isValid=penaltyExtra>0
      ? cards.length===2 && sameSuitCards.length>=1
      : cards.length===1 && sameSuitCards.length===1;
    const instrText=penaltyExtra>0
      ? `Select 1 ${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]||suit} card <strong>+</strong> 1 any-suit card (hand or tableau) <span style="color:#f88;">⚠️ Repair Penalty</span>`
      : `Select 1 ${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]||suit} card from hand or tableau.`;
    return `<div class="action-panel repair-panel">
      <div class="action-panel-title">🔧 Repair ${titleIcon} ${escape(SHIP_PART_NAMES[suit]||suit)}</div>
      <div class="action-step">${instrText}</div>
      <div class="action-step">Selected: ${selectedCards.length} card${selectedCards.length!==1?'s':''} ${cards.length>0?('('+cards.map(c=>escape(c.title)).join(', ')+')'):''}${isValid?' ✓':''}</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="confirmRepair()" ${isValid?'':'disabled'}>&#8617; Confirm Repair</button>
        <button onclick="cancelRepair()">&#10007; Cancel</button>
      </div>
    </div>`;
  }

  // ── Ability card picker ─────────────────────────────────────────────────────
  if (pendingAbilityPick) {
    const {mode, candidates} = pendingAbilityPick;
    const labels = {steal:'Steal', attack:'Attack', sneak:'Sneak', block:'Block'};
    const suits = {steal:'engine', attack:'weapons', sneak:'navigation', block:'shield'};
    const suit = suits[mode] || 'neutral';
    return `<div class="action-panel ability-pick-panel">
      <div class="action-panel-title">${SUIT_ICONS[suit]||''} ${labels[mode]||mode} — pick a card to use:</div>
      <div class="ability-pick-grid">
        ${candidates.map(c=>`<button class="ability-pick-btn suit-btn-${c.suit}" onclick="confirmAbilityPick(${c.instanceId})">${escape(c.title)}</button>`).join('')}
      </div>
      <div class="action-choices" style="margin-top:6px;">
        <button onclick="cancelAbilityPick()">&#10007; Cancel</button>
      </div>
    </div>`;
  }

  // ── Build card selection ─────────────────────────────────────────────────────
  if (pendingBuildSelect) {
    const {suit, needed, suitCards, selectedIds} = pendingBuildSelect;
    const ready = selectedIds.length === needed;
    return `<div class="action-panel build-select-panel">
      <div class="action-panel-title">🚀 Upgrade ${escape(SUIT_NAMES[suit]||suit)} — pick ${needed} cards:</div>
      <div class="action-step">You have ${suitCards.length} ${SUIT_ICONS[suit]} cards. Select exactly ${needed} to use for upgrading.</div>
      <div class="action-step">Selected: ${selectedIds.length}/${needed}${ready?' ✓':''}</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="confirmBuildSelect()" ${ready?'':'disabled'}>&#9654; Confirm Selection</button>
        <button onclick="cancelBuildSelect()">&#10007; Cancel</button>
      </div>
    </div>`;
  }

  // ── Junkyard Shop — multi-select up to 2 ───────────────────────────────────
  if (pendingJunkyardShop) {
    const {previewCards, selectedIndices: sel, maxPicks: shopMax=2} = pendingJunkyardShop;
    let html=`<div class="action-panel junk-shop-panel">
      <div class="action-panel-title">🗑️ Junkyard Shop — pick up to ${shopMax} of ${previewCards.length} random card${previewCards.length!==1?'s':''}:</div>
      <div class="junk-shop-grid">`;
    previewCards.forEach(({item}, idx) => {
      const isSel=sel.includes(idx);
      const canSelect=isSel||sel.length<shopMax;
      html+=`<button class="junk-shop-item card card-suit-${item.card.suit}${isSel?' junk-pick-selected':''}" onclick="toggleJunkyardShopCard(${idx})" ${canSelect?'':'disabled'}>
        ${isSel?'&#10003; ':''}${SUIT_ICONS[item.card.suit]} ${escape(item.card.title)}
        <div class="card-symbols">${renderSymbols(item.card.symbols)}</div>
      </button>`;
    });
    if (previewCards.length===0) html+=`<div class="attack-none">No cards in junkyard</div>`;
    html+=`</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="confirmJunkyardShop()" ${sel.length>0?'':'disabled'}>&#10003; Take ${sel.length||''} card${sel.length!==1?'s':''}</button>
        <button onclick="cancelJunkyardShop()">&#10007; Cancel</button>
      </div>
    </div>`;
    return html;
  }


  // ── Defender choice ─────────────────────────────────────────────────────────
  if (pendingDefenderChoice) {
    const {mode, attackerIdx, targetIdx, suit, partIdx, pcIdx} = pendingDefenderChoice;
    const attacker = game.players[attackerIdx];
    const target = game.players[targetIdx];
    // Non-defender clients see a waiting banner; defender handles it in their panel
    if (_mpMode && !_amDefender) {
      return `<div class="action-panel waiting-panel"><div class="waiting-banner">⏳ Waiting for <strong>${escape(target.name)}</strong> to respond…</div></div>`;
    }
    const dfx = getPenaltyEffects(targetIdx);
    const defFab = getShipPartEffects(targetIdx);
    const defBfxR = getBonusEffects(targetIdx);
    const hasShieldCard = target.hand.some(c=>c.suit==='shield'||c.suit==='wild'||(defBfxR.defensiveAttack&&c.suit==='weapons'));
    const canBlock = !dfx.blockDisabled && (defFab.blockEnabled || defBfxR.freeBlock) && hasShieldCard;
    const freeBlockHandCard = (!dfx.blockDisabled && !defFab.blockEnabled && !defBfxR.freeBlock)
      ? target.hand.find(c=>c.power?.effect==='freeBlock') : null;

    const blockBtns = () => {
      if (dfx.blockDisabled) return `<span class="block-note">Block disabled by pirate card</span>`;
      const hasBlockAbility = defFab.blockEnabled || defBfxR.freeBlock;
      let html = '';
      if (hasBlockAbility) {
        html += hasShieldCard
          ? `<button class="primary suit-btn-shield" onclick="defenderBlock()">${icon('shield')} (Reactive) Block</button>`
          : `<button class="suit-btn-shield reactive-block-unavail" disabled>${icon('shield')} (Reactive) Block — no Shield card in hand</button>`;
      } else {
        html += `<button class="suit-btn-shield reactive-block-unavail" disabled>${icon('shield')} (Reactive) Block — no Shield part built</button>`;
      }
      if (freeBlockHandCard) {
        html += `<button class="primary suit-btn-shield" onclick="defenderUseNeutralFreeBlock(${freeBlockHandCard.instanceId})">⚡ ${escape(freeBlockHandCard.title)} → Block</button>`;
      }
      return html;
    };

    if (mode==='callForAid') {
      const suitCards = target.tableau.filter(c=>c.suit===suit);
      return `<div class="action-panel attack-panel pending">
        <div class="action-panel-title">🆘 ${escape(attacker.name)} calls for aid — ${escape(target.name)} must discard a ${SUIT_ICONS[suit]} card!</div>
        <div class="action-step">Pass device to ${escape(target.name)}:</div>
        ${suitCards.length===0
          ? `<div class="attack-none">No ${SUIT_NAMES[suit]} cards in tableau</div>`
          : `<div class="action-step" style="color:#aaa;">Click a card in your tableau below to discard it to the junkyard.</div>`}
      </div>`;
    }

    if (mode==='stealExtra' || mode==='attackExtra') {
      const isExtra = true;
      const dest = mode==='stealExtra' ? "attacker's hand" : 'junkyard';
      const suitLabel = suit ? `${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]}` : 'any';
      return `<div class="action-panel ${mode==='stealExtra'?'steal':'attack'}-panel pending">
        <div class="action-panel-title">${mode==='stealExtra'?icon('engine'):icon('weapons')} ${escape(attacker.name)} gets a bonus — ${escape(target.name)} must give up 1 more card!</div>
        <div class="action-step">Pass device to ${escape(target.name)}:</div>
        <div class="action-step" style="color:#aaa;">Give up a ${suitLabel} card from tableau (click it below).${!suit?' Any card qualifies.':''}</div>
      </div>`;
    }

    if (mode==='attackPiratePart') {
      const targetPc = (target.pirateCards||[])[pcIdx];
      return `<div class="action-panel attack-panel pending">
        <div class="action-panel-title">${icon('weapons')} ${escape(attacker.name)} is attacking ${escape(target.name)}'s ${icon('pirate')} ${escape(targetPc?.upside?.title||'pirate part')}!</div>
        <div class="action-step">Pass device to ${escape(target.name)}:</div>
        <div class="action-choices" style="margin-top:8px;">
          ${blockBtns()}
          <button class="danger" onclick="defenderSacrificeForPiratePart()">&#10007; Accept (pirate part disabled)</button>
        </div>
      </div>`;
    }

    if (mode==='attackPart') {
      return `<div class="action-panel attack-panel pending">
        <div class="action-panel-title">${icon('weapons')} ${escape(attacker.name)} is attacking ${escape(target.name)}'s ${escape(target.shipParts[partIdx]?.title||'ship part')}!</div>
        <div class="action-step">Pass device to ${escape(target.name)}:</div>
        <div class="action-choices" style="margin-top:8px;">
          ${blockBtns()}
          <button class="danger" onclick="defenderSacrificeForPart()">&#10007; Accept (take damage)</button>
        </div>
      </div>`;
    }

    const {handTarget, specificCardId} = pendingDefenderChoice;
    const isSteal = mode==='steal';
    const action = isSteal ? 'steal' : 'attack';
    const canBribe = defBfxR.bribe && target.pirateTokens >= 2;

    // Specific card targeted — no defender choice for which card, just accept or block
    if (specificCardId && !handTarget) {
      const targetedCard = target.tableau.find(c=>c.instanceId===specificCardId);
      const verb = isSteal ? 'stolen by' : 'destroyed by';
      return `<div class="action-panel ${isSteal?'steal':'attack'}-panel pending">
        <div class="action-panel-title">${isSteal?icon('engine'):icon('weapons')} ${escape(attacker.name)} targets <strong>${escape(targetedCard?.title||'a card')}</strong> — it will be ${verb} ${escape(attacker.name)}</div>
        <div class="action-step">Pass device to ${escape(target.name)}:</div>
        <div class="action-choices" style="margin-top:8px;">
          ${blockBtns()}
          ${canBribe ? `<button class="suit-btn-navigation" onclick="useBribe()">💰 Bribe — redirect (2 ${icon('pirate')})</button>` : ''}
          <button class="danger" onclick="defenderAccept()">&#10003; Accept</button>
        </div>
      </div>`;
    }

    const vulnerable = dfx.stealVulnerable && isSteal;
    const titleSuit = suit ? `${SUIT_ICONS[suit]} ` : '✋ ';
    const giveUpNote = suit
      ? `Give up a ${SUIT_NAMES[suit]||suit} card from tableau (click it below)`
      : `Give up any card from tableau (click it below)`;

    return `<div class="action-panel ${isSteal?'steal':'attack'}-panel pending">
      <div class="action-panel-title">${isSteal?icon('engine'):icon('weapons')} ${escape(attacker.name)} ${action}s ${titleSuit}from ${escape(target.name)}!</div>
      <div class="action-step">Pass device to ${escape(target.name)}:${vulnerable?' (stealVulnerable — attacker will choose for you)':''}</div>
      <div class="action-choices" style="margin-top:8px;">
        ${blockBtns()}
        ${canBribe ? `<button class="suit-btn-navigation" onclick="useBribe()">💰 Bribe — redirect (2 ${icon('pirate')})</button>` : ''}
      </div>
      <div class="action-step" style="margin-top:6px;color:#aaa;">${giveUpNote}</div>
    </div>`;
  }

  // ── Junkyard pick ───────────────────────────────────────────────────────────
  if (pendingJunkyardPick) {
    const {allCards, selectedIndices, maxPicks, fromSneak, bonusMarketPick} = pendingJunkyardPick;
    const remaining = maxPicks - selectedIndices.length;
    const pickLabel = fromSneak
      ? `&#128465; Junkyard — pick up to ${maxPicks} free card${maxPicks!==1?'s':''} (Sneak):`
      : `&#128465; Junkyard — pick up to ${maxPicks} card${maxPicks!==1?'s':''}:`;
    const bonusNote = bonusMarketPick ? `<div class="action-step" style="color:#fc9;">&#9749; Coffee Machine: you'll also pick 1 free card from market after</div>` : '';
    let html = `<div class="action-panel junk-pick-panel">
      <div class="action-panel-title">${pickLabel}</div>
      ${bonusNote}
      <div class="action-choices junk-pick-row">`;
    allCards.forEach(({idx, item}) => {
      if (item.type!=='card') return;
      const isSel = selectedIndices.includes(idx);
      const canSelect = isSel || selectedIndices.length < maxPicks;
      html += `<button class="junk-pick-item card card-suit-${item.card.suit}${isSel?' junk-pick-selected':''}" onclick="selectJunkyardItem(${idx})" ${canSelect?'':'disabled'}>
        ${isSel?'&#10003; ':''}${SUIT_ICONS[item.card.suit]} ${escape(item.card.title)}
        <div class="card-symbols">${renderSymbols(item.card.symbols)}</div>
      </button>`;
    });
    if (allCards.filter(x=>x.item.type==='card').length===0) html+=`<div class="attack-none">No cards in junkyard</div>`;
    html += `</div>
      <div class="action-choices" style="margin-top:6px;">
        <button class="primary" onclick="confirmJunkyardPick()" ${selectedIndices.length>0?'':'disabled'}>&#10003; Take ${selectedIndices.length||''} card${selectedIndices.length!==1?'s':''}</button>
        <button onclick="cancelJunkyardPick()">&#10007; Skip</button>
      </div>
    </div>`;
    return html;
  }


  // ── Scavenger — take destroyed card for 1 token ────────────────────────────
  if (pendingScavenger) {
    const {card, candidates} = pendingScavenger;
    const takerIdx = candidates[0];
    const taker = game.players[takerIdx];
    return `<div class="action-panel scavenger-panel">
      <div class="action-panel-title">🦝 Scavenger — take <strong>${escape(card.title)}</strong> for 1 ${icon('pirate')}?</div>
      <div class="action-step">${escape(taker.name)}: ${icon('pirate')} ${taker.pirateTokens} available</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="confirmScavenge()">&#10003; Scavenge (1 ${icon('pirate')})</button>
        <button onclick="skipScavenge()">&#10007; Skip</button>
      </div>
    </div>`;
  }

  // ── Double Agent — assign downside to opponent ──────────────────────────────
  if (pendingDoubleAgent) {
    const {slot} = pendingDoubleAgent;
    const down = slot.downside;
    return `<div class="action-panel double-agent-panel">
      <div class="action-panel-title">🕵️ Double Agent — give downside to an opponent?</div>
      <div class="action-step">Downside: <strong>${escape(down?.title||'?')}</strong> — ${escape(down?.downsideDesc||'')}</div>
      <div class="action-step" style="margin-top:8px;">Pick an opponent to receive the downside, or keep it yourself:</div>
      <div class="action-choices" style="margin-top:6px;">
        ${game.players.map((pl,i)=>i===game.currentPlayerIndex?'':`<button class="action-player-btn" onclick="confirmDoubleAgent(${i})">${escape(pl.name)}</button>`).join('')}
      </div>
      <button onclick="cancelDoubleAgent()" style="margin-top:8px;">&#10007; Keep downside myself</button>
    </div>`;
  }

  // ── Second Chance — use another ability? ────────────────────────────────────
  if (pendingSecondChance) {
    return `<div class="action-panel second-chance-panel">
      <div class="action-panel-title">🎱 Second Chance — use another ability?</div>
      <div class="action-step">You may immediately use one more ability (different from <strong>${escape(pendingSecondChance.firstAbility)}</strong>).</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="useSecondChance()">&#9654; Use Second Ability</button>
        <button onclick="skipSecondChance()">&#10007; Skip — end turn</button>
      </div>
    </div>`;
  }

  // ── Bribe — redirect incoming attack to another player ─────────────────────
  if (pendingBribeTarget) {
    const {savedChoice} = pendingBribeTarget;
    return `<div class="action-panel bribe-panel">
      <div class="action-panel-title">💰 Bribe — redirect attack to which player?</div>
      <div class="action-step">Choose a new target to receive the incoming ${savedChoice.mode}:</div>
      <div class="action-choices" style="margin-top:8px;">
        ${game.players.map((pl,i)=>{
          if(i===pendingBribeTarget?.savedChoice?.targetIdx) return '';
          if(i===pendingBribeTarget?.savedChoice?.attackerIdx) return '';
          return `<button class="action-player-btn" onclick="confirmBribeTarget(${i})">${escape(pl.name)}</button>`;
        }).join('')}
      </div>
      <button onclick="cancelBribe()" style="margin-top:8px;">&#10007; Cancel Bribe (keep tokens)</button>
    </div>`;
  }

  // ── Raid: pick target ─────────────────────────────────────────────
  if (pendingCallForAid && pendingCallForAid.mode==='attack' && pendingCallForAid.targetIdx===null) {
    const bfxRaid = getBonusEffects(game.currentPlayerIndex);
    const raidP = currentPlayer();
    const canCorsair = bfxRaid.corsair && raidP.pirateTokens >= RAID_COST + 1;
    let html = `<div class="action-panel call-for-aid-panel">
      <div class="action-panel-title">🏴‍☠️ Raid — pick a target:</div>`;
    if (canCorsair) {
      html += `<div class="action-step" style="color:#fc9;">⚡ <strong>Corsair</strong> available — raid all opponents at once for ${RAID_COST+1} ${icon('pirate')}:</div>
      <div class="action-choices"><button class="primary" onclick="startCorsairRaid()">⚡ Corsair Raid — all opponents (${RAID_COST+1} ${icon('pirate')})</button></div>
      <div class="action-step" style="margin-top:6px;color:#aaa;">Or pick one target for a regular Raid:</div>`;
    }
    html += `<div class="action-choices">`;
    game.players.forEach((p,idx) => {
      if (idx===game.currentPlayerIndex) return;
      const hasSomething = p.tableau.length>0;
      html += `<button class="action-player-btn" onclick="selectCallForAidTarget(${idx})" ${hasSomething?'':'disabled'}>
        ${escape(p.name)} (${p.tableau.length} tableau card${p.tableau.length!==1?'s':''})
      </button>`;
    });
    html += `</div><button onclick="cancelCallForAid()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
    return html;
  }

  // ── Raid: pick suit ──────────────────────────────────────────────────
  if (pendingCallForAid && pendingCallForAid.mode==='attack' && pendingCallForAid.targetIdx!==null) {
    const target = game.players[pendingCallForAid.targetIdx];
    const suitCounts = {};
    SUITS.forEach(s=>{ suitCounts[s]=target.tableau.filter(c=>c.suit===s).length; });
    let html = `<div class="action-panel call-for-aid-panel">
      <div class="action-panel-title">🏴‍☠️ Raid on ${escape(target.name)} — pick a suit column:</div>
      <div class="action-choices">`;
    SUITS.forEach(suit=>{
      const n=suitCounts[suit];
      html+=`<button class="action-suit-btn suit-btn-${suit}" onclick="selectCallForAidSuit('${suit}')" ${n>0?'':'disabled'}>
        ${SUIT_ICONS[suit]} ${SUIT_NAMES[suit]} (${n})
      </button>`;
    });
    html+=`</div><button onclick="cancelCallForAid()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
    return html;
  }

  // ── Steal: pick target ──────────────────────────────────────────────────────
  if (pendingSteal && pendingSteal.targetIdx===null) {
    const stealer = game.players[pendingSteal.stealerIdx];
    let html = `<div class="action-panel steal-panel">
      <div class="action-panel-title">${icon('engine')} ${escape(stealer.name)} is stealing — pick a target:</div>
      <div class="action-choices">`;
    game.players.forEach((p,idx) => {
      if (idx===pendingSteal.stealerIdx) return;
      const hasSomething = p.tableau.length>0;
      html += `<button class="action-player-btn" onclick="selectStealTarget(${idx})" ${hasSomething?'':'disabled'}>
        ${escape(p.name)} (${p.tableau.length} tableau card${p.tableau.length!==1?'s':''})
      </button>`;
    });
    html += `</div><button class="danger" onclick="cancelSteal()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
    return html;
  }

  // ── Steal: pick specific card ───────────────────────────────────────────────
  if (pendingSteal && pendingSteal.targetIdx!==null) {
    const stealer = game.players[pendingSteal.stealerIdx];
    const target  = game.players[pendingSteal.targetIdx];
    const hasHand = target.hand.length > 0;
    const hasTokens = target.pirateTokens > 0;
    let html = `<div class="action-panel steal-panel">
      <div class="action-panel-title">${icon('engine')} Steal from ${escape(target.name)} — pick a card:</div>
      <div class="steal-target-grid">
        <div class="steal-col"><div class="attack-col-label">Steal from tableau</div>`;
    if (target.tableau.length === 0) {
      html += `<div class="attack-none">No tableau cards</div>`;
    } else {
      target.tableau.forEach(card => {
        html += `<button class="attack-choice-btn suit-btn-${card.suit}" onclick="selectStealCard(${card.instanceId})">
          ${SUIT_ICONS[card.suit]||''} ${escape(card.title)}
        </button>`;
      });
    }
    html += `</div><div class="steal-col"><div class="attack-col-label">Other options</div>`;
    if (target.tableau.length === 0) {
      html += `<button class="attack-choice-btn" onclick="selectStealHand()" ${hasHand?'':'disabled'}>
        ✋ Steal from hand <span class="steal-blind-note">(defender picks)</span>
      </button>`;
    }
    html += `<button class="attack-choice-btn" onclick="stealPirateToken()" ${hasTokens?'':'disabled'}>
      ${icon('pirate')} Steal 1 pirate token ${hasTokens?`(${target.pirateTokens} available)`:'(none)'}
    </button>`;
    html += `</div></div><button class="danger" onclick="cancelSteal()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
    return html;
  }

  // ── Attack: pick target ─────────────────────────────────────────────────────
  if (pendingAttack && pendingAttack.targetIdx===null) {
    const attacker = game.players[pendingAttack.attackerIdx];
    let html = `<div class="action-panel attack-panel">
      <div class="action-panel-title">${icon('weapons')} ${escape(attacker.name)} is attacking — pick a target:</div>
      <div class="action-choices">`;
    game.players.forEach((p,idx) => {
      if (idx===pendingAttack.attackerIdx) return;
      const hasSomething = p.tableau.length>0 || p.shipParts.some(sp=>!sp.damaged);
      html += `<button class="action-player-btn" onclick="selectAttackTarget(${idx})" ${hasSomething?'':'disabled'}>
        ${escape(p.name)} (${p.tableau.length} tableau, ${countActiveShipParts(idx)} parts)
      </button>`;
    });
    html += `</div><button class="danger" onclick="cancelAttack()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
    return html;
  }

  // ── Not my turn in multiplayer — show waiting banner ─────────────────────
  if (!_isMyTurn) {
    return `<div class="action-panel waiting-panel"><div class="waiting-banner">⏳ Waiting for <strong>${escape(currentPlayer().name)}</strong> to finish their turn…</div></div>`;
  }

  // ── Build hand cost — prompt shown via inline buttons on hand cards ─────────
  if (pendingBuildHandCost) {
    const {suit} = pendingBuildHandCost;
    return `<div class="action-panel build-select-panel">
      <div class="action-panel-title">🚀 Build ${escape(SUIT_NAMES[suit]||suit)} — pay 1 hand card (→ junkyard):</div>
      <div class="action-step">Click <strong>💸 Pay</strong> on any card in your hand below.</div>
      <div class="action-choices" style="margin-top:8px;">
        <button onclick="cancelBuildHandCost()">&#10007; Cancel</button>
      </div>
    </div>`;
  }

  // ── Salvage choice — scrap or tech ─────────────────────────────────────────
  if (pendingSalvageChoice) {
    return `<div class="action-panel action-panel-mini">
      <div class="action-panel-title">⚙️ Salvage — what do you gain?</div>
      <div class="action-choices" style="margin-top:8px;">
        <button class="primary" onclick="doSalvage('scrap')">+2 ${SCRAP_ICON} Scrap</button>
        <button class="primary" onclick="doSalvage('tech')">+1 ${TECH_ICON} Tech</button>
        <button onclick="cancelSalvage()">&#10007; Cancel</button>
      </div>
    </div>`;
  }

  // ── Attack: pick suit or ship part ──────────────────────────────────────────
  if (pendingAttack && pendingAttack.targetIdx!==null) {
    const attacker = game.players[pendingAttack.attackerIdx];
    const target   = game.players[pendingAttack.targetIdx];
    const attackerDfx = getPenaltyEffects(pendingAttack.attackerIdx);
    const suitCounts = {};
    SUITS.forEach(s=>{ suitCounts[s]=target.tableau.filter(c=>c.suit===s).length; });
    const hasHand = target.hand.length > 0;
    const hasTokens = target.pirateTokens > 0;
    let html = `<div class="action-panel attack-panel">
      <div class="action-panel-title">${icon('weapons')} ${escape(attacker.name)} attacks ${escape(target.name)} — what to target?</div>
      <div class="attack-choices-grid">
        <div class="attack-col">
          <div class="attack-col-label">${icon('weapons')} Destroy a Card</div>`;
    if (target.tableau.length === 0) {
      html+=`<div class="attack-none">No tableau cards</div>`;
      html+=`<button class="attack-choice-btn" onclick="selectAttackHand()" ${hasHand?'':'disabled'}>
        ✋ Attack hand card <span class="steal-blind-note">(defender picks)</span>
      </button>`;
    } else {
      target.tableau.forEach(card=>{
        html+=`<button class="attack-choice-btn suit-btn-${card.suit}" onclick="selectAttackCard(${card.instanceId})">${SUIT_ICONS[card.suit]||''} ${escape(card.title)}</button>`;
      });
    }
    html+=`<button class="attack-choice-btn" onclick="attackPirateToken()" ${hasTokens?'':'disabled'}>
      💀 Destroy 1 pirate token ${hasTokens?`(${target.pirateTokens} available)`:'(none)'}
    </button>`;
    html+=`</div><div class="attack-col"><div class="attack-col-label">${icon('weapons')} Damage Ship Part</div>`;
    if(attackerDfx.weakAttack){
      html+=`<div class="attack-none">Disabled (weak attack)</div>`;
    } else {
      const activeParts=target.shipParts.filter(sp=>!sp.damaged);
      if(activeParts.length===0) html+=`<div class="attack-none">No active ship parts</div>`;
      else activeParts.forEach(part=>{
        const actualIdx=target.shipParts.indexOf(part);
        html+=`<button class="attack-choice-btn suit-btn-${part.suit}" onclick="attackShipPart(${actualIdx})">${SUIT_ICONS[part.suit]} ${escape(part.title)}</button>`;
      });
      (target.pirateCards||[]).forEach((pc,pcIdx)=>{
        if (!pc.upside || pc.damaged) return;
        html+=`<button class="attack-choice-btn suit-btn-${pc.upside.suit}" onclick="attackShipPart(-${pcIdx+1000})">${icon('pirate')} ${escape(pc.upside.title)}</button>`;
      });
    }
    html+=`</div></div><button class="danger" onclick="cancelAttack()" style="margin-top:8px;">&#10007; Cancel</button></div>`;
    return html;
  }

  return '';
}

// ===== Pirate section =====

function renderPirateSection() {
  const p = currentPlayer();
  const anyPending = anyBlocking();
  const isActive = currentPhase==='action'&&!anyPending&&!pendingDiscard&&!sellMode&&actionsRemaining>0;

  let html = `<div class="pirate-header">${icon('pirate')} Space Pirates</div><div class="pirate-body">`;

  const pirateDeckCount = (game.pirateDeck||[]).length;
  html += `<div class="pirate-market"><div class="pirate-market-label">Pirate Market — Smuggle a permanent ship part</div><div class="pirate-cards-row">`;
  html += `<div class="deck-pile-wrapper">
    <div class="card-holo-wrap rarity-uncommon suit-pirate">
      <div class="card hidden-card deck-pile-card">
        <div class="card-stars"></div>
        <div class="card-back-center">${icon('pirate')}</div>
        <div class="deck-count-badge">${pirateDeckCount}</div>
        <div class="card-logo">HAMSTERS &middot; IN &middot; SPACE</div>
      </div>
    </div>
    <div class="deck-pile-label">PIRATES</div>
  </div>`;
  let anySlots = false;
  game.pirateMarket.forEach((slot, idx) => {
    if (!slot) return;
    anySlots = true;
    const up = slot.upside;
    const canBuy = isActive && p.pirateTokens>=up.pirateTokenCost
      && !p.shipParts.some(sp=>sp.suit===up.suit)
      && !(p.pirateCards||[]).some(pc=>pc.upside?.suit===up.suit);
    html += `<div class="card-holo-wrap rarity-uncommon suit-pirate">
    <div class="card card-suit-pirate pirate-market-card">
      <div class="card-stripe card-stripe-pirate"></div>
      <div class="card-cost-pill"><span class="cn">${up.pirateTokenCost}</span>${icon('pirate')}</div>
      ${makeArtElement(up.id, up.title, up.suit, null)}
      <div class="card-title-below">${escape(up.title)}</div>
      ${up.iconText?`<div class="card-icon-text">${escape(up.iconText)}</div>`:''}
      <div class="pirate-part-band pirate-part-band-${up.suit}">${SUIT_ICONS[up.suit]} ${escape(SUIT_NAMES[up.suit]||up.suit)}</div>
      <div class="card-power-text pirate-bonus-power">${escape(up.bonusDesc)}</div>
      <div class="card-desc pirate-downside">&#10067; Downside revealed on purchase</div>
      <div class="card-actions">
        <button class="${canBuy?'primary':''}" onclick="buyPirateCard(${idx})" ${canBuy?'':'disabled'}>Smuggle (${up.pirateTokenCost} ${icon('pirate')})</button>
      </div>
      <div class="card-suit-footer"><span class="suit-badge suit-pirate">${icon('pirate')} Pirate</span></div>
    </div></div>`;
  });
  if (!anySlots && pirateDeckCount===0) html += `<div class="pirate-empty">All pirate parts purchased this game</div>`;
  html += `</div>`;
  if (anySlots || game.pirateDeck.length>0) html += `<div class="market-redraw-bar"><button class="redraw-btn" onclick="redrawPirateMarket()" title="Replace visible pirate cards with new ones from the deck">🔄 Redraw Pirates</button></div>`;
  html += `</div>`;

  const bfx=getBonusEffects(game.currentPlayerIndex);
  const junkCards = game.junkyard.filter(i=>i.type==='card');
  const removedCount = (game.removed||[]).length;
  html += `<div class="pirate-right">`;
  html += `<div class="pirate-junkyard-section">`;
  html += `<div class="pile-display-col">
    ${renderPileDisplay(junkCards.length, 'JUNKYARD')}
    ${renderPileDisplay(removedCount, 'REMOVED', 'destroyed-pile')}
  </div>`;
  html += `</div>`;

  html += `</div>`;
  html += `</div>`;
  return html;
}

// ===== Player panel =====

function renderPlayerPanel(p, idx, isCurrent, passPlay) {
  // Multiplayer identity — must be declared before any use below
  const mpMode   = typeof window.myPlayerIndex === 'number';
  const isMyPanel = !mpMode || idx === window.myPlayerIndex;

  const partsNeeded = config.rules.shipPartsToWin||3;
  const dfx = getPenaltyEffects(idx); const fab = getShipPartEffects(idx); const bfx = getBonusEffects(idx);
  const isDefenderTarget = pendingDefenderChoice && idx===pendingDefenderChoice.targetIdx;
  const anyPending = anyBlocking();
  const activeCount = countActiveShipParts(idx);
  const limit = (config.rules.handSizeLimit||4)+(dfx.handLimitMod||0);

  let html = `<div class="player-panel${isCurrent?' current':''}${isDefenderTarget?' attack-target':''}">`;

  // Header
  html += `<div class="player-header">
    <h3>${isCurrent?'&#9654; ':''}${escape(p.name)}${isCurrent?(isMyPanel?' (your turn)':' (their turn)'):''}${isDefenderTarget?' &#127919; must respond!':''}</h3>
    <div class="player-stats">
      <span class="pirate-token-chip">${icon('pirate')} ${p.pirateTokens}</span>
      ${renderResourcesWithPending(p)}
      <div>${activeCount}/${partsNeeded} parts</div>
    </div>
  </div>`;

  // Progress row: ship parts + build options
  html += `<div class="player-progress">`;

  html += `<div class="progress-col progress-col-parts">`;
  html += `<div class="progress-section-label">Completed Ship Parts</div>`;
  html += `<div class="ship-parts-row">`;
  SUITS.forEach(suit => {
    const reg = p.shipParts.find(sp=>sp.suit===suit);
    const pir = (p.pirateCards||[]).find(pc=>pc.upside?.suit===suit);
    const title = pir?pir.upside.title : reg?reg.title:'';
    const powerTip = reg&&reg.power ? ` | Power: ${reg.power.text}` : '';
    if (pir) {
      const pirDisabledClass = pir.damaged ? ' part-disabled' : '';
      const pirDisabledTip   = pir.damaged ? ' (disabled)' : '';
      const pirIcon = pir.damaged ? '⛔️' : icon('pirate');
      html += `<div class="ship-part filled suit-${suit}${pirDisabledClass}" title="${escape(title)}${pirDisabledTip}${escape(powerTip)}">${pirIcon}</div>`;
    } else if (reg&&!reg.damaged) {
      const disabledClass = reg.disabled ? ' part-disabled' : '';
      const disabledTip   = reg.disabled ? ' (disabled)' : '';
      const regIcon = reg.disabled ? '⚠️' : SUIT_ICONS[suit];
      html += `<div class="ship-part filled suit-${suit}${disabledClass}" title="${escape(title)}${disabledTip}${escape(powerTip)}">${regIcon}</div>`;
    } else if (reg&&reg.damaged) {
      html += `<div class="ship-part part-damaged suit-${suit}" title="${escape(title)} (damaged)${escape(powerTip)}">${icon('damage')}</div>`;
    } else {
      html += `<div class="ship-part empty">?</div>`;
    }
  });
  html += `</div>`;
  html += `<div class="progress-hint">Craft/Buy any 3 to win</div></div>`;

  const canRepair   = isCurrent&&isMyPanel&&currentPhase==='action'&&!anyPending&&!pendingDiscard&&!sellMode&&actionsRemaining>0&&!pendingRepair;
  const buildCost = Math.max(1, (config.rules.buildSameSuitCount||3)+(dfx.buildCostMod||0)-(bfx.buildFast?1:0));

  html += `<div class="progress-col"><div class="progress-section-label">Upgrade Options</div><div class="components-compact">`;
  SUITS.forEach(suit => {
    const alreadyHasRegular      = p.shipParts.some(sp=>sp.suit===suit&&!sp.damaged&&!sp.disabled);
    const alreadyHasPirateActive = (p.pirateCards||[]).some(pc=>pc.upside?.suit===suit&&!pc.damaged);
    const hasDamagedPirate       = (p.pirateCards||[]).some(pc=>pc.upside?.suit===suit&&pc.damaged);
    const hasBrokenRegular       = p.shipParts.some(sp=>sp.suit===suit&&(sp.damaged||sp.disabled));
    const count = p.tableau.filter(c=>c.suit===suit||(c.suit==='wild'&&c.assignedSuit===suit)).length;
    const ready = count>=buildCost && !alreadyHasRegular && !alreadyHasPirateActive && !hasDamagedPirate;
    if (alreadyHasRegular||alreadyHasPirateActive) return;
    html += `<div class="comp-entry suit-${suit}"><span class="comp-icon">${SUIT_ICONS[suit]}</span>`;
    if (hasDamagedPirate && isCurrent && isMyPanel && canRepair) {
      const bfxRepair=getBonusEffects(game.currentPlayerIndex);
      const repairTip=bfxRepair.repairCheap?'Free':'1 same-suit card (hand or tableau)';
      html += `<button class="comp-build-btn suit-btn-${suit}" onclick="startPirateRepair('${suit}')" title="${repairTip}">&#8617; Repair ${icon('pirate')}</button>`;
    } else if (hasBrokenRegular && isCurrent && isMyPanel && canRepair) {
      const bfxRepair=getBonusEffects(game.currentPlayerIndex);
      const repairTip=bfxRepair.repairCheap?'Free':'1 same-suit card (hand or tableau)';
      html += `<button class="comp-build-btn suit-btn-${suit}" onclick="startRepair('${suit}')" title="${repairTip}">&#8617; Repair</button>`;
    } else if (ready) {
      if (isCurrent && isMyPanel && currentPhase==='action' && !anyPending && !pendingDiscard && actionsRemaining>0) {
        html += `<button class="comp-build-btn suit-btn-${suit}" onclick="buildFromTableau('${suit}')">&#9654; Build</button>`;
      } else {
        html += `<span class="comp-count-text ready" title="Build during your action phase">&#9654; Ready!</span>`;
      }
    } else {
      html += `<span class="comp-count-text">${count}/${buildCost}</span>`;
    }
    html += `</div>`;
  });
  html += `</div><div class="progress-hint">Complete ${buildCost} same-suit in tableau — build during your action phase</div></div>`;
  html += `</div>`; // close player-progress

  // Active ship part powers (all regular parts)
  if (p.shipParts.length > 0) {
    html += `<div class="ship-part-powers">`;
    p.shipParts.forEach(sp => {
      const suspended = sp.damaged || sp.disabled;
      html += `<div class="ship-part-power-box suit-${sp.suit}${suspended?' power-suspended':''}">
        <span class="ship-part-power-title">${SUIT_ICONS[sp.suit]} ${escape(sp.title)}${sp.damaged?' <em>(damaged)</em>':sp.disabled?' <em>(disabled)</em>':''}</span>
        ${sp.power ? `<span class="ship-part-power-bonus">${escape(sp.power.text)}</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Pirate cards owned
  if ((p.pirateCards||[]).length>0) {
    html += `<div class="pirate-cards-owned">`;
    p.pirateCards.forEach((pc)=>{
      if (!pc.upside) {
        // doubleAgent gave us only the downside
        html += `<div class="pirate-card-owned suit-shield">
          <span class="pirate-owned-suit">${icon('pirate')}</span>
          <span class="pirate-owned-title">${icon('pirate')} Pirate Curse <em>(Double Agent)</em></span>
          ${pc.downside?`<span class="pirate-owned-downside">&#9888; ${escape(pc.downside.downsideDesc)}</span>`:''}
        </div>`;
        return;
      }
      const dmg = pc.damaged;
      html += `<div class="pirate-card-owned suit-${pc.upside.suit}${dmg?' pirate-disabled':''}">
        <span class="pirate-owned-suit">${SUIT_ICONS[pc.upside.suit]}</span>
        <span class="pirate-owned-title">${icon('pirate')} ${escape(pc.upside.title)}${dmg?' <em>[DAMAGED]</em>':''}</span>
        ${dmg?'':`<span class="pirate-owned-bonus">&#9670; ${escape(pc.upside.bonusDesc)}</span>`}
        ${dmg?`<span class="pirate-owned-downside" style="color:#aaa;"><em>Effects suspended while damaged</em></span>`:pc.downside?`<span class="pirate-owned-downside">&#9888; ${escape(pc.downside.downsideDesc)}</span>`:`<span class="pirate-owned-downside" style="color:#aaa;"><em>No downside</em></span>`}
      </div>`;
    });
    html += `</div>`;
  }

  // Discard phase banner
  if (isCurrent && isMyPanel && pendingDiscard) {
    html += `<div class="turn-actions"><div class="discard-phase-banner">&#9888; Discard ${p.hand.length-limit} card${p.hand.length-limit!==1?'s':''} — hand limit is ${limit}</div></div>`;
  }

  // Phase controls for current player (only shown on that player's own device in multiplayer)
  if (isCurrent && isMyPanel && !pendingDiscard && !anyPending) {
    if (sellMode) {
      const count = sellSelection.length;
      const sellBfx = getBonusEffects(game.currentPlayerIndex);
      const isLiquidator = !!sellBfx.liquidator;
      const canConfirmSell = isLiquidator ? count >= 1 : count === 1;
      const sellLabel = isLiquidator
        ? `${icon('pirate')} Trade to Pirates — select any number of cards (${count} selected) · Liquidator`
        : `${icon('pirate')} Trade to Pirates — select exactly 1 card (${count}/1)`;
      const tokenLabel = isLiquidator
        ? `${count} ${icon('pirate')} (1 per card)`
        : `${sellBfx.sellBonus?(config.rules.sellBonusTokens||3):(config.rules.sellTokens||1)} ${icon('pirate')}`;
      html += `<div class="turn-actions sell-mode-banner">
        <span class="sell-mode-label">${sellLabel}</span>
        <button class="primary" onclick="confirmSell()" ${canConfirmSell?'':'disabled'}>&#10003; Trade → ${tokenLabel}</button>
        <button onclick="cancelSell()">&#10007; Cancel</button>
      </div>`;
    } else if (currentPhase==='action') {
      const canSteal = fab.stealEnabled && p.hand.some(c=>c.suit==='engine'||c.suit==='wild') && game.players.length>1;
      const canAttack = fab.attackEnabled && p.hand.some(c=>c.suit==='weapons'||c.suit==='wild') && game.players.length>1;
      const canSneak = fab.sneakEnabled && p.hand.some(c=>c.suit==='navigation'||c.suit==='wild') && !dfx.navDisabled;
      const canAid = p.pirateTokens>=RAID_COST;
      const canSabotage = bfx.sabotage && !p.sabotageUsedThisTurn && p.pirateTokens>=1 && game.cardMarket.some(Boolean);
      const actionsLeft = actionsRemaining;
      const noActions = actionsLeft <= 0;

      html += `<div class="turn-actions">`;
      html += `<div class="action-group action-counter-group">`;
      html += `<span class="action-counter-label">Actions: <strong>${actionsLeft}/2</strong> remaining</span>`;
      html += `<button class="primary" onclick="startBuyPhase()">&#10003; Done &#8594; Resupply</button>`;
      html += `</div>`;

      html += `<div class="action-group"><span class="action-group-label">Deploy</span>`;
      html += `<span class="action-group-hint">Play a card from hand to tableau — gains resources immediately</span>`;
      html += `</div>`;

      html += `<div class="action-group"><span class="action-group-label">Abilities</span>`;
      html += `<button class="suit-btn-engine ability-btn" onclick="useStealAbility()" ${canSteal&&!noActions?'':'disabled'}>${icon('engine')} Steal</button>`;
      html += `<button class="suit-btn-weapons ability-btn" onclick="useAttackAbility()" ${canAttack&&!noActions?'':'disabled'}>${icon('weapons')} Attack</button>`;
      html += `<button class="suit-btn-navigation ability-btn" onclick="useSneakAbility()" ${canSneak&&!noActions?'':'disabled'}>${icon('nav')} Sneak</button>`;
      html += `<button onclick="startSalvage()" ${!noActions?'':'disabled'}>⚙️ Salvage</button>`;
      html += `</div>`;

      html += `<div class="action-group"><span class="action-group-label">Pirate</span>`;
      html += `<button onclick="enterSellMode()" ${!noActions&&!dfx.sellDisabled?'':'disabled'}>${icon('pirate')} Sell</button>`;
      html += `<button onclick="useRaid()" ${canAid?'':'disabled'}>🏴‍☠️ Raid (${RAID_COST} ${icon('pirate')})</button>`;
      if (bfx.sabotage) html += `<button onclick="useSabotage()" ${canSabotage&&!noActions?'':'disabled'}>🗑️ Sabotage (1 ${icon('pirate')})</button>`;
      html += `</div>`;

      if (passPlay) html += `<button onclick="toggleHand()">${currentHandHidden?'Show':'Hide'} My Hand</button>`;
      html += `</div>`;
    }
    // buy phase: buy UI is in card market section
  }

  // Hand (above tableau)
  const SUIT_SORT={engine:0,weapons:1,navigation:2,shield:3,neutral:4};
  const sortedHand=[...p.hand].sort((a,b)=>{ const sa=SUIT_SORT[a.suit]??4,sb=SUIT_SORT[b.suit]??4; return sa!==sb?sa-sb:(a.cardId||'').localeCompare(b.cardId||''); });
  // mpMode/isMyPanel declared at top of function.
  // In multiplayer: show own hand fully; other players' hands are card backs.
  // In solo/pass-and-play: fall back to passPlay / currentHandHidden logic.
  const showHand = mpMode
    ? isMyPanel
    : (isDefenderTarget || pendingDiscard || !passPlay || (isCurrent && !currentHandHidden));

  html += `<div class="pile"><div class="pile-label">Hand (${p.hand.length}/${limit})</div>`;
  html += `<div class="card-row${p.hand.length===0?' empty':''}">`;
  sortedHand.forEach(card => {
    if (!showHand) {
      html += renderHiddenCard();
    } else if (isCurrent && isMyPanel && pendingDiscard) {
      html += renderCard(card,[{label:'&#10007; Discard',fn:`discardForHandLimit(${card.instanceId})`}],' must-discard');
    } else if (isCurrent && isMyPanel && !anyPending && sellMode) {
      const isSelected=sellSelection.includes(card.instanceId);
      const isLiqSell=getBonusEffects(game.currentPlayerIndex).liquidator;
      const canSelect=isSelected||(isLiqSell?true:sellSelection.length<1);
      html += renderCard(card,[{label:isSelected?'&#10003; Selected':'&#9658; Select',fn:`toggleSellSelection(${card.instanceId})`,primary:isSelected,disabled:!canSelect}],isSelected?' sell-selected':'');
    } else if (isCurrent && isMyPanel && pendingBuildHandCost) {
      // Build cost: any hand card can be paid
      html += renderCard(card,[{label:'💸 Pay',fn:`selectBuildHandCost(${card.instanceId})`,primary:true}],'');
    } else if (isCurrent && isMyPanel && pendingRepair && !getBonusEffects(game.currentPlayerIndex).repairCheap) {
      // Hand cards: same-suit/wild always selectable; any suit also selectable when repair penalty active
      const isRepairSelected = pendingRepair.selectedCards.includes(card.instanceId);
      const canRepairSelect = card.suit===pendingRepair.suit || card.suit==='wild' || !!p.repairPenaltyPending;
      if (canRepairSelect) {
        html += renderCard(card,[{label:isRepairSelected?'&#10003; Selected':'&#9633; Select',fn:`toggleRepairCard(${card.instanceId})`,primary:isRepairSelected}],isRepairSelected?' repair-selected':'');
      } else {
        html += renderCard(card,[],card.instanceId===lastDrawnInstanceId?' newly-drawn':'');
      }
    } else if (isCurrent && isMyPanel && currentPhase==='action' && !anyPending && !pendingDiscard && !sellMode && !pendingBuyPhase) {
      const freeEff = card.power?.effect;
      const canActivate = ['freeAttack','freeSteal','freeSneak','disablePart'].includes(freeEff);
      const handActions = [{label:'&#9654; Play',fn:`playCard(${card.instanceId})`,primary:!canActivate}];
      if (canActivate) handActions.push({label:'⚡ Activate',fn:`useNeutralFreeAction(${card.instanceId})`,primary:true});
      html += renderCard(card, handActions, card.instanceId===lastDrawnInstanceId?' newly-drawn':'');
    } else if (isDefenderTarget && pendingDefenderChoice && (pendingDefenderChoice.mode==='steal'||pendingDefenderChoice.mode==='attack'||pendingDefenderChoice.mode==='stealExtra'||pendingDefenderChoice.mode==='attackExtra')) {
      const {mode:dMode, suit:dSuit} = pendingDefenderChoice;
      const defCanBlock = !dfx.blockDisabled && (fab.blockEnabled || bfx.freeBlock) && (dMode==='steal'||dMode==='attack');
      const isBlockCard = defCanBlock && (card.suit==='shield'||card.suit==='wild'||(bfx.defensiveAttack&&card.suit==='weapons'));
      const isFrisbeeCard = !dfx.blockDisabled && (dMode==='steal'||dMode==='attack') && card.power?.effect==='freeBlock' && !fab.blockEnabled && !bfx.freeBlock;
      const cardActions = [];
      if (isBlockCard) cardActions.push({label:`${icon('shield')} Block`,fn:`defenderBlockWithCard(${card.instanceId})`,primary:true});
      if (isFrisbeeCard) cardActions.push({label:`⚡ Block`,fn:`defenderUseNeutralFreeBlock(${card.instanceId})`,primary:true});
      html += renderCard(card, cardActions, card.instanceId===lastDrawnInstanceId?' newly-drawn':'');
    } else {
      html += renderCard(card,[],card.instanceId===lastDrawnInstanceId?' newly-drawn':'');
    }
  });
  html += `</div></div>`;

  // Tableau (below hand, grouped by suit columns)
  if (p.tableau.length>0) {
    html += `<div class="pile"><div class="pile-label">Tableau (${p.tableau.length})</div><div class="tableau-suit-cols">`;
    const SUITS_ORDER = ['engine','weapons','navigation','shield'];
    SUITS_ORDER.forEach(suit => {
      const suitCards = p.tableau.filter(c=>c.suit===suit||(c.suit==='wild'&&c.assignedSuit===suit));
      if (suitCards.length===0) return;
      html += `<div class="tableau-suit-col"><div class="tableau-suit-col-header suit-color-${suit}">${SUIT_ICONS[suit]} ${SUIT_LABELS[suit]}</div>`;
      const isLiqSellTableau = sellMode && !!getBonusEffects(game.currentPlayerIndex).liquidator;
      suitCards.forEach(card => {
        const canUnplay = isCurrent&&currentPhase==='action'&&!anyPending&&!sellMode&&!pendingDiscard&&playedThisTurn.has(card.instanceId);
        const isBuildSelectMode = isCurrent && !!pendingBuildSelect && (card.suit === pendingBuildSelect.suit||(card.suit==='wild'&&card.assignedSuit===pendingBuildSelect.suit));
        const isBuildSelected = isBuildSelectMode && pendingBuildSelect.selectedIds.includes(card.instanceId);
        const isRepairSelectMode = isCurrent && !!pendingRepair && !getBonusEffects(game.currentPlayerIndex).repairCheap
          && (card.suit===pendingRepair.suit||card.suit==='wild'||!!p.repairPenaltyPending);
        const isRepairSelected = isRepairSelectMode && pendingRepair.selectedCards.includes(card.instanceId);
        const isSellSelectMode = isCurrent && isMyPanel && sellMode;
        const isSellSelected = isSellSelectMode && sellSelection.includes(card.instanceId);
        const canSellSelect = isSellSelected||(isLiqSellTableau?true:sellSelection.length<1);
        const isTableauSacrifice = isDefenderTarget && pendingDefenderChoice
          && (pendingDefenderChoice.mode==='steal'||pendingDefenderChoice.mode==='attack'||pendingDefenderChoice.mode==='callForAid'||pendingDefenderChoice.mode==='stealExtra'||pendingDefenderChoice.mode==='attackExtra')
          && !pendingDefenderChoice.handTarget
          && !pendingDefenderChoice.specificCardId  // specific card: no choice — use Accept button
          && (pendingDefenderChoice.suit===null || card.suit===pendingDefenderChoice.suit);
        if (isBuildSelectMode) {
          html += renderCard(card,[{label:isBuildSelected?'&#10003; Selected':'&#9633; Select',fn:`toggleBuildSelectCard(${card.instanceId})`,primary:isBuildSelected}],isBuildSelected?' build-selected':'',true,true);
        } else if (isSellSelectMode) {
          html += renderCard(card,[{label:isSellSelected?'&#10003; Selected':'&#9658; Select',fn:`toggleSellSelection(${card.instanceId})`,primary:isSellSelected,disabled:!canSellSelect}],isSellSelected?' sell-selected':'',true,true);
        } else if (isRepairSelectMode) {
          html += renderCard(card,[{label:isRepairSelected?'&#10003; Selected':'&#9633; Select',fn:`toggleRepairCard(${card.instanceId})`,primary:isRepairSelected}],isRepairSelected?' repair-selected':'',true,true);
        } else if (isTableauSacrifice) {
          html += renderCard(card,[{label:'&#10007; Give up',fn:`defenderSacrifice(${card.instanceId})`,danger:true}],' sacrifice-target',true,true);
        } else if (canUnplay) {
          html += renderCard(card,[{label:'&#8617; Unplay',fn:`unplayCard(${card.instanceId})`}],' played-this-turn',true,true);
        } else {
          html += renderCard(card,[],null,true,true);
        }
      });
      html += `</div>`;
    });
    // Any neutral/other suit cards (exclude wilds that have been assigned to a main suit column)
    const otherCards = p.tableau.filter(c=>!SUITS_ORDER.includes(c.suit)&&!(c.suit==='wild'&&SUITS_ORDER.includes(c.assignedSuit)));
    if (otherCards.length>0) {
      html += `<div class="tableau-suit-col"><div class="tableau-suit-col-header">Other</div>`;
      const isLiqSellOther = sellMode && !!getBonusEffects(game.currentPlayerIndex).liquidator;
      otherCards.forEach(card => {
        const canUnplay = isCurrent&&currentPhase==='action'&&!anyPending&&!sellMode&&!pendingDiscard&&playedThisTurn.has(card.instanceId);
        const isRepairSelectMode2 = isCurrent && !!pendingRepair && !getBonusEffects(game.currentPlayerIndex).repairCheap
          && (card.suit==='wild'||!!p.repairPenaltyPending); // wilds always valid; any suit valid when penalty active
        const isRepairSelected2 = isRepairSelectMode2 && pendingRepair.selectedCards.includes(card.instanceId);
        const isSellSelectMode2 = isCurrent && isMyPanel && sellMode;
        const isSellSelected2 = isSellSelectMode2 && sellSelection.includes(card.instanceId);
        const canSellSelect2 = isSellSelected2||(isLiqSellOther?true:sellSelection.length<1);
        const isOtherSacrifice = isDefenderTarget && pendingDefenderChoice
          && (pendingDefenderChoice.mode==='steal'||pendingDefenderChoice.mode==='attack'||pendingDefenderChoice.mode==='callForAid'||pendingDefenderChoice.mode==='stealExtra'||pendingDefenderChoice.mode==='attackExtra')
          && !pendingDefenderChoice.handTarget
          && !pendingDefenderChoice.specificCardId
          && (pendingDefenderChoice.suit===null || card.suit===pendingDefenderChoice.suit);
        if (isSellSelectMode2) html += renderCard(card,[{label:isSellSelected2?'&#10003; Selected':'&#9658; Select',fn:`toggleSellSelection(${card.instanceId})`,primary:isSellSelected2,disabled:!canSellSelect2}],isSellSelected2?' sell-selected':'',true,true);
        else if (isRepairSelectMode2) html += renderCard(card,[{label:isRepairSelected2?'&#10003; Selected':'&#9633; Select',fn:`toggleRepairCard(${card.instanceId})`,primary:isRepairSelected2}],isRepairSelected2?' repair-selected':'',true,true);
        else if (isOtherSacrifice) html += renderCard(card,[{label:'&#10007; Give up',fn:`defenderSacrifice(${card.instanceId})`,danger:true}],' sacrifice-target',true,true);
        else if (canUnplay) html += renderCard(card,[{label:'&#8617; Unplay',fn:`unplayCard(${card.instanceId})`}],' played-this-turn',true,true);
        else html += renderCard(card,[],null,true,true);
      });
      html += `</div>`;
    }
    html += `</div></div>`;
  }

  // Disabled parts section
  if (p.shipParts.some(sp=>sp.disabled&&!sp.damaged)) {
    html += `<div class="built-parts-section">`;
    p.shipParts.filter(sp=>sp.disabled&&!sp.damaged).forEach(sp=>{
      html += `<div class="built-part-card" style="opacity:0.55;border-style:dashed;">
        <div class="built-part-icon">${SUIT_ICONS[sp.suit]}</div>
        <div class="built-part-info">
          <div class="built-part-title">${escape(sp.title)}</div>
          ${sp.power?`<div class="built-part-power">${escape(sp.power.text)} <em>(suspended while disabled)</em></div>`:''}
          <div class="built-part-status" style="color:#888;">&#9889; Disabled — restores at start of your next turn, or repair using an action</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // Damaged parts repair section
  if (p.shipParts.some(sp=>sp.damaged)) {
    html += `<div class="built-parts-section">`;
    p.shipParts.filter(sp=>sp.damaged).forEach(sp=>{
      html += `<div class="built-part-card damaged">
        <div class="built-part-icon">${SUIT_ICONS[sp.suit]}</div>
        <div class="built-part-info">
          <div class="built-part-title">${escape(sp.title)}</div>
          ${sp.power?`<div class="built-part-power">${escape(sp.power.text)} <em>(suspended while damaged)</em></div>`:''}
          <div class="built-part-status damaged-status">${icon('damage')} Damaged — repair using an action (${config.rules.repairSameSuitCount||1} same-suit or ${config.rules.repairAnySuitCount||2} any-suit hand cards)</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`; // close player-panel
  return html;
}

// ===== Card rendering =====

function cardRarity(card) {
  if (!card) return 'common';
  if ((card.suit||'neutral') === 'pirate') return 'mythic';
  if ((card.suit||'neutral') === 'wild') return 'mythic';
  if ((card.suit||'neutral') === 'neutral') return 'common';
  const ptype = card.power?.type;
  if (ptype === 'tableau' || ptype === 'instant') return 'rare';
  if (card.power) return 'uncommon';
  return 'common';
}

function renderCard(card, actions, extraClass, condensed, powerInactive=false) {
  const suit=card.suit||'neutral';
  const symStr=renderSymbols(card.symbols);
  const costStr=renderCost(card.cost);

  if (condensed) {
    let html=`<div class="card card-suit-${suit} condensed-card${extraClass||''}">
      <div class="card-stripe card-stripe-${suit}">
        <span class="card-stripe-suit">${SUIT_ICONS[suit]||''}</span>
        <span class="card-stripe-name">${escape(card.title)}</span>
      </div>
      ${renderCardPower(card,true,powerInactive)}
      `;
    if (actions&&actions.length>0) {
      html+=`<div class="card-actions">`;
      actions.forEach(a=>{ html+=`<button class="${a.primary?'primary':a.danger?'danger':''}" ${a.disabled?'disabled':''} onclick="${a.fn||''}">${a.label}</button>`; });
      html+=`</div>`;
    }
    return html+`</div>`;
  }

  const suitIcons = {engine:SUIT_ICONS.engine,weapons:SUIT_ICONS.weapons,navigation:SUIT_ICONS.navigation,shield:SUIT_ICONS.shield,wild:SUIT_ICONS.wild,neutral:'◈',pirate:SUIT_ICONS.pirate};
  const suitIcon = suitIcons[suit]||'◈';
  const suitName = {engine:'Engine',weapons:'Weapon',navigation:'Navigation',shield:'Shield',wild:'Wild',neutral:'Neutral',pirate:'Pirate'}[suit]||suit;
  // Produces in stripe (no pill)
  const prodBadge = (() => {
    if (!card.symbols) return '';
    const parts=[];
    if (card.symbols.scrap)  parts.push(`+${card.symbols.scrap}${SCRAP_ICON}`);
    if (card.symbols.tech)   parts.push(`+${card.symbols.tech}${TECH_ICON}`);
    if (card.symbols.pirate) parts.push(`+${card.symbols.pirate}${icon('pirate')}`);
    return parts.join(' ');
  })();
  // Cost pill top-right
  const costBadge = (() => {
    if (!hasCost(card.cost)) return '';
    const parts=[];
    if (card.cost.scrap) parts.push(`<span class="cn">${card.cost.scrap}</span>${SCRAP_ICON}`);
    if (card.cost.tech)  parts.push(`<span class="cn">${card.cost.tech}</span>${TECH_ICON}`);
    return parts.join(' ');
  })();
  const rarity = cardRarity(card);
  let inner=`<div class="card card-suit-${suit}${extraClass||''}">
    <div class="card-stripe card-stripe-${suit}">
      ${prodBadge?`<span class="card-stripe-prod">${prodBadge}</span>`:''}
    </div>
    ${costBadge?`<div class="card-cost-pill">${costBadge}</div>`:''}
    ${makeArtElement(card.cardId || card.id, card.title, suit, card.power?.effect || null)}
    <div class="card-title-below">${escape(card.title)}</div>
    ${card.iconText?`<div class="card-icon-text">${escape(card.iconText)}</div>`:''}
    ${renderCardPower(card)}
    <div class="card-spacer"></div>
    ${card.description?`<div class="card-desc card-flavor-text">${escape(card.description)}</div>`:''}`;
  if (actions&&actions.length>0) {
    inner+=`<div class="card-actions">`;
    actions.forEach(a=>{ inner+=`<button class="${a.primary?'primary':a.danger?'danger':''}" ${a.disabled?'disabled':''} onclick="${a.fn||''}">${a.label}</button>`; });
    inner+=`</div>`;
  }
  inner+=`<div class="card-suit-footer"><span class="suit-badge-mini suit-${suit}">${suitIcon} ${suitName}</span></div>`;
  inner+=`</div>`;
  return `<div class="card-holo-wrap rarity-${rarity} suit-${suit}">${inner}</div>`;
}

function renderHiddenCard(extraContent='', cardClass='') {
  return `<div class="card-holo-wrap rarity-mythic suit-wild">
    <div class="card hidden-card${cardClass?` ${cardClass}`:''}">
      <div class="card-stars"></div>
      <div class="card-orbit" style="--ring-scale:0.4;--ring-rot:0deg;--ring-hue:30;--ring-opacity:0.3;"></div>
      <div class="card-orbit" style="--ring-scale:0.6;--ring-rot:22deg;--ring-hue:110;--ring-opacity:0.25;"></div>
      <div class="card-orbit" style="--ring-scale:0.8;--ring-rot:44deg;--ring-hue:190;--ring-opacity:0.2;"></div>
      <div class="card-orbit" style="--ring-scale:1.0;--ring-rot:66deg;--ring-hue:270;--ring-opacity:0.15;"></div>
      <div class="card-back-center">✦</div>
      ${extraContent}
      <div class="card-logo">HAMSTERS &middot; IN &middot; SPACE</div>
    </div>
  </div>`;
}

function showArtPrompt(cardId) {
  document.getElementById('art-title').textContent=`Card: ${cardId}`;
  document.getElementById('art-prompt').textContent='(no art prompt)';
  document.getElementById('art-dialog').showModal();
}
