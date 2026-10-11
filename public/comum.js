/* Código partilhado pelo dashboard do iPad (app.js) e pela versão iPhone (iphone.html).
   ES5 propositadamente: tem de correr no Safari 9 do iPad 2. */
(function () {
  'use strict';

  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Códigos WMO (Open-Meteo) -> [ícone dia, ícone noite, descrição]
  var TEMPO = {
    0: ['☀️', '🌙', 'Céu limpo'],
    1: ['🌤', '🌙', 'Pouco nublado'],
    2: ['⛅️', '☁️', 'Parcialmente nublado'],
    3: ['☁️', '☁️', 'Nublado'],
    45: ['🌫', '🌫', 'Nevoeiro'], 48: ['🌫', '🌫', 'Nevoeiro'],
    51: ['🌦', '🌧', 'Chuvisco fraco'], 53: ['🌦', '🌧', 'Chuvisco'], 55: ['🌧', '🌧', 'Chuvisco forte'],
    56: ['🌧', '🌧', 'Chuvisco gelado'], 57: ['🌧', '🌧', 'Chuvisco gelado'],
    61: ['🌦', '🌧', 'Chuva fraca'], 63: ['🌧', '🌧', 'Chuva'], 65: ['🌧', '🌧', 'Chuva forte'],
    66: ['🌧', '🌧', 'Chuva gelada'], 67: ['🌧', '🌧', 'Chuva gelada'],
    71: ['🌨', '🌨', 'Neve fraca'], 73: ['🌨', '🌨', 'Neve'], 75: ['❄️', '❄️', 'Neve forte'], 77: ['🌨', '🌨', 'Grãos de neve'],
    80: ['🌦', '🌧', 'Aguaceiros fracos'], 81: ['🌧', '🌧', 'Aguaceiros'], 82: ['⛈', '⛈', 'Aguaceiros fortes'],
    85: ['🌨', '🌨', 'Aguaceiros de neve'], 86: ['🌨', '🌨', 'Aguaceiros de neve'],
    95: ['⛈', '⛈', 'Trovoada'], 96: ['⛈', '⛈', 'Trovoada com granizo'], 99: ['⛈', '⛈', 'Trovoada com granizo']
  };
  function tempo(codigo) { return TEMPO[codigo] || ['❔', '❔', '—']; }

  var ICONE_TIPO = { consulta: '🏥', escola: '🏫', evento: '🎈', outro: '📌' };
  var NIVEL_AVISO = { yellow: 'amarelo', orange: 'laranja', red: 'vermelho' };

  function direcaoVento(graus) {
    var r = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return r[Math.round(((graus % 360) / 45)) % 8];
  }
  function nivelUV(uv) {
    return uv < 3 ? 'baixo' : uv < 6 ? 'moderado' : uv < 8 ? 'alto' : uv < 11 ? 'muito alto' : 'extremo';
  }
  function nivelAr(aqi) {
    return aqi <= 20 ? 'bom' : aqi <= 40 ? 'razoável' : aqi <= 60 ? 'moderado' : aqi <= 80 ? 'fraco' : 'muito fraco';
  }
  function nivelPolen(v) { return v < 10 ? 'baixo' : v < 50 ? 'moderado' : 'elevado'; }

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
    if (k === hojeK) return 'Hoje';
    if (k === amanhaK) return 'Amanhã';
    var d = deChave(k);
    return DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MESES_CURTOS[d.getMonth()];
  }

  function euros(v) {
    var neg = v < 0;
    var partes = Math.abs(v).toFixed(2).split('.');
    var inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
    if (maxChuva >= 40) dicas.push('☂️ Levar guarda-chuva (' + maxChuva + '%)');
    if (minTemp <= 10) dicas.push('❄️ Agasalhar bem (' + minTemp + '°)');
    else if (minTemp <= 15) dicas.push('🌬 Levar casaco (' + minTemp + '° mais logo)');
    if (maxTemp >= 32) dicas.push('💧 Muito calor, levar água');
    if (hoje.uv >= 6) dicas.push('😎 Protetor solar (UV ' + hoje.uv + ')');
    if (m.atual.rajada >= 50) dicas.push('💨 Vento forte');
    if (m.ar && m.ar.polen && m.ar.polen.valor >= 50) dicas.push('🌾 Pólen elevado (' + esc(m.ar.polen.tipo) + ')');
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

  window.Comum = {
    DIAS: DIAS, DIAS_CURTOS: DIAS_CURTOS, MESES: MESES, MESES_CURTOS: MESES_CURTOS,
    TEMPO: TEMPO, tempo: tempo, ICONE_TIPO: ICONE_TIPO, NIVEL_AVISO: NIVEL_AVISO,
    direcaoVento: direcaoVento, nivelUV: nivelUV, nivelAr: nivelAr, nivelPolen: nivelPolen,
    pad: pad, esc: esc, chaveDia: chaveDia, deChave: deChave, hhmm: hhmm, chip: chip, nomeDia: nomeDia,
    euros: euros, dicasTempo: dicasTempo, getJSON: getJSON
  };
})();
