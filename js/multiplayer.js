"use strict";

// ── Playroom multiplayer ─────────────────────────────────────────────────────
//
// State sync via Playroom setState (full JSON snapshot) + RPC notifications.
// mpSend() is always safe to call — it's a no-op until insertCoin() resolves.
// Solo / pass-and-play: _prReady stays false, all functions are no-ops.
//
// SETUP: Sign up at joinplayroom.com, create a game, paste your gameId below.

const PLAYROOM_GAME_ID = "KU4O8KIrIWlciQPdh8Nn"; // ← replace before testing

let _isSyncing = false;
let _prReady   = false;  // true once insertCoin has resolved

// Which player slot this browser occupies (null = solo/pass-and-play)
window.myPlayerIndex = null;

// ── Broadcast ─────────────────────────────────────────────────────────────────

function mpSend() {
  if (_isSyncing || !_prReady) return;
  if (typeof game === 'undefined' || !game) return;
  const snap = _getSnapshot();
  if (!snap) return;
  Playroom.setState("snap", snap);
  Playroom.RPC.call("sync", {}, Playroom.RPC.Mode.OTHERS);
}

// ── Load Playroom SDK on demand ───────────────────────────────────────────────

function _loadPlayroom() {
  return new Promise((resolve, reject) => {
    if (typeof Playroom !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/playroomkit/multiplayer.full.umd.js';
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Playroom SDK — check your internet connection'));
    document.head.appendChild(s);
  });
}

// ── Connect (triggered by clicking the Multiplayer button) ────────────────────

async function mpConnect() {
  flash("🔄 Connecting…");
  try {
    await _loadPlayroom();
  } catch (err) {
    flash('⚠️ ' + err.message);
    return;
  }

  if (PLAYROOM_GAME_ID === "YOUR_GAME_ID_HERE") {
    flash("⚠️ Set your Playroom gameId in js/multiplayer.js before connecting");
    return;
  }

  // Collect players in join order.
  // onPlayerJoin fires immediately for any players already in the lobby,
  // then continues firing as new players join — before insertCoin resolves.
  const orderedPlayers = [];
  Playroom.onPlayerJoin(player => {
    if (!orderedPlayers.find(p => p.id === player.id)) orderedPlayers.push(player);
    player.onQuit(() => flash('⚠️ A player disconnected'));
  });

  try {
    // insertCoin shows Playroom's lobby overlay. Host presses Launch to resolve.
    await Playroom.insertCoin({
      gameId: PLAYROOM_GAME_ID,
      maxPlayersPerRoom: 4,
    });
  } catch (err) {
    flash('⚠️ Multiplayer failed: ' + (err.message || err));
    return;
  }

  // insertCoin resolved — all players are now known in orderedPlayers
  const names = orderedPlayers.map((p, i) => {
    try { return p.getProfile().name || `Player ${i + 1}`; }
    catch { return `Player ${i + 1}`; }
  });

  // Assign this client's player slot by position in the join order
  const myId = Playroom.myPlayer().id;
  window.myPlayerIndex = orderedPlayers.findIndex(p => p.id === myId);

  // Register RPC handler so all clients receive state pushes
  Playroom.RPC.register("sync", () => {
    const snapStr = Playroom.getState("snap");
    if (!snapStr || _isSyncing) return;
    _isSyncing = true;
    try {
      _applySnapshot(JSON.parse(snapStr));
      renderGame(); // wrapped version; mpSend() inside is a no-op while _isSyncing
    } catch (err) {
      console.warn('[pr] snapshot apply error:', err);
    } finally {
      _isSyncing = false;
    }
  });

  _prReady = true;

  if (Playroom.isHost()) {
    // Host starts the game. startGame → renderGame → mpSend → RPC "sync" → all others get state.
    startGame(names.length, names);
  }
  // Non-hosts: sit idle until the "sync" RPC arrives from the host's startGame call.
}

// ── Snapshot serialization ────────────────────────────────────────────────────

function _getSnapshot() {
  try {
    return JSON.stringify({
      game,
      currentPhase,
      // pending states
      pendingSteal, pendingAttack, pendingDefenderChoice,
      pendingJunkyardPick, pendingJunkyardShop,
      pendingSneakChoice, pendingSneakPlay, pendingSneakTableauSelect,
      pendingBuyPhase, pendingPass, pendingRepair, pendingCallForAid,
      pendingBuildPowerChoice, pendingAbilityPick, pendingBuildSelect,
      pendingWildSuitChoice, pendingPartDisable, pendingDisablePartAction,
      pendingDiscard,
      // sell state
      sellMode, sellSelection,
      // turn tracking — Set must be serialised as array
      playedThisTurn: [...playedThisTurn],
      sneakPickedIds, sneakTableauPlayQueue,
      lastDrawnInstanceId, nextInstanceId,
    });
  } catch (e) {
    console.warn('[pr] snapshot serialise error:', e);
    return null;
  }
}

function _applySnapshot(s) {
  // Core game object
  game            = s.game;
  currentPhase    = s.currentPhase;
  nextInstanceId  = s.nextInstanceId;
  lastDrawnInstanceId = s.lastDrawnInstanceId;

  // Pending states
  pendingSteal              = s.pendingSteal;
  pendingAttack             = s.pendingAttack;
  pendingDefenderChoice     = s.pendingDefenderChoice;
  pendingJunkyardPick       = s.pendingJunkyardPick;
  pendingJunkyardShop       = s.pendingJunkyardShop;
  pendingSneakChoice        = s.pendingSneakChoice;
  pendingSneakPlay          = s.pendingSneakPlay;
  pendingSneakTableauSelect = s.pendingSneakTableauSelect;
  pendingBuyPhase           = s.pendingBuyPhase;
  pendingPass               = s.pendingPass;
  pendingRepair             = s.pendingRepair;
  pendingCallForAid         = s.pendingCallForAid;
  pendingBuildPowerChoice   = s.pendingBuildPowerChoice;
  pendingAbilityPick        = s.pendingAbilityPick;
  pendingBuildSelect        = s.pendingBuildSelect;
  pendingWildSuitChoice     = s.pendingWildSuitChoice;
  pendingPartDisable        = s.pendingPartDisable;
  pendingDisablePartAction  = s.pendingDisablePartAction;
  pendingDiscard            = s.pendingDiscard;

  // Sell state
  sellMode      = s.sellMode;
  sellSelection = s.sellSelection;

  // Turn tracking
  playedThisTurn        = new Set(s.playedThisTurn);
  sneakPickedIds        = s.sneakPickedIds;
  sneakTableauPlayQueue = s.sneakTableauPlayQueue;
}
