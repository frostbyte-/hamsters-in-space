"use strict";

// ── Playroom multiplayer ─────────────────────────────────────────────────────
//
// State sync: Playroom.setState("snap") + RPC "sync" notification.
// RPC.Mode.ALL is used so the call works regardless of who the current player is;
// _lastSentSnap prevents the sender from re-processing their own broadcast.
// mpSend() is always safe to call — it's a no-op until insertCoin() resolves.
//
// SETUP: Sign up at joinplayroom.com, create a game, paste your gameId below.

const PLAYROOM_GAME_ID = "KU4O8KIrIWlciQPdh8Nn";

let _isSyncing    = false;
let _prReady      = false;   // true once insertCoin has resolved
let _lastSentSnap = '';      // prevents re-processing our own broadcast

// Which player slot this browser occupies (null = solo/pass-and-play)
window.myPlayerIndex = null;

// ── Apply + render an incoming snapshot ───────────────────────────────────────

function _applyAndRender(snapStr) {
  if (!snapStr || !_prReady || _isSyncing || snapStr === _lastSentSnap) return;
  _isSyncing = true;
  try {
    _applySnapshot(JSON.parse(snapStr));
    renderGame();
  } catch (err) {
    console.warn('[pr] snapshot apply error:', err);
  } finally {
    _isSyncing = false;
  }
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function mpSend() {
  if (_isSyncing || !_prReady) return;
  if (typeof game === 'undefined' || !game) return;
  const snap = _getSnapshot();
  if (!snap) return;
  _lastSentSnap = snap;            // mark as ours so _applyAndRender skips it
  Playroom.setState("snap", snap);
  try {
    // Mode.ALL: fires on every client including sender; _lastSentSnap guard prevents
    // the sender's own handler from re-processing the state.
    Playroom.RPC.call("sync", {}, Playroom.RPC.Mode.ALL);
  } catch (e) {
    console.warn('[pr] RPC call error:', e);
  }
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

  const orderedPlayers = [];
  Playroom.onPlayerJoin(player => {
    if (!orderedPlayers.find(p => p.id === player.id)) orderedPlayers.push(player);
    player.onQuit(() => flash('⚠️ A player disconnected'));
  });

  try {
    await Playroom.insertCoin({
      gameId: PLAYROOM_GAME_ID,
      maxPlayersPerRoom: 4,
    });
  } catch (err) {
    flash('⚠️ Multiplayer failed: ' + (err.message || err));
    return;
  }

  const playerIds = orderedPlayers.map(p => p.id);
  const names = orderedPlayers.map((p, i) => {
    try { return p.getProfile().name || `Player ${i + 1}`; }
    catch { return `Player ${i + 1}`; }
  });

  // Initial guess — corrected authoritatively in _applySnapshot via game.playroomPlayerIds
  try { window.myPlayerIndex = playerIds.indexOf(Playroom.myPlayer().id); } catch(e) {}

  // RPC handler: fires when any client broadcasts "sync"
  Playroom.RPC.register("sync", () => {
    _applyAndRender(Playroom.getState("snap"));
  });

  // Also try onStateChange as a bonus reactive listener (not all SDK builds support it)
  try {
    Playroom.onStateChange("snap", (snapStr) => _applyAndRender(snapStr));
  } catch(e) {}

  _prReady = true;

  if (Playroom.isHost()) {
    startGame(names.length, names, playerIds);
  } else {
    // Fallback: if we missed the initial RPC (race condition), apply whatever is already in state
    setTimeout(() => {
      const existing = Playroom.getState("snap");
      if (existing) _applyAndRender(existing);
    }, 800);
  }
}

// ── Snapshot serialization ────────────────────────────────────────────────────

function _getSnapshot() {
  try {
    return JSON.stringify({
      game,
      currentPhase,
      pendingSteal, pendingAttack, pendingDefenderChoice,
      pendingJunkyardPick, pendingJunkyardShop,
      pendingSneakChoice, pendingSneakPlay, pendingSneakTableauSelect,
      pendingBuyPhase, pendingPass, pendingRepair, pendingCallForAid,
      pendingBuildPowerChoice, pendingAbilityPick, pendingBuildSelect,
      pendingWildSuitChoice, pendingPartDisable, pendingDisablePartAction,
      pendingDiscard,
      sellMode, sellSelection,
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
  game            = s.game;
  currentPhase    = s.currentPhase;

  // Re-resolve this client's player index from the authoritative ID list in the snapshot
  if (Array.isArray(game.playroomPlayerIds)) {
    try {
      const myId = Playroom.myPlayer().id;
      const idx  = game.playroomPlayerIds.indexOf(myId);
      if (idx !== -1) window.myPlayerIndex = idx;
    } catch(e) {}
  }

  nextInstanceId      = s.nextInstanceId;
  lastDrawnInstanceId = s.lastDrawnInstanceId;

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

  sellMode      = s.sellMode;
  sellSelection = s.sellSelection;

  playedThisTurn        = new Set(s.playedThisTurn);
  sneakPickedIds        = s.sneakPickedIds;
  sneakTableauPlayQueue = s.sneakTableauPlayQueue;
}
