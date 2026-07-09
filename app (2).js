// ═══════════════════════════════════════════
//  L-3 LOGÍSTICA — app.js
// ═══════════════════════════════════════════

// ── Tabs ──
function showTab(name, el) {
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  // Activar nav item correcto
  var navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  if (name === 'gps' && mapInstance) { mapInstance.invalidateSize(); }
}

// ── Tema del mapa claro / oscuro ──
var mapaOscuro = true;
var tilesOscuro = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
var tilesClaro  = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
var tileLayer = null;

function toggleTemaMapa() {
  mapaOscuro = !mapaOscuro;
  var btn = document.getElementById('btnTema');
  btn.textContent = mapaOscuro ? '🌙' : '☀️';
  if (tileLayer) mapInstance.removeLayer(tileLayer);
  tileLayer = L.tileLayer(mapaOscuro ? tilesOscuro : tilesClaro, {
    attribution: '&copy; OSM &copy; CARTO',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(mapInstance);
  // Mandar al fondo para que los marcadores queden encima
  tileLayer.bringToBack();
}

// ════════════════════════════════════════════
//  MAPA — Leaflet + OpenStreetMap
// ════════════════════════════════════════════
var mapInstance    = null;
var userMarker     = null;
var destinoMarker  = null;
var rutaLine       = null;
var reportando     = false;
var followMode     = false;
var watchId        = null;

var ORS_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjU1YjJhNTM5ZGY2ODRjMDFhOTUwOTBlMjI4OWE3ZmRjIiwiaCI6Im11cm11cjY0In0=";

var PELIGRO_CFG = {
  puente_bajo:       { icon: '🌉', color: '#f1c40f', label: 'Puente bajo' },
  calle_restringida: { icon: '🚫', color: '#e50914', label: 'Prohibido camiones' },
  bascula:           { icon: '⚖️', color: '#3498db', label: 'Báscula / inspección' },
  peligro:           { icon: '⚠️', color: '#e67e22', label: 'Peligro / accidente' }
};

// Aviso HTTPS automático
document.addEventListener('DOMContentLoaded', function() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    document.getElementById('httpsWarning').style.display = 'block';
  }
  initMap();
  renderNotas();
  agregarMensajeIA('ia', '¡Qué onda colega! Aquí Jimena en la frecuencia de L-3. ¿En qué ruta andas hoy? 🚛');
});

function initMap() {
  mapInstance = L.map('googleMap', { zoomControl: true }).setView([27.4765, -99.5154], 12);

  tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(mapInstance);

  // GPS en vivo
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(function(pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (!userMarker) {
        var icon = L.divIcon({
          className: '',
          html: '<div style="width:18px;height:18px;border-radius:50%;background:#e50914;border:3px solid #fff;box-shadow:0 0 0 4px rgba(229,9,20,0.35);"></div>',
          iconSize: [18,18], iconAnchor: [9,9]
        });
        userMarker = L.marker([lat, lng], { icon: icon, title: 'Tu ubicación' }).addTo(mapInstance);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
      if (followMode) mapInstance.setView([lat, lng], mapInstance.getZoom());
    }, function(err) {
      var st = document.getElementById('gpsStatus');
      if (st && err.code === 1) st.textContent = '❌ Permisos de GPS denegados — actívalos en tu celular';
    }, { enableHighAccuracy: true, maximumAge: 5000 });
  }

  // Cargar peligros desde Firebase
  window.onPeligroAdded = agregarPeligroAlMapa;
  if (window._peligrosBuffer && window._peligrosBuffer.length) {
    window._peligrosBuffer.forEach(agregarPeligroAlMapa);
    window._peligrosBuffer = [];
  }

  // Click en modo reporte
  mapInstance.on('click', function(e) {
    if (!reportando) return;
    toggleReporte();
    abrirFormularioPeligro(e.latlng.lat, e.latlng.lng);
  });
}

// ── Modo seguimiento ──
function toggleFollow() {
  followMode = !followMode;
  var btn = document.getElementById('btnFollow');
  btn.style.background = followMode ? 'var(--red)' : 'rgba(20,20,20,0.85)';
  btn.style.border = followMode ? 'none' : '1px solid #333';
  var st = document.getElementById('gpsStatus');
  if (st) st.textContent = followMode ? '🧭 Modo seguimiento activo' : 'Modo seguimiento desactivado';
}

// ── Pantalla completa ──
function toggleFullscreen() {
  var el = document.getElementById('googleMap');
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen).call(document);
  }
  setTimeout(function() { if (mapInstance) mapInstance.invalidateSize(); }, 400);
}

// ── Centrar en mi posición ──
function centrarUbicacion() {
  var st = document.getElementById('gpsStatus');
  st.textContent = '📍 Obteniendo tu ubicación...';
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      mapInstance.setView([pos.coords.latitude, pos.coords.longitude], 14);
      st.textContent = '✅ Ubicación encontrada';
    },
    function() { st.textContent = '⚠️ No se pudo obtener ubicación'; },
    { timeout: 8000, enableHighAccuracy: true }
  );
}

// ── Ir a ciudad ──
function irACiudad(lat, lng, zoom, nombre) {
  if (!mapInstance) return;
  mapInstance.setView([lat, lng], zoom || 11);
  if (destinoMarker) mapInstance.removeLayer(destinoMarker);
  destinoMarker = L.marker([lat, lng]).addTo(mapInstance);
  if (nombre) destinoMarker.bindPopup(nombre).openPopup();

  var st = document.getElementById('gpsStatus');
  if (st) {
    st.innerHTML = '📍 ' + (nombre||'') +
      ' &nbsp;|&nbsp; <button onclick="trazarRutaEnMapa(' + lat + ',' + lng + ',\'' + (nombre||'').replace(/'/g,'') + '\')" ' +
      'style="background:var(--red);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-family:Bebas Neue,sans-serif;font-size:14px;letter-spacing:1px;cursor:pointer;">🚛 TRAZAR RUTA</button>';
  }
  if (nombre) cargarClimaOverlay(lat, lng, nombre);
}

// ── Autocomplete de destino (Nominatim) ──
var sugerenciasTimer = null;

function sugerirDestino(q) {
  clearTimeout(sugerenciasTimer);
  var box = document.getElementById('sugerenciasBox');
  if (!q || q.length < 3) { box.style.display = 'none'; return; }

  sugerenciasTimer = setTimeout(function() {
    fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=5&addressdetails=1', {
      headers: { 'Accept-Language': 'es' }
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res || !res.length) { box.style.display = 'none'; return; }
      box.innerHTML = res.map(function(r) {
        var nombre = r.display_name.split(',').slice(0,3).join(', ');
        var tipo   = r.type || r.class || '';
        var icono  = tipo.includes('city') || tipo.includes('town') ? '🏙️'
                   : tipo.includes('road') || tipo.includes('highway') ? '🛣️'
                   : tipo.includes('fuel') ? '⛽'
                   : tipo.includes('country') ? '🌎' : '📍';
        return '<div onclick="seleccionarSugerencia(' + r.lat + ',' + r.lon + ',\'' + nombre.replace(/'/g, '') + '\')" ' +
          'style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #1f1f1f;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#ddd;' +
          'display:flex;gap:8px;align-items:flex-start;" ' +
          'onmouseover="this.style.background=\'#1a1a1a\'" onmouseout="this.style.background=\'\'">' +
          '<span style="flex-shrink:0;font-size:14px;">' + icono + '</span>' +
          '<span>' + nombre + '</span></div>';
      }).join('');
      box.style.display = 'block';
    })
    .catch(function() { box.style.display = 'none'; });
  }, 350); // espera 350ms después de que el usuario deja de escribir
}

function seleccionarSugerencia(lat, lng, nombre) {
  document.getElementById('inputDestino').value = nombre;
  cerrarSugerencias();
  irACiudad(parseFloat(lat), parseFloat(lng), 13, nombre);
}

function cerrarSugerencias() {
  var box = document.getElementById('sugerenciasBox');
  if (box) box.style.display = 'none';
}

// Cerrar sugerencias al tocar el mapa
document.addEventListener('click', function(e) {
  if (!e.target.closest('#inputDestino') && !e.target.closest('#sugerenciasBox')) {
    cerrarSugerencias();
  }
});

// ── Buscar destino (Nominatim) ──
function buscarDestino() {
  var q = (document.getElementById('inputDestino').value || '').trim();
  if (!q) return;
  var st = document.getElementById('gpsStatus');
  st.textContent = '🔍 Buscando "' + q + '"...';
  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=1', {
    headers: { 'Accept-Language': 'es' }
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (!res || !res.length) { st.textContent = '⚠️ No se encontró "' + q + '" · intenta con más detalle'; return; }
    var lat = parseFloat(res[0].lat), lng = parseFloat(res[0].lon);
    var nombre = res[0].display_name.split(',')[0];
    irACiudad(lat, lng, 13, nombre);
  })
  .catch(function() { st.textContent = '⚠️ Sin conexión al buscador'; });
}

// ── Clima en overlay del mapa ──
async function cargarClimaOverlay(lat, lng, nombre) {
  var ov   = document.getElementById('climaOverlay');
  var elN  = document.getElementById('climaOverlay-nombre');
  var elT  = document.getElementById('climaOverlay-temp');
  var elD  = document.getElementById('climaOverlay-desc');
  var elV  = document.getElementById('climaOverlay-viento');
  ov.style.display = 'block';
  elN.textContent = nombre.toUpperCase();
  elT.textContent = '...';
  elD.textContent = '';
  elV.textContent = '';
  try {
    var res  = await fetch('https://wttr.in/' + lat + ',' + lng + '?format=j1');
    var data = await res.json();
    var cur  = data.current_condition[0];
    elT.textContent = cur.temp_C + '°C';
    elD.textContent = cur.lang_es ? cur.lang_es[0].value : cur.weatherDesc[0].value;
    elV.textContent = '💨 ' + cur.windspeedKmph + ' km/h · 💧 ' + cur.humidity + '%';
  } catch(e) {
    elT.textContent = '--';
    elD.textContent = 'Sin conexión';
  }
}

// ── Trazar ruta HGV (OpenRouteService) ──
// Puentes internacionales para camiones (Nuevo Laredo ↔ Laredo TX)
var WORLD_TRADE_BRIDGE = { lat: 27.5697, lng: -99.4839 }; // Puente Colombia / World Trade

function esCrossBorder(oLat, oLng, dLat, dLng) {
  // Detecta si la ruta cruza la frontera México-USA (lat ~27.5)
  var enMX = oLat < 27.58;
  var enUS = dLat > 27.49 && dLng > -100 && dLng < -98;
  var enMX2 = dLat < 27.58;
  var enUS2 = oLat > 27.49 && oLng > -100 && oLng < -98;
  return (enMX && enUS) || (enMX2 && enUS2);
}

function trazarRutaEnMapa(destLat, destLng, nombreDestino) {
  var st = document.getElementById('gpsStatus');
  st.textContent = '🚛 Calculando ruta para camión pesado...';
  if (!navigator.geolocation) { st.textContent = '⚠️ Activa el GPS para trazar la ruta'; return; }

  navigator.geolocation.getCurrentPosition(function(pos) {
    var oLat = pos.coords.latitude, oLng = pos.coords.longitude;

    // Si cruza la frontera → forzar waypoint en World Trade Bridge (camiones)
    var coords = [[oLng, oLat], [destLng, destLat]];
    if (esCrossBorder(oLat, oLng, destLat, destLng)) {
      coords = [[oLng, oLat], [WORLD_TRADE_BRIDGE.lng, WORLD_TRADE_BRIDGE.lat], [destLng, destLat]];
      st.textContent = '🌉 Ruta via World Trade Bridge (camiones)...';
    }

    fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson', {
      method: 'POST',
      headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: coords,
        options: {
          vehicle_type: 'hgv',
          profile_params: {
            restrictions: { height: 4.5, width: 2.6, weight: 40, axleload: 11.5 }
          }
        },
        instructions: false
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.features || !data.features.length) {
        st.textContent = '⚠️ No se encontró ruta para camión · verifica el destino'; return;
      }
      var route  = data.features[0];
      var puntos = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
      if (rutaLine) mapInstance.removeLayer(rutaLine);
      rutaLine = L.polyline(puntos, { color: '#e50914', weight: 6, opacity: 0.9 }).addTo(mapInstance);
      mapInstance.fitBounds(rutaLine.getBounds(), { padding: [30,30] });

      var props = route.properties.summary;
      var km    = (props.distance / 1000).toFixed(0);
      var horas = Math.floor(props.duration / 3600);
      var mins  = Math.round((props.duration % 3600) / 60);
      var tiempoStr = (horas > 0 ? horas + 'h ' : '') + mins + 'min';

      st.innerHTML = '🚛 ' + km + ' km · ' + tiempoStr + ' · ' + (nombreDestino||'destino') +
        (esCrossBorder(oLat,oLng,destLat,destLng) ? ' <span style="color:#f1c40f;font-size:9px;">🌉 World Trade Bridge</span>' : ' <span style="color:#f1c40f;font-size:9px;">· HGV camión</span>');

      // Activar modo viaje
      iniciarModoViaje(nombreDestino, km, tiempoStr);
      peligrosEnRuta(puntos);
    })
    .catch(function() { st.textContent = '⚠️ Error al calcular ruta · intenta de nuevo'; });

  }, function() { st.textContent = '⚠️ No se pudo obtener tu ubicación GPS'; },
  { timeout: 10000, enableHighAccuracy: true });
}

// ── MODO VIAJE ──
var viajeActivo = false;
var viajeTimer  = null;
var viajeSegundos = 0;

function iniciarModoViaje(destino, km, tiempo) {
  viajeActivo = true;
  viajeSegundos = 0;
  var panel = document.getElementById('panelViaje');
  if (!panel) return;
  panel.style.display = 'block';
  document.getElementById('viajeDestino').textContent = destino || 'Destino';
  document.getElementById('viajeKm').textContent = km + ' km';
  document.getElementById('viajeTiempoEstimado').textContent = tiempo;
  if (viajeTimer) clearInterval(viajeTimer);
  viajeTimer = setInterval(function() {
    viajeSegundos++;
    var h = Math.floor(viajeSegundos/3600);
    var m = Math.floor((viajeSegundos%3600)/60);
    var s = viajeSegundos%60;
    document.getElementById('viajeTimer').textContent =
      (h>0 ? h+'h ':'')+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'s';
  }, 1000);
}

function terminarViaje() {
  viajeActivo = false;
  if (viajeTimer) clearInterval(viajeTimer);
  var panel = document.getElementById('panelViaje');
  if (panel) panel.style.display = 'none';
  if (rutaLine) { mapInstance.removeLayer(rutaLine); rutaLine = null; }
  document.getElementById('gpsStatus').textContent = '✅ Viaje terminado · Buen trabajo 🚛';
}

// ── Peligros en el mapa ──
function agregarPeligroAlMapa(data) {
  window._todosPeligros = window._todosPeligros || [];
  window._todosPeligros.push(data);
  var cfg  = PELIGRO_CFG[data.tipo] || { icon: '⚠️', color: '#888', label: data.tipo };
  var icon = L.divIcon({
    className: '',
    html: '<div style="background:' + cfg.color + ';width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"><span style="transform:rotate(45deg);font-size:13px;">' + cfg.icon + '</span></div>',
    iconSize: [26,26], iconAnchor: [13,26]
  });
  var m = L.marker([data.lat, data.lng], { icon: icon }).addTo(mapInstance);
  m.bindPopup(
    '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;line-height:1.5;">' +
    '<b>' + cfg.icon + ' ' + cfg.label + '</b><br/>' +
    (data.nota ? data.nota + '<br/>' : '') +
    '<span style="color:#888;">Reportado por ' + (data.reportadoPor||'Trailero') + ' · ' + (data.fecha||'') + '</span></div>'
  );
}

function toggleReporte() {
  reportando = !reportando;
  var btn = document.getElementById('btnReportar');
  var st  = document.getElementById('gpsStatus');
  if (!btn) return;
  if (reportando) {
    btn.textContent = '✖️ CANCELAR REPORTE';
    btn.style.background = '#444';
    mapInstance.getContainer().style.cursor = 'crosshair';
    if (st) st.textContent = '👉 Toca el mapa en el punto exacto del peligro';
  } else {
    btn.textContent = '🚧 REPORTAR';
    btn.style.background = '#e67e22';
    mapInstance.getContainer().style.cursor = '';
  }
}

function abrirFormularioPeligro(lat, lng) {
  var html = '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;min-width:190px;">' +
    '<b style="display:block;margin-bottom:6px;color:#e50914;">¿Qué tipo de peligro?</b>';
  Object.keys(PELIGRO_CFG).forEach(function(k) {
    var t = PELIGRO_CFG[k];
    html += '<button onclick="window.confirmarPeligro(\'' + k + '\',' + lat + ',' + lng + ')" ' +
      'style="display:block;width:100%;margin-bottom:4px;padding:8px;background:#262626;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;text-align:left;font-size:11px;">' +
      t.icon + ' ' + t.label + '</button>';
  });
  html += '</div>';
  L.popup().setLatLng([lat, lng]).setContent(html).openOn(mapInstance);
}

window.confirmarPeligro = function(tipo, lat, lng) {
  mapInstance.closePopup();
  var nota = prompt('Detalles (ej: "Altura 3.8m", "Báscula activa")') || '';
  if (window.reportarPeligroFB) window.reportarPeligroFB(tipo, lat, lng, nota);
  var st = document.getElementById('gpsStatus');
  if (st) st.textContent = '✅ Peligro reportado a la comunidad';
};

// ── Peligros cercanos a la ruta ──
function peligrosEnRuta(routeCoords) {
  var panel  = document.getElementById('panelPeligrosRuta');
  var lista  = document.getElementById('listaPeligrosRuta');
  var todos  = window._todosPeligros || [];
  if (!todos.length) { panel.style.display = 'none'; return; }

  function dist(a, b) {
    var R = 6371, dLat = (b[0]-a[0])*Math.PI/180, dLng = (b[1]-a[1])*Math.PI/180;
    var x = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }

  var encontrados = todos.filter(function(p) {
    return routeCoords.some(function(c) { return dist([p.lat, p.lng], c) < 3; });
  });

  if (!encontrados.length) { panel.style.display = 'none'; return; }

  lista.innerHTML = encontrados.map(function(p) {
    var cfg = PELIGRO_CFG[p.tipo] || { icon: '⚠️', label: p.tipo };
    return '<div style="padding:8px 0;border-bottom:1px solid #1f1f1f;font-family:\'IBM Plex Mono\',monospace;font-size:11px;">' +
      cfg.icon + ' <b>' + cfg.label + '</b>' + (p.nota ? ' · ' + p.nota : '') +
      '<br><span style="color:#555;">Por ' + (p.reportadoPor||'Trailero') + '</span></div>';
  }).join('');
  panel.style.display = 'block';
}

// ── Búsqueda cerca ──
function buscarCerca(tipo) {
  var st = document.getElementById('gpsStatus2');
  st.textContent = '📍 Obteniendo ubicación...';
  if (!navigator.geolocation) {
    window.open('https://www.google.com/maps/search/' + encodeURIComponent(tipo), '_blank'); return;
  }
  navigator.geolocation.getCurrentPosition(
    function(p) {
      st.textContent = '✅ Buscando cerca de ti...';
      window.open('https://www.google.com/maps/search/' + encodeURIComponent(tipo) + '/@' + p.coords.latitude + ',' + p.coords.longitude + ',13z', '_blank');
    },
    function() {
      st.textContent = '⚠️ Sin GPS · Búsqueda general';
      window.open('https://www.google.com/maps/search/' + encodeURIComponent(tipo), '_blank');
    },
    { timeout: 8000 }
  );
}

// ════════════════════════════════════════════
//  CALCULADORA
// ════════════════════════════════════════════
function calcular() {
  var monto  = parseFloat(document.getElementById('monto').value)  || 0;
  var diesel = parseFloat(document.getElementById('diesel').value) || 0;
  var casetas= parseFloat(document.getElementById('casetas').value)|| 0;
  var km     = parseFloat(document.getElementById('km').value)     || 0;
  var rend   = parseFloat(document.getElementById('rend').value)   || 0;
  if (monto <= 0) { alert('Ingresa el monto del viaje.'); return; }
  var gastos   = diesel + casetas;
  var ganancia = monto - gastos;
  var color    = ganancia >= 0 ? '#2ecc71' : '#e50914';
  var extra    = km > 0 && rend > 0 ? '⛽ Litros: <strong>' + (km/rend).toFixed(1) + ' L</strong><br>' : '';
  var res = document.getElementById('calcResult');
  res.innerHTML = extra +
    '💸 Gastos: <strong>$' + gastos.toLocaleString('es-MX',{minimumFractionDigits:2}) + '</strong><br>' +
    '💰 Ganancia: <strong style="color:' + color + ';font-size:17px;">$' + ganancia.toLocaleString('es-MX',{minimumFractionDigits:2}) + '</strong>';
  res.classList.add('show');
}

// ════════════════════════════════════════════
//  JIMENA — IA TRAILERA CON VOZ
// ════════════════════════════════════════════
var WORKER_URL   = "https://jimenaia.brandontristan603.workers.dev";
var PROMPT_JIMENA = "Eres Jimena, una trailera veterana de Nuevo Laredo que trabaja para L-3 Logística. Hablas con jerga amigable de camionero mexicano. Ayudas con: tráfico en rutas NLD→Monterrey, NLD→Matehuala, Laredo TX→San Antonio/Houston/Dallas, tiempos en puentes internacionales, clima en ruta, consejos de diesel, casetas, descanso, mecánica básica, aduana México-USA, cálculo de ganancias, alertas de básculas, puentes bajos. Si preguntan otra cosa, di que solo puedes ayudar con temas de carretera. Responde en español, breve y directo, máximo 3 oraciones. Usa emojis de camiones 🚛.";
var historialJimena  = [];
var reconocimiento   = null;
var escuchando       = false;
var vozRespuestaOn   = false;

function initVoz() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  var r = new SR();
  r.lang = 'es-MX';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = function(e) {
    document.getElementById('iaInput').value = e.results[0][0].transcript;
    toggleVoz();
    enviarIA();
  };
  r.onerror = function() { toggleVoz(); agregarMensajeIA('ia', '🎙️ No te escuché, intenta de nuevo.'); };
  r.onend   = function() { if (escuchando) toggleVoz(); };
  return r;
}

function toggleVoz() {
  if (!reconocimiento) reconocimiento = initVoz();
  if (!reconocimiento) { agregarMensajeIA('ia', '⚠️ Tu navegador no soporta voz. Usa Chrome en Android.'); return; }
  var micBtn = document.getElementById('micBtn');
  var ind    = document.getElementById('vozIndicador');
  if (!escuchando) {
    escuchando = true;
    reconocimiento.start();
    micBtn.style.background = '#e50914';
    micBtn.style.border = 'none';
    ind.style.display = 'block';
  } else {
    escuchando = false;
    reconocimiento.stop();
    micBtn.style.background = '#222';
    micBtn.style.border = '1px solid #444';
    ind.style.display = 'none';
  }
}

function toggleVozRespuesta() {
  vozRespuestaOn = !vozRespuestaOn;
  var btn = document.getElementById('btnVozRespuesta');
  btn.style.background = vozRespuestaOn ? 'var(--red)' : '#222';
  btn.style.color      = vozRespuestaOn ? '#fff' : '#888';
  btn.textContent      = vozRespuestaOn ? '🔊 Voz ON' : '🔊 Voz';
}

function hablarTexto(texto) {
  if (!vozRespuestaOn || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(texto);
  u.lang = 'es-MX'; u.rate = 1.05; u.pitch = 1.1;
  var voces = window.speechSynthesis.getVoices();
  var vozES = voces.find(function(v) { return v.lang.startsWith('es') && v.name.toLowerCase().includes('female'); })
           || voces.find(function(v) { return v.lang.startsWith('es'); });
  if (vozES) u.voice = vozES;
  window.speechSynthesis.speak(u);
}

function agregarMensajeIA(rol, texto) {
  var msgs = document.getElementById('iaMessages');
  var div  = document.createElement('div');
  div.className = rol === 'user' ? 'mensaje-usuario' : 'mensaje-ia';
  div.textContent = texto;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

async function enviarIA() {
  var input = document.getElementById('iaInput');
  var btn   = document.getElementById('iaBtn');
  var msg   = input.value.trim();
  if (!msg) return;
  agregarMensajeIA('user', msg);
  historialJimena.push({ role: 'user', content: msg });
  input.value = '';
  btn.disabled = true; btn.textContent = '...';
  var typing = agregarMensajeIA('ia', '🚛 ...');
  try {
    var res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: PROMPT_JIMENA, historial: historialJimena.slice(-10), mensaje: msg })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var respuesta = data.response || data.text ||
      (data.candidates && data.candidates[0] && data.candidates[0].content &&
       data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) || null;
    if (!respuesta) throw new Error('vacía');
    typing.textContent = respuesta;
    historialJimena.push({ role: 'assistant', content: respuesta });
    hablarTexto(respuesta);
  } catch(e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'))
      typing.textContent = '📡 Sin señal al servidor · Verifica el Worker de Cloudflare.';
    else if (e.message.match(/HTTP [45]/))
      typing.textContent = '⚠️ Worker error ' + e.message + ' · Actualiza la API key de Gemini.';
    else if (e.message === 'vacía')
      typing.textContent = '🔧 Respuesta vacía · Revisa el formato del Worker.';
    else
      typing.textContent = '🔧 Error: ' + e.message;
  }
  btn.disabled = false; btn.textContent = '➤';
}

async function probarWorker() {
  var msgs = document.getElementById('iaMessages');
  var st   = document.createElement('div');
  st.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:10px;color:#888;padding:6px 0;';
  st.textContent = '🔍 Probando Worker...';
  msgs.appendChild(st);
  msgs.scrollTop = msgs.scrollHeight;
  try {
    var r = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ping', mensaje: 'OK', historial: [] })
    });
    st.textContent = 'Worker HTTP ' + r.status + (r.ok ? ' ✅ conectado' : ' ❌ revisa la API key');
  } catch(e) {
    st.textContent = '❌ Worker inaccesible · ' + e.message;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('iaInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') enviarIA();
  });
  document.getElementById('traileroInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && window.enviarTraileroFB) window.enviarTraileroFB();
  });
});

// ════════════════════════════════════════════
//  NOTAS
// ════════════════════════════════════════════
function guardarNota() {
  var titulo = document.getElementById('notaTitulo').value.trim();
  var texto  = document.getElementById('notaTexto').value.trim();
  if (!titulo && !texto) { alert('Escribe algo primero.'); return; }
  var notas = JSON.parse(localStorage.getItem('l3_notas') || '[]');
  notas.unshift({ titulo: titulo || 'Sin título', texto: texto, fecha: new Date().toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}) });
  localStorage.setItem('l3_notas', JSON.stringify(notas));
  document.getElementById('notaTitulo').value = '';
  document.getElementById('notaTexto').value  = '';
  renderNotas();
}

function borrarNota(i) {
  var notas = JSON.parse(localStorage.getItem('l3_notas') || '[]');
  notas.splice(i, 1);
  localStorage.setItem('l3_notas', JSON.stringify(notas));
  renderNotas();
}

function renderNotas() {
  var notas = JSON.parse(localStorage.getItem('l3_notas') || '[]');
  var lista = document.getElementById('listaNotas');
  if (!lista) return;
  if (!notas.length) {
    lista.innerHTML = '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--muted);text-align:center;padding:20px;">No hay notas guardadas</div>';
    return;
  }
  lista.innerHTML = notas.map(function(n, i) {
    return '<div class="card" style="flex-direction:column;gap:6px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div style="font-weight:700;font-size:13px;">📌 ' + n.titulo + '</div>' +
      '<button onclick="borrarNota(' + i + ')" style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;">🗑️</button>' +
      '</div>' +
      '<div style="font-size:12px;line-height:1.5;">' + n.texto + '</div>' +
      '<div style="font-size:10px;color:var(--muted);font-family:\'IBM Plex Mono\',monospace;">' + n.fecha + '</div>' +
      '</div>';
  }).join('');
}

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  // Funciona tanto en root como en subdirectorio (GitHub Pages)
  var swScope = window.location.pathname.replace(/\/[^\/]*$/, '/');
  navigator.serviceWorker.register('./sw.js', { scope: swScope })
    .then(function(reg) { console.log('L-3 SW registrado:', reg.scope); })
    .catch(function(err) { console.log('SW error (no crítico):', err); });
}
