// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Fake VTube Studio API for local testing. Logs request types to stdout.
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
const REC = process.env.REC; // write a timeline of item/param events for rendering
const rec = o => { if (REC) fs.appendFileSync(REC, JSON.stringify({ t: Date.now(), ...o }) + '\n'); };
const imgs = {};
const wss = new WebSocketServer({ port: Number(process.env.PORT) || 8001 });
const counts = {};
let granted = false;
let pos = { positionX: 0, positionY: -0.2, rotation: 0, size: -40 };
wss.on('connection', ws => {
  ws.on('close', () => clearInterval(ws.track));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    counts[m.messageType] = (counts[m.messageType] || 0) + 1;
    const reply = (messageType, data) => ws.send(JSON.stringify({ apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID: m.requestID, messageType, data }));
    const d = m.data || {};
    if (m.messageType === 'ItemMoveRequest') for (const it of d.itemsToMove) rec({ e: 'move', id: it.itemInstanceID, x: it.positionX, y: it.positionY, size: it.size, rot: it.rotation, time: it.timeInSeconds, fade: it.fadeMode, flip: it.setFlip ? it.flip : null });
    if (m.messageType === 'ItemUnloadRequest') rec({ e: 'unload', ids: d.instanceIDs });
    if (m.messageType === 'ItemUnloadRequest') { counts.live = Math.max(0, (counts.live || 0) - (d.instanceIDs?.length || 0)); }
    if (m.messageType === 'InjectParameterDataRequest') rec({ e: 'inject', p: Object.fromEntries(d.parameterValues.map(v => [v.id, v.value])) });
    if (m.messageType === 'ColorTintRequest') rec({ e: 'tint', c: d.colorTint });
    if (m.messageType === 'MoveModelRequest') rec({ e: 'model', ...d });
    switch (m.messageType) {
      case 'AuthenticationTokenRequest': return reply('AuthenticationTokenResponse', { authenticationToken: 'tok123' });
      case 'AuthenticationRequest': return reply('AuthenticationResponse', { authenticated: m.data.authenticationToken === 'tok123', reason: '' });
      case 'CurrentModelRequest': return reply('CurrentModelResponse', { modelLoaded: true, modelName: 'Kumin_Test', modelID: 'mock-model-1', modelPosition: pos });
      case 'MoveModelRequest': pos = { positionX: m.data.positionX ?? pos.positionX, positionY: m.data.positionY ?? pos.positionY, rotation: m.data.rotation ?? pos.rotation, size: m.data.size ?? pos.size }; return reply('MoveModelResponse', {});
      case 'HotkeysInCurrentModelRequest': return reply('HotkeysInCurrentModelResponse', { availableHotkeys: [{ name: 'โดนตี', type: 'TriggerAnimation', hotkeyID: 'hk1' }, { name: 'อาย', type: 'ToggleExpression', hotkeyID: 'hk2' }] });
      case 'ExpressionStateRequest': return reply('ExpressionStateResponse', { expressions: [{ name: 'Blush', file: 'blush.exp3.json' }] });
      case 'ItemListRequest': return reply('ItemListResponse', { availableItemFiles: [{ fileName: 'crown.png' }] });
      case 'ItemLoadRequest': {
        const fn = String(m.data.fileName); if (m.data.customDataBase64 && !/^[A-Za-z0-9-]+\.(png|jpg|gif)$/.test(fn.replace(/\.(png|jpg|gif)$/, '') + '.png') || fn.length < 8 || fn.length > 32) { counts.BAD_NAME = (counts.BAD_NAME || 0) + 1; }
        counts[m.data.customDataBase64 ? 'load:custom' : 'load:cached'] = (counts[m.data.customDataBase64 ? 'load:custom' : 'load:cached'] || 0) + 1; if (m.data.customDataBase64 === undefined && !String(m.data.fileName).startsWith('gen_') && m.data.fileName !== 'crown.png') return ws.send(JSON.stringify({ messageType: 'APIError', requestID: m.requestID, data: { errorID: 1, message: 'file not found' } }));
        const iid = 'it' + Math.random().toString(36).slice(2, 8); const fname = m.data.customDataBase64 ? 'gen_' + m.data.fileName : m.data.fileName;
        if (m.data.customDataBase64 && REC) { imgs[fname] = 1; fs.writeFileSync(REC + '.' + fname, Buffer.from(m.data.customDataBase64, 'base64')); }
        rec({ e: 'load', id: iid, file: fname, x: d.positionX, y: d.positionY, size: d.size, rot: d.rotation });
        counts.live = (counts.live || 0) + 1; counts.peak = Math.max(counts.peak || 0, counts.live);
        return reply('ItemLoadResponse', { instanceID: iid, fileName: fname }); }
      case 'PermissionRequest': granted = granted || !!m.data.requestedPermission; return reply('PermissionResponse', { grantSuccess: granted, permissions: [{ name: 'LoadCustomImagesAsItems', granted }] });
      case 'EventSubscriptionRequest': {
        const ev = d.eventName;
        if (ev === 'ArtMeshTrackingEvent' && process.env.NO_TRACKING) return ws.send(JSON.stringify({ messageType: 'APIError', requestID: m.requestID, data: { errorID: 1, message: 'unknown event' } }));
        rec({ e: 'sub', ev, on: d.subscribe });
        if (ev === 'ModelClickedEvent' && d.subscribe) setTimeout(() => ws.send(JSON.stringify({ messageType: 'ModelClickedEvent', data: {
          modelLoaded: true, loadedModelID: 'mock-model-1', loadedModelName: 'Kumin_Test', modelWasClicked: true, mouseButtonID: 0, clickPosition: { x: 0.1, y: 0.3 }, windowSize: { x: 1920, y: 1080 },
          clickedArtMeshCount: 1, artMeshHits: [{ artMeshOrder: 0, isMasked: false, hitInfo: { modelID: 'mock-model-1', artMeshID: 'HairTop', angle: 0, size: 1, vertexID1: 1, vertexID2: 2, vertexID3: 3, vertexWeight1: 0.2, vertexWeight2: 0.3, vertexWeight3: 0.5 } }] } })), 500);
        if (ev === 'ArtMeshTrackingEvent') {
          clearInterval(ws.track);
          if (d.subscribe) { const pts = d.config.trackingPoints; let n = 0; ws.track = setInterval(() => { n++; ws.send(JSON.stringify({ messageType: 'ArtMeshTrackingEvent', data: { modelLoaded: true, foundPointsCount: pts.length, trackingPoints: pts.map(p => ({ trackingPointID: p.trackingPointID, artMeshVisible: true, position: { x: 0.1 + 0.2 * Math.sin(n / 10), y: 0.3 }, rotation: 0, size: 0.1 })) } })); }, 50); }
        }
        return reply('EventSubscriptionResponse', { subscribedEventCount: 1, subscribedEvents: [ev] });
      }
      case 'ItemPinRequest': rec({ e: 'pin', id: d.itemInstanceID, pin: d.pin, mesh: d.pinInfo?.artMeshID }); return reply('ItemPinResponse', { isPinned: !!d.pin, itemInstanceID: d.itemInstanceID });
      default: return reply(m.messageType.replace('Request', 'Response'), {});
    }
  });
});
setInterval(() => console.log('VTS', JSON.stringify(counts)), Number(process.env.EVERY) || 2000);
console.log('mock VTS on', wss.options.port);
