#!/usr/bin/env node
"use strict";

const http = require('http');
const fs   = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3456;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.csv':  'text/csv',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── Static file server ────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]; // strip cache-bust query params
  if (urlPath === '/') urlPath = '/prototype.html';
  const filePath = path.join(__dirname, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// ── WebSocket relay ───────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ server });
let latestState = null;
let clientCount = 0;
let nextPlayerIndex = 0;

wss.on('connection', ws => {
  clientCount++;
  const playerIndex = nextPlayerIndex++;
  console.log(`Client connected as player ${playerIndex}  (${clientCount} total)`);

  // Tell this client which player slot they are
  ws.send(JSON.stringify({ type: 'hello', playerIndex }));

  // Send current game state to the new joiner so they see the board immediately
  if (latestState) ws.send(latestState);

  ws.on('message', data => {
    latestState = data.toString();
    // Broadcast to all OTHER connected clients
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(latestState);
      }
    });
  });

  ws.on('close', () => {
    clientCount--;
    console.log(`Client disconnected (${clientCount} remaining)`);
  });
});

server.listen(PORT, () => {
  console.log(`\nHamsters in Space — multiplayer server`);
  console.log(`Local:  http://localhost:${PORT}/prototype.html`);
  console.log(`\nTo share over the internet:`);
  console.log(`  ngrok http ${PORT}`);
  console.log(`Then share the https://xxxx.ngrok-free.app URL with testers.\n`);
});
