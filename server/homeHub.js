import { sshManager } from './sshClient.js';
import { config } from './config.js';
import { query } from './db.js';

const PLEX_PREFS = '/home/nacho/docker/plex/config/Library/Application Support/Plex Media Server/Preferences.xml';

let plexTokenCache = { token: null, at: 0 };
let qbitCookie = { header: null, at: 0 };

function lanHost() {
  const h = config.ssh.host || '127.0.0.1';
  if (h === '127.0.0.1' || h === 'localhost') return 'host.docker.internal';
  return h;
}

export function plexBase() {
  return (process.env.PLEX_URL || `http://${lanHost()}:32400`).replace(/\/$/, '');
}

export function qbitBase() {
  return (process.env.QBIT_URL || `http://${lanHost()}:8080`).replace(/\/$/, '');
}

function xmlAttrs(tag) {
  const o = {};
  if (!tag) return o;
  for (const m of tag.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)) {
    o[m[1]] = m[2];
  }
  return o;
}

export async function getPlexToken() {
  if (process.env.PLEX_TOKEN) return process.env.PLEX_TOKEN;
  if (plexTokenCache.token && Date.now() - plexTokenCache.at < 10 * 60 * 1000) {
    return plexTokenCache.token;
  }
  const quoted = "'" + PLEX_PREFS.replace(/'/g, "'\\''") + "'";
  const out = await sshManager.exec(
    `python3 -c "import re; t=open(${quoted}).read(); m=re.search(r'PlexOnlineToken=\\"([^\\"]+)\\"', t); print(m.group(1) if m else '')"`
  );
  const token = (out || '').trim();
  if (!token) throw new Error('No se encontró el token de Plex');
  plexTokenCache = { token, at: Date.now() };
  return token;
}

async function plexGet(pathname) {
  const token = await getPlexToken();
  const url = `${plexBase()}${pathname}${pathname.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Plex HTTP ${res.status}`);
  return res.text();
}

function parsePlexSessions(xml) {
  const sessions = [];
  const blocks = xml.split(/<(?:Video|Track|Photo)\b/).slice(1);
  for (const block of blocks) {
    const head = block.slice(0, block.indexOf('>') + 1);
    const a = xmlAttrs('x ' + head);
    const user = xmlAttrs((block.match(/<User\b[^>]*>/) || [])[0]);
    const player = xmlAttrs((block.match(/<Player\b[^>]*>/) || [])[0]);
    const trans = xmlAttrs((block.match(/<TranscodeSession\b[^>]*>/) || [])[0]);
    sessions.push({
      title: a.grandparentTitle ? `${a.grandparentTitle} · ${a.title}` : (a.title || 'Reproduciendo'),
      type: a.type || 'video',
      user: user.title || user.name || 'Alguien',
      player: player.title || player.product || '',
      transcoding: !!(trans.videoDecision === 'transcode' || trans.audioDecision === 'transcode'),
      thumb: a.thumb || a.parentThumb || a.grandparentThumb || null
    });
  }
  return sessions;
}

function parsePlexRecent(xml) {
  const items = [];
  const re = /<(Video|Directory)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 8) {
    const a = xmlAttrs('x ' + m[2]);
    if (!a.title) continue;
    items.push({
      title: a.title,
      type: a.type || (m[1] === 'Directory' ? 'show' : 'movie'),
      year: a.year || '',
      thumb: a.thumb || a.parentThumb || null,
      addedAt: a.addedAt ? Number(a.addedAt) * 1000 : null
    });
  }
  return items;
}

export async function getPlexStatus() {
  try {
    const [sessXml, recentXml] = await Promise.all([
      plexGet('/status/sessions'),
      plexGet('/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=8')
    ]);
    const sessions = parsePlexSessions(sessXml);
    return {
      ok: true,
      sessions,
      transcoding: sessions.some(s => s.transcoding),
      recent: parsePlexRecent(recentXml)
    };
  } catch (err) {
    return { ok: false, error: err.message, sessions: [], recent: [], transcoding: false };
  }
}

export async function plexImageBuffer(thumbPath) {
  if (!thumbPath || !thumbPath.startsWith('/')) throw new Error('path inválido');
  const token = await getPlexToken();
  const url = `${plexBase()}${thumbPath}?X-Plex-Token=${encodeURIComponent(token)}&width=180&height=270`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Plex image HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get('content-type') || 'image/jpeg' };
}

async function qbitLogin() {
  const user = process.env.QBIT_USER || 'ignacio';
  const password = process.env.QBIT_PASSWORD;
  if (!password) {
    const err = new Error('Falta QBIT_PASSWORD en el .env del servidor');
    err.code = 'NO_PASSWORD';
    throw err;
  }
  if (qbitCookie.header && Date.now() - qbitCookie.at < 30 * 60 * 1000) return qbitCookie.header;

  const res = await fetch(`${qbitBase()}/api/v2/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: qbitBase()
    },
    body: new URLSearchParams({ username: user, password }).toString(),
    signal: AbortSignal.timeout(8000)
  });
  const text = (await res.text()).trim();
  const cookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  const sidPair = cookies.join(';').match(/((?:QBT_SID_\d+|SID))=([^;]+)/);
  const bodyOk = !text || /^ok\.?$/i.test(text);
  if (!res.ok || !bodyOk || !sidPair) {
    throw new Error(text || `qBit login HTTP ${res.status}`);
  }
  const header = `${sidPair[1]}=${sidPair[2]}`;
  qbitCookie = { header, at: Date.now() };
  return header;
}

async function qbitApi(pathname, { method = 'GET', body } = {}) {
  const cookie = await qbitLogin();
  const res = await fetch(`${qbitBase()}${pathname}`, {
    method,
    headers: {
      Cookie: cookie,
      Referer: qbitBase(),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(8000)
  });
  if (res.status === 403 || res.status === 401) {
    qbitCookie = { header: null, at: 0 };
    throw new Error(`qBit HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return res.text();
}

export async function getQbitStatus() {
  try {
    const [transfer, torrents] = await Promise.all([
      qbitApi('/api/v2/transfer/info'),
      qbitApi('/api/v2/torrents/info')
    ]);
    const list = Array.isArray(torrents) ? torrents : [];
    const active = list
      .filter(t => t.state && !['error', 'missingFiles', 'unknown'].includes(t.state))
      .sort((a, b) => (b.dlspeed || 0) - (a.dlspeed || 0))
      .slice(0, 8)
      .map(t => ({
        name: t.name,
        state: t.state,
        progress: t.progress,
        dlspeed: t.dlspeed || 0,
        upspeed: t.upspeed || 0,
        hash: t.hash
      }));
    return {
      ok: true,
      configured: true,
      dlSpeed: transfer.dl_info_speed || 0,
      upSpeed: transfer.up_info_speed || 0,
      dlLimit: transfer.dl_rate_limit || 0,
      paused: transfer.connection_status === 'paused' || list.every(t => String(t.state).includes('paused') || t.state === 'stoppedUL' || t.state === 'stoppedDL'),
      torrents: active,
      total: list.length
    };
  } catch (err) {
    return {
      ok: false,
      configured: err.code !== 'NO_PASSWORD',
      error: err.message,
      dlSpeed: 0,
      upSpeed: 0,
      torrents: []
    };
  }
}

export async function qbitPauseAll() {
  try {
    await qbitApi('/api/v2/torrents/stop', { method: 'POST', body: { hashes: 'all' } });
  } catch {
    await qbitApi('/api/v2/torrents/pause', { method: 'POST', body: { hashes: 'all' } });
  }
}

export async function qbitResumeAll() {
  try {
    await qbitApi('/api/v2/torrents/start', { method: 'POST', body: { hashes: 'all' } });
  } catch {
    await qbitApi('/api/v2/torrents/resume', { method: 'POST', body: { hashes: 'all' } });
  }
}

export async function qbitSetDownloadLimit(bytesPerSec) {
  const limit = Math.max(0, Number(bytesPerSec) || 0);
  await qbitApi('/api/v2/transfer/setDownloadLimit', { method: 'POST', body: { limit: String(limit) } });
}

export async function sendWakeOnLan(mac) {
  const clean = String(mac || '').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 12) throw new Error('MAC inválida');
  await sshManager.exec(
    `python3 -c "import socket; mac=bytes.fromhex('${clean}'); pkt=b'\\xff'*6+mac*16; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1); s.sendto(pkt,('255.255.255.255',9)); s.sendto(pkt,('192.168.1.255',9))"`
  );
}

function pickSensor(sensors, names) {
  for (const name of names) {
    const s = sensors.find(x => x.sensor_name === name);
    if (s && Number.isFinite(Number(s.value))) return s;
  }
  return null;
}

export async function getHomeSensors() {
  try {
    const result = await query(`
      SELECT DISTINCT ON (sensor_name)
        sensor_name, sensor_type, value, unit, timestamp
      FROM sensor_readings
      ORDER BY sensor_name, timestamp DESC
    `);
    const sensors = result.rows || [];
    const temp = pickSensor(sensors, ['ds18b20_temp', 'bme280_temp', 'dht22_temp', 'temperature']);
    const humidity = pickSensor(sensors, ['bme280_hum', 'dht22_hum', 'humidity']);
    const pm25 = pickSensor(sensors, ['zh06_pm25', 'pm25']);
    const ac = pickSensor(sensors, ['ac_water_level']);
    return {
      temperature: temp ? Number(temp.value) : null,
      humidity: humidity ? Number(humidity.value) : null,
      pm25: pm25 ? Number(pm25.value) : null,
      acWater: ac ? Number(ac.value) : null
    };
  } catch {
    return { temperature: null, humidity: null, pm25: null, acWater: null };
  }
}

export async function listLightDevices() {
  let rows = [];
  try {
    const db = await query(`SELECT mac, custom_name, light_type, device_config FROM local_devices WHERE is_light = true`);
    rows = db.rows || [];
  } catch {
    return [];
  }
  if (!rows.length) return [];

  let neigh = '';
  try {
    neigh = await sshManager.exec('ip neigh show');
  } catch {
    return rows.map(r => ({ mac: r.mac, name: r.custom_name, lightType: r.light_type, ip: null }));
  }

  const macToIp = {};
  for (const line of neigh.split('\n')) {
    const ip = line.match(/^(\d+\.\d+\.\d+\.\d+)/)?.[1];
    const mac = line.match(/([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i)?.[1];
    if (ip && mac) macToIp[mac.toLowerCase()] = ip;
  }

  return rows.map(r => ({
    mac: r.mac,
    name: r.custom_name || r.mac,
    lightType: r.light_type || 'wiz',
    deviceConfig: r.device_config || {},
    ip: macToIp[(r.mac || '').toLowerCase()] || null
  }));
}
