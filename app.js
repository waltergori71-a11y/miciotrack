let appState = null;
let isStandaloneMode = false; // Diventa true automaticamente quando l'app gira su GitHub Pages (senza PC)
let standaloneSimInterval = null;
let standaloneSimAngle = 0;

let map = null;
let satelliteLayer = null;
let streetLayer = null;
let isSatellite = true;

let catMarker = null;
let accuracyCircle = null;
let homeMarker = null;
let homeFenceCircle = null;
let trailPolyline = null;

let pickingHomeOnMap = false;
let hasCenteredInitially = false;
let lastOutsideState = false;

const STORAGE_KEY = 'miciotrack_standalone_state_v1';

// Stato predefinito per la modalità autonoma su GitHub Pages (iPhone / Android a PC spento)
function getDefaultStandaloneState() {
  return {
    catName: 'Micio',
    trackerId: '30506385902',
    trackerPhone: '',
    trackerModel: 'GF-07 (GF07.ZP.V11 - ID: 30506385902)',
    simApn: 'mobile.vodafone.it',
    home: {
      lat: 43.897552,
      lng: 11.078551,
      radiusMeters: 150,
      enabled: true
    },
    currentPosition: {
      lat: 43.897552,
      lng: 11.078551,
      accuracyMeters: 350,
      source: 'LBS',
      speedKmh: 0,
      batteryPercent: 87,
      signalStrength: 48,
      timestamp: new Date().toISOString(),
      outsideGeofence: false,
      distanceFromHomeMeters: 0,
      rawInfo: 'Connesso via Cloud (ID: 30506385902)'
    },
    history: [
      {
        lat: 43.897552,
        lng: 11.078551,
        source: 'LBS',
        accuracyMeters: 350,
        timestamp: new Date().toISOString()
      }
    ],
    tcpLogs: [
      { time: new Date().toLocaleTimeString('it-IT'), message: 'Modalità Cloud Autonoma (GitHub Pages) attiva' }
    ],
    lastRawLbsPosition: {
      lat: 43.897552,
      lng: 11.078551
    },
    lbsCalibration: {
      enabled: false,
      dLat: 0,
      dLng: 0
    },
    simulator: {
      active: false,
      mode: 'garden'
    }
  };
}

function loadStandaloneState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const def = getDefaultStandaloneState();
      return {
        ...def,
        ...parsed,
        home: { ...def.home, ...(parsed.home || {}) },
        currentPosition: { ...def.currentPosition, ...(parsed.currentPosition || {}) },
        lbsCalibration: { ...def.lbsCalibration, ...(parsed.lbsCalibration || {}) },
        simulator: { active: false, mode: 'garden' }
      };
    }
  } catch (e) {}
  return getDefaultStandaloneState();
}

function saveStandaloneState() {
  if (!appState) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {}
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// ============================================================================
// MD5 PURO IN JAVASCRIPT PER INTERROGARE DIRETTAMENTE IL TRACKER DA IPHONE/ANDROID
// ============================================================================
function md5Browser(str) {
  function rotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function addUnsigned(lX, lY) {
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(string) {
    const lMessageLength = string.length;
    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
    const lWordArray = Array(lNumberOfWords - 1).fill(0);
    let lBytePosition = 0;
    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition);
      lByteCount++;
    }
    const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue) {
    let wordToHexValue = '';
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      const wordToHexValueTemp = '0' + lByte.toString(16);
      wordToHexValue += wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
    }
    return wordToHexValue;
  }
  const x = convertToWordArray(str);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k + 0], 7, 0xd76aa478); d = FF(d, a, b, c, x[k + 1], 12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], 17, 0x242070db); b = FF(b, c, d, a, x[k + 3], 22, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf); d = FF(d, a, b, c, x[k + 5], 12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], 17, 0xa8304613); b = FF(b, c, d, a, x[k + 7], 22, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], 7, 0x698098d8); d = FF(d, a, b, c, x[k + 9], 12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], 17, 0xffff5bb1); b = FF(b, c, d, a, x[k + 11], 22, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], 7, 0x6b901122); d = FF(d, a, b, c, x[k + 13], 12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], 17, 0xa679438e); b = FF(b, c, d, a, x[k + 15], 22, 0x49b40821);
    a = GG(a, b, c, d, x[k + 1], 5, 0xf61e2562); d = GG(d, a, b, c, x[k + 6], 9, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], 14, 0x265e5a51); b = GG(b, c, d, a, x[k + 0], 20, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], 5, 0xd62f105d); d = GG(d, a, b, c, x[k + 10], 9, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], 14, 0xd8a1e681); b = GG(b, c, d, a, x[k + 4], 20, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6); d = GG(d, a, b, c, x[k + 14], 9, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], 14, 0xf4d50d87); b = GG(b, c, d, a, x[k + 8], 20, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905); d = GG(d, a, b, c, x[k + 2], 9, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], 14, 0x676f02d9); b = GG(b, c, d, a, x[k + 12], 20, 0x8d2a4c8a);
    a = HH(a, b, c, d, x[k + 5], 4, 0xfffa3942); d = HH(d, a, b, c, x[k + 8], 11, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], 16, 0x6d9d6122); b = HH(b, c, d, a, x[k + 14], 23, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], 4, 0xa4beea44); d = HH(d, a, b, c, x[k + 4], 11, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], 16, 0xf6bb4b60); b = HH(b, c, d, a, x[k + 10], 23, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6); d = HH(d, a, b, c, x[k + 0], 11, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], 16, 0xd4ef3085); b = HH(b, c, d, a, x[k + 6], 23, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039); d = HH(d, a, b, c, x[k + 12], 11, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], 16, 0x1fa27cf8); b = HH(b, c, d, a, x[k + 2], 23, 0xc4ac5665);
    a = II(a, b, c, d, x[k + 0], 6, 0xf4292244); d = II(d, a, b, c, x[k + 7], 10, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], 15, 0xab9423a7); b = II(b, c, d, a, x[k + 5], 21, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], 6, 0x655b59c3); d = II(d, a, b, c, x[k + 3], 10, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], 15, 0xffeff47d); b = II(b, c, d, a, x[k + 1], 21, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f); d = II(d, a, b, c, x[k + 15], 10, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], 15, 0xa3014314); b = II(b, c, d, a, x[k + 13], 21, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], 6, 0xf7537e82); d = II(d, a, b, c, x[k + 11], 10, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], 15, 0x2ad7d2bb); b = II(b, c, d, a, x[k + 9], 21, 0xeb86d391);
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

function buildXtgpsQueryBrowser(cmd, dataArr, user = '30506385902') {
  const nTimeStamp = Date.now();
  const strRandom = String(Math.floor(Math.random() * 900000) + 100000);
  let n = 'www.xtgps.top';
  while (n.length % 3) n += '/';
  const strAppID = btoa(n);
  const dataStr = dataArr.map((x) => "N'" + String(x) + "'").join(',');
  let r = cmd + '\x11' + dataStr + '\x11\x11\x1b';
  while (r.length % 3) r += '0';
  const strToken = btoa(r);
  const rawSign = String(nTimeStamp) + strRandom + user + strAppID + strToken;
  const strSign = md5Browser(rawSign);
  const params = new URLSearchParams({
    strAppID,
    strUser: user,
    nTimeStamp: String(nTimeStamp),
    strRandom,
    strSign,
    strToken
  });
  return `http://www.xtgps.top/APP/AppJson.asp?${params.toString()}`;
}

async function syncStandaloneGf07FromBrowser() {
  if (!appState || (appState.simulator && appState.simulator.active)) return false;
  const devId = appState.trackerId || '30506385902';
  const targetUrl = buildXtgpsQueryBrowser('Proc_GetLastPosition', [devId], devId);

  // Lista di gateway HTTPS gratuiti per permettere a GitHub Pages (HTTPS) di interrogare il server GF-07
  const proxyUrls = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
  ];

  for (const url of proxyUrls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.m_isResultOk === 1 && Array.isArray(data.m_arrRecord) && data.m_arrRecord.length > 0) {
        const rec = data.m_arrRecord[0];
        const lon = parseFloat(rec[2]);
        const lat = parseFloat(rec[3]);
        const speed = parseFloat(rec[5]) || 0;
        const gsmCsq = parseInt(rec[6], 10) || 10;
        const gpsSats = parseInt(rec[7], 10) || 0;
        const isGps = gpsSats > 0;

        if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
          appState.lastRawLbsPosition = { lat, lng: lon };
          let finalLat = lat;
          let finalLng = lon;
          let calNote = '';

          if (!isGps && appState.lbsCalibration && appState.lbsCalibration.enabled) {
            finalLat = lat + (appState.lbsCalibration.dLat || 0);
            finalLng = lon + (appState.lbsCalibration.dLng || 0);
            calNote = ' [Cella Casa Calibrata]';
          }

          updateStandalonePosition({
            lat: finalLat,
            lng: finalLng,
            accuracyMeters: isGps ? 5 : appState.lbsCalibration?.enabled ? 80 : 350,
            source: isGps ? 'GPS' : 'LBS',
            speedKmh: speed,
            signalStrength: Math.min(100, Math.round((gsmCsq / 31) * 100)),
            batteryPercent: appState.currentPosition.batteryPercent || 87,
            rawInfo: `Live GPRS da GF-07 (ID: ${devId}) • Cella Vodafone CSQ:${gsmCsq}/31${calNote}`
          });
          return true;
        }
      }
    } catch (e) {
      // Prova il proxy successivo
    }
  }
  return false;
}

function updateStandalonePosition({
  lat,
  lng,
  accuracyMeters = 5,
  source = 'GPS',
  speedKmh = 0,
  batteryPercent = 87,
  signalStrength = 48,
  rawInfo = ''
}) {
  const cleanLat = Number(Number(lat).toFixed(6));
  const cleanLng = Number(Number(lng).toFixed(6));
  if (isNaN(cleanLat) || isNaN(cleanLng)) return;

  const dist = calculateDistanceMeters(appState.home.lat, appState.home.lng, cleanLat, cleanLng);
  const outside = appState.home.enabled && dist > appState.home.radiusMeters;
  const nowIso = new Date().toISOString();

  appState.currentPosition = {
    lat: cleanLat,
    lng: cleanLng,
    accuracyMeters: Number(accuracyMeters) || 5,
    source,
    speedKmh: Number(Number(speedKmh).toFixed(1)),
    batteryPercent,
    signalStrength,
    timestamp: nowIso,
    outsideGeofence: outside,
    distanceFromHomeMeters: dist,
    rawInfo
  };

  appState.history.push({
    lat: cleanLat,
    lng: cleanLng,
    source,
    accuracyMeters: appState.currentPosition.accuracyMeters,
    timestamp: nowIso
  });
  if (appState.history.length > 150) appState.history.shift();

  saveStandaloneState();
  renderState(appState);
}

// Inizializzazione Mappa (Satellitare Esri + OpenStreetMap gratuiti al 100%)
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([43.897552, 11.078551], 16);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Vista Satellitare Gratuita'
    }
  );

  streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });

  satelliteLayer.addTo(map);

  // Click sulla mappa per spostare Casa (quando attivo)
  map.on('click', async (e) => {
    if (!pickingHomeOnMap) return;
    pickingHomeOnMap = false;
    const btn = document.getElementById('pickMapHomeBtn');
    btn.textContent = '🖱️ Clicca sulla Mappa';
    btn.classList.remove('btn-primary');

    const newRadius = Number(document.getElementById('radiusSlider').value) || 150;

    if (isStandaloneMode) {
      appState.home.lat = Number(e.latlng.lat.toFixed(6));
      appState.home.lng = Number(e.latlng.lng.toFixed(6));
      appState.home.radiusMeters = newRadius;
      if (appState.lbsCalibration && appState.lbsCalibration.enabled && appState.lastRawLbsPosition) {
        appState.lbsCalibration.dLat = appState.home.lat - appState.lastRawLbsPosition.lat;
        appState.lbsCalibration.dLng = appState.home.lng - appState.lastRawLbsPosition.lng;
      }
      updateStandalonePosition({
        lat: appState.home.lat,
        lng: appState.home.lng,
        accuracyMeters: appState.currentPosition.accuracyMeters,
        source: appState.currentPosition.source,
        rawInfo: 'Casa aggiornata sulla mappa'
      });
      return;
    }

    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        home: {
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          radiusMeters: newRadius
        },
        teleportCatToHome: true
      })
    });
  });
}

function toggleMapLayer() {
  const btn = document.getElementById('toggleLayerBtn');
  if (isSatellite) {
    map.removeLayer(satelliteLayer);
    streetLayer.addTo(map);
    isSatellite = false;
    btn.textContent = '🛰️ Passa a Vista Satellitare';
  } else {
    map.removeLayer(streetLayer);
    satelliteLayer.addTo(map);
    isSatellite = true;
    btn.textContent = '🗺️ Passa a Vista Stradale';
  }
}

function switchTab(tabName, btnEl) {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

function playGeofenceBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

function renderState(state) {
  appState = state;
  const pos = state.currentPosition;
  const home = state.home;

  document.getElementById('headerCatName').textContent = `${state.catName} — Localizzatore Live`;
  document.getElementById('alertCatName').textContent = state.catName;
  document.getElementById('alertDist').textContent = pos.distanceFromHomeMeters;

  const geofencePill = document.getElementById('geofencePill');
  const alertBanner = document.getElementById('alertBanner');

  if (pos.outsideGeofence) {
    geofencePill.className = 'pill danger';
    geofencePill.textContent = `🚨 Fuori Recinto (${pos.distanceFromHomeMeters}m)`;
    alertBanner.classList.remove('hidden');
    if (!lastOutsideState) playGeofenceBeep();
  } else {
    geofencePill.className = 'pill safe';
    geofencePill.textContent = `🏠 Nel Recinto (${pos.distanceFromHomeMeters}m)`;
    alertBanner.classList.add('hidden');
  }
  lastOutsideState = pos.outsideGeofence;

  const sourcePill = document.getElementById('sourcePill');
  if (pos.source === 'LBS') {
    sourcePill.className = 'pill lbs';
    sourcePill.textContent = `📡 Cella 2G LBS (±${pos.accuracyMeters}m)`;
  } else {
    sourcePill.className = 'pill';
    sourcePill.textContent = `🛰️ GPS Satellitare (±${pos.accuracyMeters}m)`;
  }

  document.getElementById('batteryPill').textContent = `🔋 ${pos.batteryPercent}%`;

  document.getElementById('metricDistance').textContent = `${pos.distanceFromHomeMeters} m`;
  document.getElementById('metricAccuracy').textContent = `± ${pos.accuracyMeters} m`;
  document.getElementById('metricSpeed').textContent = `${pos.speedKmh} km/h`;
  document.getElementById('metricCoords').textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
  document.getElementById('rawStatusInfo').textContent = pos.rawInfo || '';
  document.getElementById('lastUpdateText').textContent = new Date(pos.timestamp).toLocaleTimeString('it-IT');

  document.getElementById('openWalkDirectionsBtn').href =
    `https://www.google.com/maps/dir/?api=1&destination=${pos.lat},${pos.lng}&travelmode=walking`;

  const calBtn = document.getElementById('calibrateLbsBtn');
  if (calBtn) {
    if (state.lbsCalibration && state.lbsCalibration.enabled) {
      calBtn.textContent = '✅ Cella GF-07 Calibrata su Casa (Clicca per mostrare ripetitore reale)';
      calBtn.className = 'btn btn-primary btn-full';
    } else {
      calBtn.textContent = '📍 Calibra Cella Vodafone GF-07 su Casa (Azzera offset ripetitore)';
      calBtn.className = 'btn btn-warning btn-full';
    }
  }

  const simBadge = document.getElementById('simBadge');
  if (state.simulator && state.simulator.active) {
    simBadge.textContent = `🟢 Attivo (${state.simulator.mode})`;
    simBadge.style.color = '#34d399';
  } else {
    simBadge.textContent = 'Spento';
    simBadge.style.color = '#94a3b8';
  }

  const phoneEl = document.getElementById('gf07PhoneInput');
  if (document.activeElement !== phoneEl && state.trackerPhone) {
    phoneEl.value = state.trackerPhone;
  }
  const catNameEl = document.getElementById('catNameInput');
  if (document.activeElement !== catNameEl) {
    catNameEl.value = state.catName;
  }
  const sliderEl = document.getElementById('radiusSlider');
  if (document.activeElement !== sliderEl) {
    sliderEl.value = home.radiusMeters;
    document.getElementById('radiusValueLabel').textContent = home.radiusMeters;
  }

  const serverIpEl = document.getElementById('serverIpInput');
  const lanIpObj =
    (state.serverInfo?.localIps || []).find((i) => i.address.startsWith('192.168.')) ||
    (state.serverInfo?.localIps || [])[0];

  const phoneUrl = lanIpObj
    ? `http://${lanIpObj.address}:${state.serverInfo.httpPort || 3000}`
    : window.location.href;
  const phoneUrlText = document.getElementById('phoneUrlText');
  const phoneQrImg = document.getElementById('phoneQrImg');
  if (phoneUrlText) phoneUrlText.textContent = phoneUrl;
  if (phoneQrImg && !phoneQrImg.dataset.loaded) {
    phoneQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(phoneUrl)}`;
    phoneQrImg.dataset.loaded = '1';
  }
  if (lanIpObj && document.activeElement !== serverIpEl && serverIpEl.value === '127.0.0.1') {
    serverIpEl.value = lanIpObj.address;
    updateSmsConfigPreview();
  }

  const logsContainer = document.getElementById('tcpLogsContainer');
  if (state.tcpLogs && state.tcpLogs.length > 0) {
    logsContainer.innerHTML = state.tcpLogs
      .map((l) => `<div><span style="color:#64748b">[${l.time}]</span> ${l.message}</div>`)
      .join('');
  }

  updateMapObjects(state);
}

function updateMapObjects(state) {
  const pos = state.currentPosition;
  const home = state.home;

  const homeIcon = L.divIcon({
    className: 'cat-marker-pin',
    html: `<div class="home-bubble">🏠 Casa</div>`,
    iconSize: [70, 26],
    iconAnchor: [35, 13]
  });

  if (!homeMarker) {
    homeMarker = L.marker([home.lat, home.lng], { icon: homeIcon }).addTo(map);
  } else {
    homeMarker.setLatLng([home.lat, home.lng]);
  }

  if (!homeFenceCircle) {
    homeFenceCircle = L.circle([home.lat, home.lng], {
      radius: home.radiusMeters,
      color: '#3b82f6',
      weight: 2,
      dashArray: '6, 6',
      fillColor: '#3b82f6',
      fillOpacity: 0.12
    }).addTo(map);
  } else {
    homeFenceCircle.setLatLng([home.lat, home.lng]);
    homeFenceCircle.setRadius(home.radiusMeters);
    homeFenceCircle.setStyle({
      color: pos.outsideGeofence ? '#ef4444' : '#3b82f6',
      fillColor: pos.outsideGeofence ? '#ef4444' : '#3b82f6'
    });
  }

  const isLbs = pos.source === 'LBS';
  if (!accuracyCircle) {
    accuracyCircle = L.circle([pos.lat, pos.lng], {
      radius: pos.accuracyMeters,
      color: isLbs ? '#f59e0b' : '#10b981',
      weight: isLbs ? 2 : 1,
      fillColor: isLbs ? '#f59e0b' : '#10b981',
      fillOpacity: isLbs ? 0.22 : 0.15
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng([pos.lat, pos.lng]);
    accuracyCircle.setRadius(pos.accuracyMeters);
    accuracyCircle.setStyle({
      color: isLbs ? '#f59e0b' : '#10b981',
      fillColor: isLbs ? '#f59e0b' : '#10b981',
      fillOpacity: isLbs ? 0.22 : 0.15
    });
  }

  const bubbleClass = isLbs
    ? 'cat-bubble lbs-mode'
    : pos.outsideGeofence
    ? 'cat-bubble outside'
    : 'cat-bubble';

  const catIcon = L.divIcon({
    className: 'cat-marker-pin',
    html: `<div class="${bubbleClass}">🐱 ${state.catName} ${isLbs ? '(Cella LBS)' : ''}</div>`,
    iconSize: [120, 30],
    iconAnchor: [60, 15]
  });

  if (!catMarker) {
    catMarker = L.marker([pos.lat, pos.lng], { icon: catIcon }).addTo(map);
  } else {
    catMarker.setLatLng([pos.lat, pos.lng]);
    catMarker.setIcon(catIcon);
  }

  const coords = (state.history || []).map((h) => [h.lat, h.lng]);
  if (!trailPolyline) {
    trailPolyline = L.polyline(coords, {
      color: '#10b981',
      weight: 3,
      opacity: 0.8
    }).addTo(map);
  } else {
    trailPolyline.setLatLngs(coords);
  }

  if (!hasCenteredInitially) {
    hasCenteredInitially = true;
    map.setView([pos.lat, pos.lng], isLbs ? 16 : 18);
  }
}

function centerOnCat() {
  if (!appState) return;
  const pos = appState.currentPosition;
  map.flyTo([pos.lat, pos.lng], pos.source === 'LBS' ? 16 : 18, { duration: 0.7 });
}

function centerOnHome() {
  if (!appState) return;
  map.flyTo([appState.home.lat, appState.home.lng], 18, { duration: 0.7 });
}

async function syncLiveGf07Now() {
  await stopSim();
  if (isStandaloneMode) {
    await syncStandaloneGf07FromBrowser();
    centerOnCat();
    return;
  }
  const res = await fetch('/api/sync-gf07', { method: 'POST' });
  const data = await res.json();
  if (data.ok) centerOnCat();
}

async function toggleLbsCalibration() {
  await stopSim();
  const currentlyEnabled = Boolean(appState?.lbsCalibration?.enabled);

  if (isStandaloneMode) {
    const rawLat = appState.lastRawLbsPosition?.lat || 43.897552;
    const rawLng = appState.lastRawLbsPosition?.lng || 11.078551;
    if (!currentlyEnabled) {
      appState.lbsCalibration = {
        enabled: true,
        dLat: appState.home.lat - rawLat,
        dLng: appState.home.lng - rawLng
      };
    } else {
      appState.lbsCalibration = { enabled: false, dLat: 0, dLng: 0 };
    }
    saveStandaloneState();
    await syncStandaloneGf07FromBrowser();
    centerOnCat();
    return;
  }

  const res = await fetch('/api/calibrate-lbs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !currentlyEnabled })
  });
  const data = await res.json();
  if (data.ok) centerOnCat();
}

// ============================================================================
// CONTROLLI SIMULATORE (LOCALE + GITHUB PAGES)
// ============================================================================
function stepStandaloneSimulator() {
  standaloneSimAngle += 0.38;
  const homeLat = appState.home.lat;
  const homeLng = appState.home.lng;
  const radiusM = appState.home.radiusMeters || 120;
  const mode = appState.simulator.mode;

  if (mode === 'garden') {
    const rMeters = radiusM * (0.35 + 0.35 * Math.sin(standaloneSimAngle * 0.7));
    const dLat = (rMeters * Math.cos(standaloneSimAngle)) / 111320;
    const dLng = (rMeters * Math.sin(standaloneSimAngle)) / (111320 * Math.cos((homeLat * Math.PI) / 180));
    updateStandalonePosition({
      lat: homeLat + dLat,
      lng: homeLng + dLng,
      accuracyMeters: 3,
      source: 'GPS',
      speedKmh: 1.5 + Math.abs(Math.sin(standaloneSimAngle)) * 3.2,
      rawInfo: 'Simulatore GPS 4G: Micio in giardino (Zona Sicura)'
    });
  } else if (mode === 'explore') {
    const rMeters = radiusM * (1.25 + 0.45 * Math.sin(standaloneSimAngle * 0.5));
    const dLat = (rMeters * Math.cos(standaloneSimAngle * 0.6)) / 111320;
    const dLng = (rMeters * Math.sin(standaloneSimAngle * 0.6)) / (111320 * Math.cos((homeLat * Math.PI) / 180));
    updateStandalonePosition({
      lat: homeLat + dLat,
      lng: homeLng + dLng,
      accuracyMeters: 4,
      source: 'GPS',
      speedKmh: 4.8 + Math.abs(Math.cos(standaloneSimAngle)) * 5.0,
      rawInfo: 'Simulatore GPS 4G: Micio in esplorazione fuori zona!'
    });
  } else if (mode === 'gf07_lbs') {
    const towerOffsetLat = 260 / 111320;
    const towerOffsetLng = -310 / (111320 * Math.cos((homeLat * Math.PI) / 180));
    updateStandalonePosition({
      lat: homeLat + towerOffsetLat,
      lng: homeLng + towerOffsetLng,
      accuracyMeters: 480,
      source: 'LBS',
      speedKmh: 0,
      rawInfo: 'GF-07 (LBS Cella 2G): Triangolazione ripetitore telefonico (±480m)'
    });
  }
}

async function startSim(mode) {
  if (isStandaloneMode) {
    appState.simulator = { active: true, mode };
    if (standaloneSimInterval) clearInterval(standaloneSimInterval);
    stepStandaloneSimulator();
    standaloneSimInterval = setInterval(stepStandaloneSimulator, 3500);
    if (mode === 'gf07_lbs' && map) setTimeout(() => centerOnCat(), 250);
    return;
  }
  await fetch('/api/simulator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: true, mode })
  });
  if (mode === 'gf07_lbs' && map) setTimeout(() => centerOnCat(), 250);
}

async function stopSim() {
  if (isStandaloneMode) {
    if (standaloneSimInterval) {
      clearInterval(standaloneSimInterval);
      standaloneSimInterval = null;
    }
    if (appState) {
      appState.simulator.active = false;
      renderState(appState);
    }
    return;
  }
  await fetch('/api/simulator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: false })
  });
}

// ============================================================================
// COMANDI GF-07 (SMS & CHIAMATA MICROFONO)
// ============================================================================
async function saveTrackerPhone() {
  const phone = document.getElementById('gf07PhoneInput').value.trim();
  if (isStandaloneMode) {
    appState.trackerPhone = phone;
    saveStandaloneState();
    alert('Numero della SIM del GF-07 salvato sul dispositivo!');
    return;
  }
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackerPhone: phone })
  });
  alert('Numero della SIM del GF-07 salvato!');
}

function sendSmsCommand(cmd) {
  const phone = document.getElementById('gf07PhoneInput').value.trim();
  if (!phone) {
    alert('Inserisci prima il numero di telefono della SIM che hai messo dentro il GF-07!');
    document.getElementById('gf07PhoneInput').focus();
    return;
  }
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const sep = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?';
  if (isMobile) {
    window.location.href = `sms:${phone}${sep}body=${encodeURIComponent(cmd)}`;
  } else {
    navigator.clipboard?.writeText(cmd);
    alert(`Su telefono questo pulsante apre direttamente l'SMS verso ${phone}.\n\nComando copiato negli appunti: ${cmd}\nInvia un SMS con scritto "${cmd}" al numero ${phone}.`);
  }
}

function callTrackerMic() {
  const phone = document.getElementById('gf07PhoneInput').value.trim();
  if (!phone) {
    alert('Inserisci prima il numero di telefono della SIM dentro il GF-07!');
    document.getElementById('gf07PhoneInput').focus();
    return;
  }
  window.location.href = `tel:${phone}`;
}

async function parseGf07Sms() {
  const smsText = document.getElementById('gf07SmsTextarea').value.trim();
  if (!smsText) {
    alert('Incolla il testo o il link ricevuto via SMS dal GF-07.');
    return;
  }

  if (isStandaloneMode) {
    const coordRegex = /(-?\d{1,2}\.\d{3,8})\s*[,;/\s]\s*(-?\d{1,3}\.\d{3,8})/;
    const match = smsText.match(coordRegex);
    const batMatch = smsText.match(/(?:bat|battery|batt|pwr)[:=\s]*(\d{1,3})%?/i);
    if (batMatch) appState.currentPosition.batteryPercent = Number(batMatch[1]);
    if (match) {
      updateStandalonePosition({
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
        accuracyMeters: 350,
        source: 'LBS',
        batteryPercent: appState.currentPosition.batteryPercent,
        rawInfo: `Estratto da SMS: "${smsText.slice(0, 70)}"`
      });
      centerOnCat();
    } else if (batMatch) {
      saveStandaloneState();
      renderState(appState);
      alert(`Stato Batteria aggiornato: ${batMatch[1]}%`);
    } else {
      alert('Nessuna coordinata valida trovata nel testo SMS.');
    }
    return;
  }

  const res = await fetch('/api/position', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smsText })
  });
  const data = await res.json();
  if (!data.ok) {
    alert(data.error || 'Impossibile leggere le coordinate dal messaggio.');
    return;
  }
  centerOnCat();
}

function updateSmsConfigPreview() {
  const apn = document.getElementById('apnInput').value.trim() || 'TM';
  const ip = document.getElementById('serverIpInput').value.trim() || 'TUO_IP';
  const port = appState?.serverInfo?.tcpGpsPort || 5023;

  document.getElementById('topinCommandsBox').innerHTML =
    `1) Imposta APN SIM:<br><strong>APN#123456#${apn}#</strong><br><br>` +
    `2) Punta al tuo Server (Zero Abbonamenti):<br><strong>SERVER#${ip}#${port}#</strong>`;

  document.getElementById('tkstarCommandsBox').innerHTML =
    `1) Imposta APN SIM:<br><strong>apn123456 ${apn}</strong><br><br>` +
    `2) Punta al tuo Server (Zero Abbonamenti):<br><strong>adminip123456 ${ip} ${port}</strong>`;
}

// ============================================================================
// IMPOSTAZIONI CASA & RECINTO VIRTUALE
// ============================================================================
function previewRadius(val) {
  document.getElementById('radiusValueLabel').textContent = val;
  if (homeFenceCircle) {
    homeFenceCircle.setRadius(Number(val));
  }
}

function toggleMapHomePicker() {
  pickingHomeOnMap = !pickingHomeOnMap;
  const btn = document.getElementById('pickMapHomeBtn');
  if (pickingHomeOnMap) {
    btn.textContent = '👆 Tocca un punto sulla mappa...';
    btn.classList.add('btn-primary');
  } else {
    btn.textContent = '🖱️ Clicca sulla Mappa';
    btn.classList.remove('btn-primary');
  }
}

function setHomeFromBrowserGps() {
  if (!navigator.geolocation) {
    alert('Geolocalizzazione non supportata dal browser. Usa il tasto "Clicca sulla Mappa" per scegliere casa tua.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const radiusMeters = Number(document.getElementById('radiusSlider').value) || 150;

      if (isStandaloneMode) {
        appState.home.lat = Number(lat.toFixed(6));
        appState.home.lng = Number(lng.toFixed(6));
        appState.home.radiusMeters = radiusMeters;
        if (appState.lbsCalibration && appState.lbsCalibration.enabled && appState.lastRawLbsPosition) {
          appState.lbsCalibration.dLat = appState.home.lat - appState.lastRawLbsPosition.lat;
          appState.lbsCalibration.dLng = appState.home.lng - appState.lastRawLbsPosition.lng;
        }
        updateStandalonePosition({
          lat: appState.home.lat,
          lng: appState.home.lng,
          accuracyMeters: appState.currentPosition.accuracyMeters,
          source: appState.currentPosition.source,
          rawInfo: 'Casa impostata da GPS telefono'
        });
        centerOnHome();
        return;
      }

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home: { lat, lng, radiusMeters },
          teleportCatToHome: true
        })
      });
      centerOnHome();
    },
    () => {
      alert('Permesso GPS negato o non disponibile. Clicca su "🖱️ Clicca sulla Mappa" e tocca il tetto di casa tua!');
    },
    { enableHighAccuracy: true }
  );
}

async function saveHomeAndSettings() {
  const catName = document.getElementById('catNameInput').value.trim() || 'Micio';
  const radiusMeters = Number(document.getElementById('radiusSlider').value) || 150;

  if (isStandaloneMode) {
    appState.catName = catName;
    appState.home.radiusMeters = radiusMeters;
    updateStandalonePosition({
      lat: appState.home.lat,
      lng: appState.home.lng,
      accuracyMeters: appState.currentPosition.accuracyMeters,
      source: appState.currentPosition.source,
      rawInfo: 'Impostazioni recinto salvate'
    });
    centerOnHome();
    return;
  }

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      catName,
      home: { radiusMeters },
      teleportCatToHome: true
    })
  });
  centerOnHome();
}

async function clearTrailHistory() {
  if (isStandaloneMode) {
    appState.history = [
      {
        lat: appState.currentPosition.lat,
        lng: appState.currentPosition.lng,
        source: appState.currentPosition.source,
        accuracyMeters: appState.currentPosition.accuracyMeters,
        timestamp: new Date().toISOString()
      }
    ];
    saveStandaloneState();
    renderState(appState);
    return;
  }
  await fetch('/api/clear-history', { method: 'POST' });
}

// ============================================================================
// AVVIO IBRIDO: SERVER LOCALE PC OPPURE STANDALONE SU GITHUB PAGES
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  initMap();
  updateSmsConfigPreview();

  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error('No local server');
    const initial = await res.json();
    renderState(initial);

    const evtSource = new EventSource('/api/stream');
    evtSource.onmessage = (event) => {
      try {
        renderState(JSON.parse(event.data));
      } catch (err) {}
    };
  } catch (e) {
    // Modalità Standalone attiva (GitHub Pages / iPhone / Android senza PC)
    isStandaloneMode = true;
    document.getElementById('headerModelText').textContent = 'Modalità Cloud Autonoma (GitHub Pages) • 0€';
    const localState = loadStandaloneState();
    renderState(localState);

    // Sincronizza subito col tuo GF-07 (ID: 30506385902) e poi ogni 15 secondi
    syncStandaloneGf07FromBrowser();
    setInterval(() => {
      syncStandaloneGf07FromBrowser();
    }, 15000);
  }
});
