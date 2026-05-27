"use strict";

// HTML-escape any value for safe interpolation into innerHTML.
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

// Toast a short message in the top-right corner.
function flash(msg) {
  const el = document.getElementById('flash');
  el.innerHTML = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2000);
}

// Fisher-Yates shuffle, in place.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === ',') { result.push(cur); cur = ''; }
      else if (c === '"') { inQuotes = true; }
      else { cur += c; }
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim().length > 0).map(line => {
    const fields = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = fields[i] || '');
    return obj;
  });
}

// Styled resource/suit icon — returns an HTML span with coloured circle or square.
const ICON_CHARS = {
  scrap:'⚙️', tech:'🧵', engine:'⚡', nav:'🧭', shield:'🛡️', weapons:'💥', pirate:'👾', damage:'⛔️'
};
function icon(type) {
  return `<span class="icon icon-${type}">${ICON_CHARS[type] ?? type}</span>`;
}

// Deterministic 32-bit FNV-1a hash. Used to seed procedural placeholder art.
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
