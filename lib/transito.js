// Tempos de viagem de casa para vários destinos, com trânsito em tempo real.
//
// Fontes:
//   - TomTom Routing API (config.transito.tomtomChave): trânsito em tempo real, grátis até 2500 pedidos/dia.
//     6 destinos a cada 5 minutos = ~1700/dia, por isso cabe no gratuito.
//   - Sem chave: OSRM (servidor público de demonstração), só tempos SEM trânsito, para ver a funcionar.
// Os resultados ficam em cache durante config.transito.intervaloMinutos (5 por omissão).

var L = require('./idioma').L;

function criar(opcoes) {
  var cfg = opcoes.config || {};
  var intervalo = (cfg.intervaloMinutos || 5) * 60 * 1000;
  var cache = null; // { chave, t, v }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // Fora deste horário não se gastam pedidos: fica o último resultado
  function dentroDoHorario(agora) {
    var de = cfg.horaInicio || '06:00', ate = cfg.horaFim || '23:00';
    var m = agora.getHours() * 60 + agora.getMinutes();
    var p = function (t) { var x = t.split(':'); return +x[0] * 60 + +x[1]; };
    return m >= p(de) && m < p(ate);
  }

  function tomtom(casa, d) {
    var url = 'https://api.tomtom.com/routing/1/calculateRoute/' +
      casa.lat + ',' + casa.lng + ':' + d.lat + ',' + d.lng + '/json' +
      '?key=' + encodeURIComponent(cfg.tomtomChave) +
      '&traffic=true&computeTravelTimeFor=all&routeType=fastest&travelMode=car&language=' + L('pt-PT', 'en-GB');
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('TomTom HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var s = j.routes[0].summary;
      return {
        segundos: s.travelTimeInSeconds,
        normal: s.noTrafficTravelTimeInSeconds || s.historicTrafficTravelTimeInSeconds || s.travelTimeInSeconds,
        atraso: s.trafficDelayInSeconds || 0,
        metros: s.lengthInMeters
      };
    });
  }

  function osrm(casa, d) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' + casa.lng + ',' + casa.lat + ';' + d.lng + ',' + d.lat + '?overview=false';
    return fetch(url, { headers: { 'User-Agent': 'familydesk (painel familiar)' } }).then(function (r) {
      if (!r.ok) throw new Error('OSRM HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var rt = j.routes[0];
      return { segundos: Math.round(rt.duration), normal: Math.round(rt.duration), atraso: 0, metros: Math.round(rt.distance) };
    });
  }

  function linkMaps(casa, d) {
    return 'https://www.google.com/maps/dir/?api=1&origin=' + casa.lat + ',' + casa.lng +
      '&destination=' + d.lat + ',' + d.lng + '&travelmode=driving';
  }

  function estado(r) {
    var extra = r.segundos - r.normal;
    var rel = r.normal ? extra / r.normal : 0;
    return extra < 120 || rel < 0.1 ? 'ok' : rel < 0.3 ? 'lento' : 'mau';
  }

  function espera(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // Pedidos em série (o plano gratuito da TomTom limita pedidos por segundo)
  function emSerie(lista, fn) {
    var out = [];
    return lista.reduce(function (p, x, i) {
      return p.then(function () { return i ? espera(300) : null; }).then(function () {
        // um pedido recusado por excesso (HTTP 429) é repetido uma vez, um segundo depois
        return fn(x).catch(function (e) { if (!/429/.test(e.message)) throw e; return espera(1000).then(function () { return fn(x); }); })
          .then(function (v) { out[i] = v; }, function (e) { out[i] = { erro: e.message }; });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  // casa: { nome, lat, lng }; destinos: [{ id, nome, lat, lng, icone }]
  function calcular(casa, destinos) {
    destinos = (destinos || []).filter(function (d) { return isFinite(d.lat) && isFinite(d.lng); });
    if (!casa || !isFinite(casa.lat) || !destinos.length) return Promise.resolve(null);
    var chave = JSON.stringify([casa.lat, casa.lng, destinos.map(function (d) { return [d.id, d.lat, d.lng, d.nome, d.icone, d.logo]; })]);
    var agora = new Date();
    if (cache && cache.chave === chave && (Date.now() - cache.t < intervalo || !dentroDoHorario(agora))) return Promise.resolve(cache.v);

    var fonte = cfg.tomtomChave ? 'tomtom' : 'osrm';
    var fn = fonte === 'tomtom' ? tomtom : osrm;
    return emSerie(destinos, function (d) { return fn(casa, d); }).then(function (res) {
      var rotas = destinos.map(function (d, i) {
        var r = res[i];
        var base = { id: d.id, nome: d.nome, icone: d.icone || '📍', logo: d.logo || null, link: linkMaps(casa, d) };
        if (!r || r.erro) return Object.assign(base, { erro: (r && r.erro) || L('sem rota', 'no route') });
        return Object.assign(base, {
          minutos: Math.round(r.segundos / 60),
          normal: Math.round(r.normal / 60),
          atraso: Math.max(0, Math.round((r.segundos - r.normal) / 60)),
          km: Math.round(r.metros / 100) / 10,
          chegada: hhmm(new Date(Date.now() + r.segundos * 1000)),
          estado: fonte === 'tomtom' ? estado(r) : 'sem-dados'
        });
      });
      var v = { fonte: fonte, comTransito: fonte === 'tomtom', atualizado: Date.now(), casa: casa.nome || L('Casa', 'Home'), rotas: rotas };
      // se tudo falhou, mantém o último resultado bom
      if (rotas.every(function (r) { return r.erro; }) && cache) return cache.v;
      cache = { chave: chave, t: Date.now(), v: v };
      return v;
    });
  }

  return { calcular: calcular };
}

// Extrai coordenadas de um link do Google Maps ou de "lat, lng".
// O ponto exato do sítio vem em "!3d<lat>!4d<lng>"; "@lat,lng" é só o centro do mapa.
function coordenadasDeTexto(t) {
  t = decodeURIComponent(String(t || ''));
  var m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) ||
    /[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t) ||
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t) ||
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(t);
  if (!m) return null;
  var nome = /\/maps\/place\/([^/@]+)/.exec(t);
  return { lat: +m[1], lng: +m[2], nome: nome ? nome[1].replace(/\+/g, ' ') : '' };
}

// Links curtos (maps.app.goo.gl) redirecionam para o link completo
function resolverLink(url) {
  var direto = coordenadasDeTexto(url);
  if (direto) return Promise.resolve(direto);
  if (!/^https?:\/\//.test(url)) return Promise.resolve(null);
  return fetch(url, { redirect: 'follow' }).then(function (r) {
    return coordenadasDeTexto(r.url) || r.text().then(function (html) { return coordenadasDeTexto(html); });
  }).catch(function () { return null; });
}

module.exports = { criar: criar, coordenadasDeTexto: coordenadasDeTexto, resolverLink: resolverLink };
