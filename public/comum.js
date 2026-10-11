/* Código partilhado pelo dashboard do iPad (app.js) e pela versão iPhone (iphone.html).
   ES5 propositadamente: tem de correr no Safari 9 do iPad 2. */
(function () {
  'use strict';

  // Idioma (config.json → "idioma"; /idioma.js define window.IDIOMA). L('português', 'English').
  var EN = window.IDIOMA !== 'pt';
  function L(pt, en) { return EN && en != null ? en : pt; }
  // classe no <html> para os textos que vivem no CSS (ex.: "toca para voltar")
  if (EN) document.documentElement.className += ' lang-en';

  var DIAS = EN ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    : ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS_CURTOS = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var MESES = EN ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_CURTOS = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Códigos WMO (Open-Meteo) -> [ícone dia, ícone noite, descrição]
  var TEMPO = {
    0: ['☀️', '🌙', L('Céu limpo', 'Clear sky')],
    1: ['🌤', '🌙', L('Pouco nublado', 'Mainly clear')],
    2: ['⛅️', '☁️', L('Parcialmente nublado', 'Partly cloudy')],
    3: ['☁️', '☁️', L('Nublado', 'Cloudy')],
    45: ['🌫', '🌫', L('Nevoeiro', 'Fog')], 48: ['🌫', '🌫', L('Nevoeiro', 'Fog')],
    51: ['🌦', '🌧', L('Chuvisco fraco', 'Light drizzle')], 53: ['🌦', '🌧', L('Chuvisco', 'Drizzle')], 55: ['🌧', '🌧', L('Chuvisco forte', 'Heavy drizzle')],
    56: ['🌧', '🌧', L('Chuvisco gelado', 'Freezing drizzle')], 57: ['🌧', '🌧', L('Chuvisco gelado', 'Freezing drizzle')],
    61: ['🌦', '🌧', L('Chuva fraca', 'Light rain')], 63: ['🌧', '🌧', L('Chuva', 'Rain')], 65: ['🌧', '🌧', L('Chuva forte', 'Heavy rain')],
    66: ['🌧', '🌧', L('Chuva gelada', 'Freezing rain')], 67: ['🌧', '🌧', L('Chuva gelada', 'Freezing rain')],
    71: ['🌨', '🌨', L('Neve fraca', 'Light snow')], 73: ['🌨', '🌨', L('Neve', 'Snow')], 75: ['❄️', '❄️', L('Neve forte', 'Heavy snow')], 77: ['🌨', '🌨', L('Grãos de neve', 'Snow grains')],
    80: ['🌦', '🌧', L('Aguaceiros fracos', 'Light showers')], 81: ['🌧', '🌧', L('Aguaceiros', 'Showers')], 82: ['⛈', '⛈', L('Aguaceiros fortes', 'Heavy showers')],
    85: ['🌨', '🌨', L('Aguaceiros de neve', 'Snow showers')], 86: ['🌨', '🌨', L('Aguaceiros de neve', 'Snow showers')],
    95: ['⛈', '⛈', L('Trovoada', 'Thunderstorm')], 96: ['⛈', '⛈', L('Trovoada com granizo', 'Thunderstorm with hail')], 99: ['⛈', '⛈', L('Trovoada com granizo', 'Thunderstorm with hail')]
  };
  function tempo(codigo) { return TEMPO[codigo] || ['❔', '❔', '—']; }

  var ICONE_TIPO = { consulta: '🏥', escola: '🏫', evento: '🎈', outro: '📌' };
  var NIVEL_AVISO = { yellow: L('amarelo', 'yellow'), orange: L('laranja', 'orange'), red: L('vermelho', 'red') };

  function direcaoVento(graus) {
    var r = EN ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return r[Math.round(((graus % 360) / 45)) % 8];
  }
  function nivelUV(uv) {
    return uv < 3 ? L('baixo', 'low') : uv < 6 ? L('moderado', 'moderate') : uv < 8 ? L('alto', 'high') : uv < 11 ? L('muito alto', 'very high') : L('extremo', 'extreme');
  }
  function nivelAr(aqi) {
    return aqi <= 20 ? L('bom', 'good') : aqi <= 40 ? L('razoável', 'fair') : aqi <= 60 ? L('moderado', 'moderate') : aqi <= 80 ? L('fraco', 'poor') : L('muito fraco', 'very poor');
  }
  function nivelPolen(v) { return v < 10 ? L('baixo', 'low') : v < 50 ? L('moderado', 'moderate') : L('elevado', 'high'); }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function chaveDia(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function deChave(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function chip(nome, cor) {
    if (!nome) return '';
    return '<span class="chip" style="color:' + esc(cor) + ';border-color:' + esc(cor) + '">' + esc(nome) + '</span>';
  }

  function nomeDia(k, hojeK, amanhaK) {
    if (k === hojeK) return L('Hoje', 'Today');
    if (k === amanhaK) return L('Amanhã', 'Tomorrow');
    var d = deChave(k);
    return DIAS[d.getDay()] + ', ' + dataCurta(d);
  }

  function euros(v) {
    var neg = v < 0;
    var partes = Math.abs(v).toFixed(2).split('.');
    var inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (EN) return (neg ? '−' : '') + '€' + inteiro.replace(/[  ]/g, ',') + '.' + partes[1];
    return (neg ? '−' : '') + inteiro + ',' + partes[1] + ' €';
  }

  // Dicas práticas para quem sai de casa, a partir da previsão
  function dicasTempo(m) {
    var hoje = m.dias[0] || {};
    var maxChuva = 0, minTemp = 99, maxTemp = -99;
    for (var i = 0; i < Math.min(12, m.horas.length); i++) {
      maxChuva = Math.max(maxChuva, m.horas[i].chuva || 0);
      minTemp = Math.min(minTemp, m.horas[i].temp);
      maxTemp = Math.max(maxTemp, m.horas[i].temp);
    }
    var dicas = [];
    if (maxChuva >= 40) dicas.push(L('☂️ Levar guarda-chuva (', '☂️ Take an umbrella (') + maxChuva + '%)');
    if (minTemp <= 10) dicas.push(L('❄️ Agasalhar bem (', '❄️ Wrap up warm (') + minTemp + '°)');
    else if (minTemp <= 15) dicas.push(L('🌬 Levar casaco (', '🌬 Take a jacket (') + minTemp + L('° mais logo)', '° later on)'));
    if (maxTemp >= 32) dicas.push(L('💧 Muito calor, levar água', '💧 Very hot, take water'));
    if (hoje.uv >= 6) dicas.push(L('😎 Protetor solar (UV ', '😎 Sunscreen (UV ') + hoje.uv + ')');
    if (m.atual.rajada >= 50) dicas.push(L('💨 Vento forte', '💨 Strong wind'));
    if (m.ar && m.ar.polen && m.ar.polen.valor >= 50) dicas.push(L('🌾 Pólen elevado (', '🌾 High pollen (') + esc(m.ar.polen.tipo) + ')');
    return dicas;
  }

  function getJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(), true);
    x.timeout = 30000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status === 200) {
        var j;
        try { j = JSON.parse(x.responseText); } catch (e) { return cb(e); }
        cb(null, j);
      } else {
        cb(new Error('HTTP ' + x.status));
      }
    };
    x.send();
  }

  // Data curta: "12 out" (pt) ou "Oct 12" (en)
  function dataCurta(d) { return EN ? MESES_CURTOS[d.getMonth()] + ' ' + d.getDate() : d.getDate() + ' ' + MESES_CURTOS[d.getMonth()]; }

  window.Comum = {
    EN: EN, L: L, dataCurta: dataCurta,
    DIAS: DIAS, DIAS_CURTOS: DIAS_CURTOS, MESES: MESES, MESES_CURTOS: MESES_CURTOS,
    TEMPO: TEMPO, tempo: tempo, ICONE_TIPO: ICONE_TIPO, NIVEL_AVISO: NIVEL_AVISO,
    direcaoVento: direcaoVento, nivelUV: nivelUV, nivelAr: nivelAr, nivelPolen: nivelPolen,
    pad: pad, esc: esc, chaveDia: chaveDia, deChave: deChave, hhmm: hhmm, chip: chip, nomeDia: nomeDia,
    euros: euros, dicasTempo: dicasTempo, getJSON: getJSON
  };
})();
