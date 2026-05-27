"use strict";

function renderPlayerNameInputs() {
  const n = parseInt(document.getElementById('player-count').value);
  const div = document.getElementById('player-names');
  let html = '';
  for (let i = 0; i < n; i++) {
    html += `<label>Player ${i+1} name: <input type="text" id="pname-${i}" placeholder="Player ${i+1}"></label>`;
  }
  div.innerHTML = html;
}

function showSetup() {
  document.getElementById('game-view').hidden = true;
  document.getElementById('setup-view').hidden = false;
  renderPlayerNameInputs();
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('player-count').addEventListener('change', renderPlayerNameInputs);

  document.getElementById('btn-start').addEventListener('click', () => {
    const n = parseInt(document.getElementById('player-count').value);
    const names = [];
    for (let i = 0; i < n; i++) {
      const v = document.getElementById(`pname-${i}`).value.trim();
      names.push(v || `Player ${i+1}`);
    }
    const totalCards = config.cards.reduce((s, c) => s + c.quantity, 0);
    if (totalCards < n * config.rules.startingHandSize) {
      flash("Not enough cards in deck for this player count");
      return;
    }
    startGame(n, names);
  });

  document.getElementById('btn-new-game').addEventListener('click', showSetup);
  document.getElementById('btn-win-close').addEventListener('click', () => {
    document.getElementById('win-dialog').close();
  });
  document.getElementById('btn-win-new-game').addEventListener('click', () => {
    document.getElementById('win-dialog').close();
    showSetup();
  });

  document.getElementById('pass-and-play').addEventListener('change', () => {
    currentHandHidden = isPassAndPlay();
    if (game) renderGame();
  });

  document.getElementById('ultrawide-toggle').addEventListener('change', (e) => {
    document.body.classList.toggle('ultrawide', e.target.checked);
    if (game) renderGame();
  });

  document.getElementById('btn-load-config').addEventListener('click', () => {
    document.getElementById('file-cards').value = '';
    document.getElementById('file-rules').value = '';
    document.getElementById('file-prompts').value = '';
    document.getElementById('config-dialog').showModal();
  });
  document.getElementById('btn-config-cancel').addEventListener('click', () => {
    document.getElementById('config-dialog').close();
  });
  document.getElementById('btn-config-apply').addEventListener('click', async () => {
    try {
      const cardsFile = document.getElementById('file-cards').files[0];
      const rulesFile = document.getElementById('file-rules').files[0];
      const promptsFile = document.getElementById('file-prompts').files[0];
      if (cardsFile) loadCardsCSV(await cardsFile.text());
      if (rulesFile) loadRulesJSON(await rulesFile.text());
      if (promptsFile) loadPromptsCSV(await promptsFile.text());
      document.getElementById('config-dialog').close();
      flash("Config loaded. Start a new game to apply.");
      showSetup();
    } catch (e) {
      flash("Error loading config: " + e.message);
    }
  });

  document.getElementById('btn-show-rules').addEventListener('click', () => {
    document.getElementById('rules-display').textContent = JSON.stringify(config.rules, null, 2);
    document.getElementById('rules-dialog').showModal();
  });
  document.getElementById('btn-rules-close').addEventListener('click', () => {
    document.getElementById('rules-dialog').close();
  });

  document.getElementById('btn-show-cards').addEventListener('click', () => {
    const lines = [];
    lines.push(`${config.cards.length} card definitions, ${config.cards.reduce((s,c)=>s+c.quantity,0)} total cards in deck:\n`);
    config.cards.forEach(c => {
      const sym = Object.entries(c.symbols||{}).filter(([,v])=>v>0).map(([k,v])=>`${k}:${v}`).join(' ');
      const cost = Object.entries(c.cost||{}).filter(([,v])=>v>0).map(([k,v])=>`${k}:${v}`).join(' ');
      const power = c.power?.text ? `\n  Power: ${c.power.text}` : '';
      lines.push(`[${c.id}] ${c.title}  (suit: ${c.suit||'neutral'}, symbols: ${sym||'—'}, cost: ${cost||'free'}, x${c.quantity})${power}\n  Flavor: ${c.description}`);
    });
    document.getElementById('cards-display').textContent = lines.join('\n');
    document.getElementById('cards-dialog').showModal();
  });
  document.getElementById('btn-cards-close').addEventListener('click', () => {
    document.getElementById('cards-dialog').close();
  });

  document.getElementById('btn-art-close').addEventListener('click', () => {
    document.getElementById('art-dialog').close();
  });
  document.getElementById('btn-art-copy').addEventListener('click', () => {
    const text = document.getElementById('art-prompt').textContent;
    navigator.clipboard.writeText(text).then(() => flash("Prompt copied"));
  });

  document.getElementById('btn-multiplayer').addEventListener('click', mpConnect);

  showSetup();

  // ── Multiplayer ─────────────────────────────────────────────────────────────
  // Wrap renderGame so every state change is automatically broadcast to Playroom.
  // mpSend() is a no-op when not in a Playroom session, so this is safe in solo too.
  const _origRenderGame = renderGame;
  window.renderGame = function () {
    _origRenderGame();
    mpSend();
  };
});
