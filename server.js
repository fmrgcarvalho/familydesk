// Servidor do dashboard: serve a página para o iPad e faz de intermediário
// para a meteorologia (Open-Meteo + IPMA) e calendários (ICS do Outlook / iCloud).
// O iPad 2 (iOS 9) não lida bem com HTTPS moderno nem CORS, por isso tudo passa por aqui.
// Também guarda os dados da família (data/familia.json), editados em /gerir.html.

var fs = require('fs');
var path = require('path');
var http = require('http');
var crypto = require('crypto');

var ROOT = __dirname;
// muda a cada arranque: as páginas abertas recarregam-se sozinhas quando o servidor é atualizado
var VERSAO = String(Date.now());
var FICHEIRO_FAMILIA = path.join(ROOT, 'data', 'familia.json');

function lerJSON(nome, alternativa) {
  var f = path.join(ROOT, nome);
  if (!fs.existsSync(f)) f = path.join(ROOT, alternativa);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

var config = lerJSON('config.json', 'config.example.json');

// O dashboard fica ligado 24h: um erro inesperado fica no log mas não derruba o servidor
process.on('uncaughtException', function (e) { console.error('[erro inesperado]', e && e.stack || e); });
process.on('unhandledRejection', function (e) { console.error('[promessa rejeitada]', e && e.stack || e); });
process.env.TZ = config.fusoHorario || 'Europe/Lisbon';

var ical = require('node-ical');
var escola = require('./lib/escola').criar({ raiz: ROOT, feriadoMunicipal: config.feriadoMunicipal });
var noite = config.modoNoite || {};
var fotos = require('./lib/fotos').criar({ raiz: ROOT, config: noite.fotos });
// fotos a passar na zona da agenda (pasta própria, troca a cada N minutos)
var cfgAgendaFotos = config.agendaFotos || {};
var fotosAgenda = require('./lib/fotos').criar({ raiz: ROOT, config: cfgAgendaFotos });
var frase = require('./lib/frase').criar({ raiz: ROOT });
var transitoLib = require('./lib/transito');
var transito = transitoLib.criar({ config: config.transito });

var cache = {};
function emCache(chave, ttlMs, produzir) {
  var c = cache[chave];
  if (c && Date.now() - c.t < ttlMs) return Promise.resolve(c.v);
  return produzir().then(function (v) {
    cache[chave] = { t: Date.now(), v: v };
    return v;
  }).catch(function (err) {
    console.error('[' + chave + ']', err.message);
    if (c) return c.v; // devolve o último valor bom
    throw err;
  });
}

function obterJSON(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error(url.split('?')[0] + ' HTTP ' + r.status);
    return r.json();
  });
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function chaveDia(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function deChaveDia(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function inicioDoDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function somaDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function arred(v) { return v == null ? null : Math.round(v); }

// ---------- Meteorologia ----------

function previsao() {
  var l = config.local;
  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + l.latitude + '&longitude=' + l.longitude +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,precipitation,is_day' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunshine_duration,sunrise,sunset' +
    '&timezone=' + encodeURIComponent(config.fusoHorario) + '&forecast_days=8';
  return obterJSON(url).then(function (j) {
    var c = j.current, h = j.hourly, d = j.daily;

    // próximas 24 horas a partir da hora atual (os ecrãs mostram de 2 em 2 horas)
    var horaAtual = c.time.slice(0, 13);
    var i0 = 0;
    while (i0 < h.time.length && h.time[i0].slice(0, 13) < horaAtual) i0++;
    var horas = [];
    for (var i = i0; i < h.time.length && horas.length < 24; i++) {
      horas.push({
        hora: parseInt(h.time[i].slice(11, 13), 10),
        temp: arred(h.temperature_2m[i]),
        codigo: h.weather_code[i],
        chuva: h.precipitation_probability[i],
        dia: h.is_day[i] === 1
      });
    }

    var dias = [];
    for (var k = 0; k < d.time.length && dias.length < 8; k++) {
      dias.push({
        dia: d.time[k],
        codigo: d.weather_code[k],
        max: arred(d.temperature_2m_max[k]),
        min: arred(d.temperature_2m_min[k]),
        chuva: d.precipitation_probability_max[k],
        mm: Math.round(d.precipitation_sum[k] * 10) / 10,
        vento: arred(d.wind_speed_10m_max[k]),
        rajada: arred(d.wind_gusts_10m_max[k]),
        uv: Math.round(d.uv_index_max[k]),
        nascer: d.sunrise[k].slice(11, 16),
        por: d.sunset[k].slice(11, 16),
        sensMax: arred(d.apparent_temperature_max[k]),
        sensMin: arred(d.apparent_temperature_min[k]),
        horasChuva: arred(d.precipitation_hours[k]),
        direcao: d.wind_direction_10m_dominant[k],
        sol: Math.round((d.sunshine_duration[k] || 0) / 360) / 10 // horas, 1 casa decimal
      });
    }

    return {
      local: l.nome,
      atual: {
        temp: arred(c.temperature_2m),
        sensacao: arred(c.apparent_temperature),
        humidade: c.relative_humidity_2m,
        vento: arred(c.wind_speed_10m),
        direcao: c.wind_direction_10m,
        rajada: arred(c.wind_gusts_10m),
        uv: Math.round(c.uv_index * 10) / 10,
        precipitacao: c.precipitation,
        codigo: c.weather_code,
        dia: c.is_day === 1
      },
      horas: horas,
      dias: dias
    };
  });
}

function qualidadeAr() {
  var l = config.local;
  var url = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
    '?latitude=' + l.latitude + '&longitude=' + l.longitude +
    '&current=european_aqi,grass_pollen,birch_pollen,olive_pollen,alder_pollen,mugwort_pollen,ragweed_pollen' +
    '&timezone=' + encodeURIComponent(config.fusoHorario);
  var NOMES = { grass_pollen: 'gramíneas', birch_pollen: 'bétula', olive_pollen: 'oliveira', alder_pollen: 'amieiro', mugwort_pollen: 'artemísia', ragweed_pollen: 'ambrósia' };
  return obterJSON(url).then(function (j) {
    var polen = null;
    Object.keys(NOMES).forEach(function (k) {
      var v = j.current[k];
      if (v != null && (!polen || v > polen.valor)) polen = { tipo: NOMES[k], valor: Math.round(v) };
    });
    return { aqi: arred(j.current.european_aqi), polen: polen };
  });
}

// Avisos meteorológicos do IPMA (amarelo/laranja/vermelho) para o distrito configurado
function avisosIPMA() {
  var area = config.ipmaArea;
  if (!area) return Promise.resolve([]);
  return obterJSON('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json').then(function (lista) {
    var agora = new Date();
    var vistos = {};
    return lista.filter(function (w) {
      if (w.idAreaAviso !== area || w.awarenessLevelID === 'green') return false;
      if (new Date(w.endTime) < agora) return false;
      var k = w.awarenessTypeName + w.awarenessLevelID + w.startTime;
      if (vistos[k]) return false;
      return (vistos[k] = true);
    }).map(function (w) {
      return { tipo: w.awarenessTypeName, nivel: w.awarenessLevelID, inicio: new Date(w.startTime).getTime(), fim: new Date(w.endTime).getTime(), texto: w.text || '' };
    }).sort(function (a, b) { return a.inicio - b.inicio; });
  });
}

function meteorologia() {
  return emCache('meteo', 15 * 60 * 1000, function () {
    return Promise.all([
      previsao(),
      qualidadeAr().catch(function (e) { console.error('[ar]', e.message); return null; }),
      avisosIPMA().catch(function (e) { console.error('[ipma]', e.message); return []; })
    ]).then(function (r) {
      var m = r[0];
      m.ar = r[1];
      m.avisos = r[2];
      return m;
    });
  });
}

// ---------- Calendários ----------

function texto(v) { return v && typeof v === 'object' ? (v.val || '') : (v || ''); }

function eventosDoCalendario(cal, de, ate) {
  var url = cal.url.replace(/^webcal:\/\//i, 'https://');
  return ical.async.fromURL(url).then(function (dados) {
    var lista = [];
    Object.keys(dados).forEach(function (k) {
      var ev = dados[k];
      if (!ev || ev.type !== 'VEVENT' || ev.status === 'CANCELLED' || ev.recurrenceid) return;
      ical.expandRecurringEvent(ev, { from: de, to: ate, expandOngoing: true }).forEach(function (inst) {
        var base = { titulo: texto(inst.summary) || '(sem título)', calendario: cal.nome, cor: cal.cor, local: texto(inst.event.location) };
        if (inst.isFullDay) {
          // um registo por cada dia que o evento ocupa
          for (var d = inicioDoDia(inst.start); d < inst.end && d < ate; d = somaDias(d, 1)) {
            if (d >= de) lista.push(Object.assign({ diaInteiro: true, dia: chaveDia(d) }, base));
          }
        } else if (inst.end > de && inst.start < ate) {
          lista.push(Object.assign({ diaInteiro: false, inicio: inst.start.getTime(), fim: inst.end.getTime(), dia: chaveDia(inst.start < de ? de : inst.start) }, base));
        }
      });
    });
    return lista;
  });
}

// Compromissos de exemplo (DEMO=1) para ver o aspeto sem calendários ligados
function eventosDemo(hoje) {
  function ev(dias, h, m, durMin, titulo, cal, local) {
    var d = somaDias(hoje, dias);
    var cor = cal === 'Outlook' ? '#4aa3ff' : '#ff9f43';
    if (h === null) return { titulo: titulo, diaInteiro: true, dia: chaveDia(d), calendario: cal, cor: cor, local: local || '' };
    var ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    return { titulo: titulo, diaInteiro: false, inicio: ini.getTime(), fim: ini.getTime() + durMin * 60000, dia: chaveDia(ini), calendario: cal, cor: cor, local: local || '' };
  }
  return [
    ev(0, 23, 0, 30, 'Preparar mochilas', 'iPhone'),
    ev(1, 9, 30, 60, 'Reunião de equipa', 'Outlook', 'Teams'),
    ev(1, 19, 30, 60, 'Jantar em casa dos avós', 'iPhone'),
    ev(2, 10, 0, 90, 'Revisão trimestral', 'Outlook'),
    ev(4, 8, 45, 30, 'Dentista', 'iPhone', 'Clínica')
  ];
}

function agendaCalendarios() {
  return emCache('agenda', 10 * 60 * 1000, function () {
    var de = inicioDoDia(new Date());
    var ate = somaDias(de, config.diasAgenda || 7);
    var cals = (config.calendarios || []).filter(function (c) { return c.url && c.url.indexOf('COLA_AQUI') === -1; });
    return Promise.all(cals.map(function (c) {
      return eventosDoCalendario(c, de, ate).catch(function (err) {
        console.error('[calendário ' + c.nome + ']', err.message);
        return [];
      });
    })).then(function (listas) {
      var todos = [].concat.apply([], listas);
      if (process.env.DEMO) todos = todos.concat(eventosDemo(de));
      return todos;
    });
  });
}

// ---------- Família ----------

var DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('-feira', '').trim();
}

function lerFamilia() {
  var f = lerJSON('data/familia.json', 'data/familia.example.json');
  ['filhos', 'atividades', 'eventos', 'aniversarios', 'contas', 'pagamentos', 'horarios', 'destinos', 'prazos'].forEach(function (k) { if (!Array.isArray(f[k])) f[k] = []; });
  // entradas escritas à mão sem id recebem um id estável (derivado do conteúdo)
  ['atividades', 'eventos', 'aniversarios', 'contas', 'pagamentos', 'horarios', 'destinos', 'prazos'].forEach(function (k) {
    f[k].forEach(function (x) { if (!x.id) x.id = crypto.createHash('sha1').update(k + JSON.stringify(x)).digest('hex').slice(0, 8); });
  });
  return f;
}

function guardarFamilia(f) {
  ['atividades', 'eventos', 'aniversarios', 'contas', 'pagamentos', 'horarios', 'destinos', 'prazos'].forEach(function (k) {
    f[k].forEach(function (x) { if (!x.id) x.id = crypto.randomBytes(4).toString('hex'); });
  });
  var tmp = FICHEIRO_FAMILIA + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(f, null, 2), 'utf8');
  fs.renameSync(tmp, FICHEIRO_FAMILIA);
}

function corDe(f, quem) {
  for (var i = 0; i < f.filhos.length; i++) if (f.filhos[i].nome === quem) return f.filhos[i].cor;
  return '#8b949e';
}

// Consultas / eventos pontuais da família, no mesmo formato da agenda
function eventosFamilia(f, de, ate) {
  var lista = [];
  f.eventos.forEach(function (e) {
    if (!e.data) return;
    var p = e.data.split('-');
    var dia = new Date(+p[0], +p[1] - 1, +p[2]);
    if (dia < de || dia >= ate) return;
    var base = { titulo: e.titulo, tipo: e.tipo || 'evento', quem: e.quem || '', cor: corDe(f, e.quem), local: e.local || '', notas: e.notas || '', dia: e.data };
    if (e.inicio) {
      var hm = e.inicio.split(':');
      var ini = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), +hm[0], +hm[1]);
      var fim = ini.getTime() + 60 * 60000;
      if (e.fim) { var hf = e.fim.split(':'); fim = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), +hf[0], +hf[1]).getTime(); }
      lista.push(Object.assign({ diaInteiro: false, inicio: ini.getTime(), fim: fim }, base));
    } else {
      lista.push(Object.assign({ diaInteiro: true }, base));
    }
  });
  return lista;
}

function filhoDe(f, quem) {
  for (var i = 0; i < f.filhos.length; i++) if (f.filhos[i].nome === quem) return f.filhos[i];
  return null;
}

// Info escolar de um dia para um filho (o seu nível e calendário). Sem filho (ex.: "Todos"): calendário nacional.
function diaDoFilho(f, quem, k) {
  var c = filhoDe(f, quem);
  return escola.dia(k, c ? c.nivel || null : null, c ? c.calendario || 'nacional' : 'nacional');
}

// Calendários escolares em uso pelos filhos (para a agenda e o calendário do iPhone)
function calendariosEmUso(f) {
  var l = [];
  f.filhos.forEach(function (c) { var cal = c.calendario || 'nacional'; if (cal !== 'creche' && l.indexOf(cal) < 0) l.push(cal); });
  return l.length ? l : ['nacional'];
}

// Uma atividade faz pausa em feriados e férias escolares, a não ser que tenha pausaFerias: false.
// Devolve o motivo da pausa (ou null se há atividade nesse dia).
function motivoPausa(f, a, k) {
  if (a.pausaFerias === false) return null;
  var info = diaDoFilho(f, a.quem, k);
  return info.feriado ? 'Feriado' : info.interrupcao;
}

// Dia de escola de um filho, a partir do horário da turma. Devolve null se não há aulas
// (fim de semana, feriado, férias, ou o horário não tem nada nesse dia).
function escolaNoDia(f, h, d) {
  var k = chaveDia(d);
  var aulas = (h.aulas || {})[DIAS_SEMANA[d.getDay()]];
  var tempos = h.tempos || [];
  if (!aulas || !aulas.some(Boolean)) return null;
  if (diaDoFilho(f, h.quem, k).semAulas) return null;
  var primeiro = -1, ultimo = -1, ultimoSemAec = -1, disciplinas = [], aec = null;
  tempos.forEach(function (t, i) {
    var a = aulas[i];
    if (!a || t.pausa) return;
    if (primeiro < 0) primeiro = i;
    ultimo = i;
    if (t.aec) aec = a;
    else { ultimoSemAec = i; if (disciplinas.indexOf(a) < 0) disciplinas.push(a); }
  });
  if (primeiro < 0) return null;
  var levar = [];
  disciplinas.concat(aec ? [aec] : []).forEach(function (a) {
    var l = (h.levar || {})[a];
    if (l && levar.indexOf(l) < 0) levar.push(l);
  });
  return {
    dia: k, quem: h.quem, cor: corDe(f, h.quem), escola: h.escola || '',
    entrada: tempos[primeiro].inicio, saida: tempos[ultimo].fim,
    saidaSemAec: ultimoSemAec >= 0 ? tempos[ultimoSemAec].fim : null,
    disciplinas: disciplinas, aec: aec, levar: levar.join(', '),
    tempos: tempos.map(function (t, i) {
      return { inicio: t.inicio, fim: t.fim, pausa: t.pausa || null, aec: !!t.aec, disciplina: t.pausa ? null : (aulas[i] || '') };
    })
  };
}

function resumoFamilia(f) {
  var hoje = inicioDoDia(new Date());

  var aniversarios = f.aniversarios.map(function (a) {
    var p = String(a.data).split('-'); // "MM-DD"
    var mes = parseInt(p[0], 10) - 1, dia = parseInt(p[1], 10);
    var prox = new Date(hoje.getFullYear(), mes, dia);
    if (prox < hoje) prox = new Date(hoje.getFullYear() + 1, mes, dia);
    return {
      nome: a.nome, nota: a.nota || '', familia: !!a.familia,
      quem: a.familia ? '' : a.quem || '', cor: corDe(f, a.familia ? a.nome : a.quem),
      dia: chaveDia(prox), faltam: Math.round((prox - hoje) / 86400000),
      idade: a.ano ? prox.getFullYear() - a.ano : null
    };
  });
  // Aniversários da família: contagem decrescente sempre visível
  // na faixa: os filhos sempre; o resto da família quando faltam 120 dias ou menos
  var nomesFilhos = f.filhos.map(function (c) { return c.nome; });
  var contagemAnivs = aniversarios.filter(function (a) { return a.familia && (nomesFilhos.indexOf(a.nome) >= 0 || a.faltam <= (config.diasContagemFamilia || 120)); })
    .sort(function (a, b) { return a.faltam - b.faltam; })
    .map(function (a) {
      return {
        icone: a.faltam === 0 ? '🎉' : '🎂',
        texto: a.faltam === 0 ? a.nome + ' faz anos hoje!' + (a.idade ? ' (' + a.idade + ')' : '')
          : a.faltam === 1 ? a.nome + ' faz anos amanhã'
          : a.nome + ' faz anos em ' + a.faltam + ' dias'
      };
    });
  // painel: família sempre (por ordem), colegas só nos próximos N dias
  aniversarios = aniversarios.filter(function (a) { return a.familia || a.faltam <= (config.diasAniversarios || 30); })
    .sort(function (a, b) { return a.faltam - b.faltam; });

  // Atividades dos próximos 7 dias, já sem as que fazem pausa (feriados / férias)
  var atividades = [], dias = [], escolaDias = [];
  for (var off = 0; off < 7; off++) {
    var d = somaDias(hoje, off), k = chaveDia(d);
    var info = escola.dia(k);
    var pausas = [];
    calendariosEmUso(f).forEach(function (cal) {
      var i2 = escola.dia(k, null, cal);
      if (i2.interrupcao && pausas.indexOf(i2.interrupcao) < 0) pausas.push(i2.interrupcao);
      if (i2.especial && pausas.indexOf(i2.especial) < 0) pausas.push(i2.especial);
    });
    var pausadas = 0;
    f.atividades.forEach(function (a) {
      if (DIAS_SEMANA.indexOf(normalizar(a.dia)) !== d.getDay()) return;
      if (motivoPausa(f, a, k)) { pausadas++; return; }
      atividades.push({
        dia: k, quem: a.quem || '', cor: corDe(f, a.quem), atividade: a.atividade,
        inicio: a.inicio || '', fim: a.fim || '', local: a.local || '', levar: a.levar || ''
      });
    });
    dias.push({ dia: k, feriado: info.feriado, interrupcao: pausas.join(' · ') || null, pausadas: pausadas });
    f.horarios.forEach(function (h) {
      var e = escolaNoDia(f, h, d);
      if (e) escolaDias.push(e);
    });
  }
  // feriados, avaliações e férias (contagem decrescente)
  var datasEscola = escola.contagens(chaveDia(hoje), f.filhos.map(function (c) { return { nome: c.nome, nivel: c.nivel || null, calendario: c.calendario || 'nacional' }; }));
  atividades.sort(function (a, b) { return a.dia !== b.dia ? (a.dia < b.dia ? -1 : 1) : (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0); });

  return {
    filhos: f.filhos, aniversarios: aniversarios, atividades: atividades, dias: dias, escola: escolaDias,
    contagens: contagemAnivs.concat(datasEscola),
    datasEscola: datasEscola,
    prazos: resumoPrazos(f, hoje),
    financas: resumoFinancas(f, hoje)
  };
}

// ---------- Prazos da casa (IUC, inspeção, seguros, documentos, dentista…) ----------

var ICONE_PRAZO = { carro: '🚗', casa: '🏠', saude: '🏥', documentos: '📄', escola: '🏫', dinheiro: '💶', outro: '📌' };

// Soma meses mantendo o dia (31 jan + 1 mês = 28/29 fev)
function somaMeses(k, n) {
  var d = deChaveDia(k);
  var alvo = new Date(d.getFullYear(), d.getMonth() + n, 1);
  var ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return chaveDia(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), ultimo)));
}

// Prazos que já estão dentro do período de aviso (ou atrasados), do mais urgente para o menos
function resumoPrazos(f, hoje) {
  var hojeK = chaveDia(hoje);
  return f.prazos.filter(function (p) { return p.data && !p.feito; }).map(function (p) {
    var faltam = Math.round((deChaveDia(p.data) - hoje) / 86400000);
    return {
      id: p.id, titulo: p.titulo, icone: ICONE_PRAZO[p.categoria] || '📌', data: p.data, faltam: faltam,
      quem: p.quem && p.quem !== 'Família' ? p.quem : '', cor: corDe(f, p.quem), notas: p.notas || '',
      repete: +p.repetirMeses > 0, atrasado: p.data < hojeK
    };
  }).filter(function (p) {
    var orig = f.prazos.filter(function (x) { return x.id === p.id; })[0];
    return p.faltam <= (orig.avisarDias != null && orig.avisarDias !== '' ? +orig.avisarDias : 30);
  }).sort(function (a, b) { return a.faltam - b.faltam; });
}

// "Feito": prazos que se repetem passam para a próxima data (sempre no futuro); os outros ficam arquivados
function prazoFeito(f, id) {
  var p = f.prazos.filter(function (x) { return x.id === id; })[0];
  if (!p) return null;
  var hojeK = chaveDia(new Date());
  p.ultimaVez = hojeK;
  var n = +p.repetirMeses || 0;
  if (n > 0) {
    var prox = somaMeses(p.data, n);
    while (prox <= hojeK) prox = somaMeses(prox, n);
    p.data = prox;
  } else {
    p.feito = hojeK;
  }
  return p;
}

// Área bancária: só é enviada ao iPad se estiver ativa em /gerir
function resumoFinancas(f, hoje) {
  if (!f.mostrarFinancas) return null;
  var contas = f.contas.map(function (c) {
    return { nome: c.nome, saldo: Number(c.saldo) || 0, atualizado: c.atualizado || '' };
  });
  var total = contas.reduce(function (s, c) { return s + c.saldo; }, 0);
  var pagamentos = f.pagamentos.map(function (p) {
    var dia = parseInt(p.dia, 10) || 1;
    // dia 31 em meses mais curtos passa para o último dia do mês
    function noMes(ano, mes) { return new Date(ano, mes, Math.min(dia, new Date(ano, mes + 1, 0).getDate())); }
    var prox = noMes(hoje.getFullYear(), hoje.getMonth());
    if (prox < hoje) prox = noMes(hoje.getFullYear(), hoje.getMonth() + 1);
    return { descricao: p.descricao, valor: Number(p.valor) || 0, dia: chaveDia(prox), faltam: Math.round((prox - hoje) / 86400000) };
  }).filter(function (p) { return p.faltam <= 31; })
    .sort(function (a, b) { return a.faltam - b.faltam; });
  var ate30 = pagamentos.reduce(function (s, p) { return s + p.valor; }, 0);
  return { contas: contas, total: total, pagamentos: pagamentos, totalPagamentos: ate30 };
}

// Feriados e dias de férias escolares como entradas de dia inteiro na agenda
function eventosEscola(f, de, ate) {
  var lista = [];
  var cals = calendariosEmUso(f);
  for (var d = de; d < ate; d = somaDias(d, 1)) {
    var k = chaveDia(d);
    var comum = escola.dia(k);
    if (comum.feriado) lista.push({ titulo: '🇵🇹 ' + comum.feriado, tipo: 'feriado', diaInteiro: true, dia: k, cor: '#d29922', local: 'Feriado' });
    var vistos = {};
    cals.forEach(function (cal) {
      var info = escola.dia(k, null, cal);
      if (info.interrupcao && !info.fimDeSemana && !vistos[info.interrupcao]) {
        vistos[info.interrupcao] = true;
        lista.push({ titulo: escola.icone(info.interrupcao) + ' ' + info.interrupcao, tipo: 'ferias', diaInteiro: true, dia: k, cor: '#a371f7', local: 'Sem aulas' });
      }
      if (info.especial && !vistos[info.especial]) {
        vistos[info.especial] = true;
        lista.push({ titulo: '🏫 ' + info.especial, tipo: 'escola', diaInteiro: true, dia: k, cor: '#58a6ff', local: '' });
      }
    });
  }
  return lista;
}

// Destinos do trânsito visíveis hoje: "semana" (dias úteis), "fimdesemana" (sábado, domingo e feriados) ou sempre
function destinosDeHoje(f) {
  var hoje = new Date(), dow = hoje.getDay();
  var folga = dow === 0 || dow === 6 || !!escola.feriado(chaveDia(hoje));
  return f.destinos.filter(function (d) {
    if (d.mostrar === 'semana') return !folga;
    if (d.mostrar === 'fimdesemana') return folga;
    return true;
  });
}

function ordenarAgenda(a, b) {
  if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
  if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1;
  return (a.inicio || 0) - (b.inicio || 0);
}

// ---------- Calendário ICS da família (para subscrever no iPhone) ----------

var BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function icsTexto(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsData(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function icsDataHora(d, hhmm) { return icsData(d) + 'T' + hhmm.replace(':', '') + '00'; }
function maisUmaHora(hhmm) { var p = hhmm.split(':'); return pad((+p[0] + 1) % 24) + ':' + p[1]; }

// Linhas ICS não devem passar 75 octetos; dobra com espaço no início
function dobrar(linha) {
  var out = [], buf = Buffer.from(linha, 'utf8');
  while (buf.length > 74) {
    var n = 74;
    while ((buf[n] & 0xc0) === 0x80) n--; // não partir caracteres UTF-8
    out.push(buf.slice(0, n).toString('utf8'));
    buf = Buffer.concat([Buffer.from(' '), buf.slice(n)]);
  }
  out.push(buf.toString('utf8'));
  return out.join('\r\n');
}

function calendarioICS(f, filtroQuem) {
  var tz = config.fusoHorario || 'Europe/Lisbon';
  var agora = new Date();
  var stamp = agora.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  var nome = filtroQuem ? 'Família · ' + filtroQuem : 'Família';
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//familydesk//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsTexto(nome), 'X-WR-TIMEZONE:' + tz, 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  var hoje = inicioDoDia(agora);
  function serve(quem) { return !filtroQuem || !quem || quem === filtroQuem || quem === 'Todos'; }
  function titulo(t, quem) { return quem && quem !== 'Todos' ? t + ' · ' + quem : t; }
  function evento(uid, linhas) {
    L.push('BEGIN:VEVENT', 'UID:' + uid + '@familydesk', 'DTSTAMP:' + stamp);
    linhas.forEach(function (l) { if (l) L.push(l); });
    L.push('END:VEVENT');
  }

  // Atividades semanais -> eventos recorrentes
  f.atividades.forEach(function (a) {
    var ds = DIAS_SEMANA.indexOf(normalizar(a.dia));
    if (ds < 0 || !serve(a.quem)) return;
    var primeiro = somaDias(hoje, (ds - hoje.getDay() + 7) % 7 - 7); // começa na semana passada
    var desc = [a.levar ? 'Levar: ' + a.levar : '', a.quem ? 'Quem: ' + a.quem : ''].filter(Boolean).join('\n');
    // dias sem atividade (feriados e férias) no próximo ano
    var excecoes = [];
    for (var d = primeiro; d < somaDias(hoje, 400); d = somaDias(d, 7)) {
      if (motivoPausa(f, a, chaveDia(d))) excecoes.push(a.inicio ? icsDataHora(d, a.inicio) : icsData(d));
    }
    evento('atv-' + a.id, a.inicio ? [
      'DTSTART;TZID=' + tz + ':' + icsDataHora(primeiro, a.inicio),
      'DTEND;TZID=' + tz + ':' + icsDataHora(primeiro, a.fim || maisUmaHora(a.inicio))
    ].concat([
      'RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY[ds],
      excecoes.length ? 'EXDATE;TZID=' + tz + ':' + excecoes.join(',') : '',
      'SUMMARY:' + icsTexto(titulo(a.atividade, a.quem)),
      a.local ? 'LOCATION:' + icsTexto(a.local) : '',
      desc ? 'DESCRIPTION:' + icsTexto(desc) : ''
    ]) : [
      'DTSTART;VALUE=DATE:' + icsData(primeiro),
      'DTEND;VALUE=DATE:' + icsData(somaDias(primeiro, 1)),
      'RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY[ds],
      excecoes.length ? 'EXDATE;VALUE=DATE:' + excecoes.join(',') : '',
      'SUMMARY:' + icsTexto(titulo(a.atividade, a.quem)),
      desc ? 'DESCRIPTION:' + icsTexto(desc) : ''
    ]);
  });

  // Consultas e eventos pontuais (com alerta 1 dia antes nas consultas)
  f.eventos.forEach(function (e) {
    if (!e.data || !serve(e.quem)) return;
    var p = e.data.split('-');
    var dia = new Date(+p[0], +p[1] - 1, +p[2]);
    var icone = { consulta: '🏥 ', escola: '🏫 ', evento: '🎈 ' }[e.tipo] || '';
    var linhas = e.inicio ? [
      'DTSTART;TZID=' + tz + ':' + icsDataHora(dia, e.inicio),
      'DTEND;TZID=' + tz + ':' + icsDataHora(dia, e.fim || maisUmaHora(e.inicio))
    ] : [
      'DTSTART;VALUE=DATE:' + icsData(dia),
      'DTEND;VALUE=DATE:' + icsData(somaDias(dia, 1))
    ];
    linhas.push('SUMMARY:' + icsTexto(icone + titulo(e.titulo, e.quem)));
    if (e.local) linhas.push('LOCATION:' + icsTexto(e.local));
    if (e.notas) linhas.push('DESCRIPTION:' + icsTexto(e.notas));
    if (e.tipo === 'consulta') linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexto(e.titulo), 'TRIGGER:-P1D', 'END:VALARM');
    evento('evt-' + e.id, linhas);
  });

  // Aniversários -> anuais
  f.aniversarios.forEach(function (a) {
    if (!serve(a.quem)) return;
    var p = String(a.data).split('-');
    var ano = a.ano || 2000;
    var dia = new Date(ano, +p[0] - 1, +p[1]);
    evento('ani-' + a.id, [
      'DTSTART;VALUE=DATE:' + icsData(dia),
      'DTEND;VALUE=DATE:' + icsData(somaDias(dia, 1)),
      'RRULE:FREQ=YEARLY',
      'SUMMARY:' + icsTexto(a.familia ? '🎂 ' + a.nome + ' faz anos'
        : '🎂 ' + a.nome + (a.quem && a.quem !== 'Todos' ? ' (colega ' + (/a$/.test(a.quem) ? 'da ' : 'do ') + a.quem + ')' : '')),
      a.familia ? 'BEGIN:VALARM' : '', a.familia ? 'ACTION:DISPLAY' : '', a.familia ? 'DESCRIPTION:' + icsTexto('Aniversário ' + a.nome) : '',
      a.familia ? 'TRIGGER:-P7D' : '', a.familia ? 'END:VALARM' : '',
      a.nota ? 'DESCRIPTION:' + icsTexto(a.nota) : '',
      'TRANSP:TRANSPARENT'
    ]);
  });

  // Prazos da casa (com repetição e alertas)
  f.prazos.forEach(function (p) {
    if (!p.data || p.feito || !serve(p.quem === 'Família' ? '' : p.quem)) return;
    var d = deChaveDia(p.data);
    var n = +p.repetirMeses || 0;
    var avisar = p.avisarDias != null && p.avisarDias !== '' ? +p.avisarDias : 30;
    var linhas = ['DTSTART;VALUE=DATE:' + icsData(d), 'DTEND;VALUE=DATE:' + icsData(somaDias(d, 1)),
      n > 0 ? 'RRULE:FREQ=MONTHLY;INTERVAL=' + n : '',
      'SUMMARY:' + icsTexto((ICONE_PRAZO[p.categoria] || '📌') + ' ' + p.titulo + (p.quem && p.quem !== 'Família' ? ' · ' + p.quem : '')),
      p.notas ? 'DESCRIPTION:' + icsTexto(p.notas) : '', 'TRANSP:TRANSPARENT'];
    if (avisar > 1) linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexto(p.titulo), 'TRIGGER:-P' + Math.min(avisar, 30) + 'D', 'END:VALARM');
    linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexto(p.titulo), 'TRIGGER:-P1D', 'END:VALARM');
    evento('prz-' + p.id, linhas);
  });

  // Feriados (este ano e o próximo) e férias escolares
  var ano = agora.getFullYear();
  escola.feriadosDoAno(ano).concat(escola.feriadosDoAno(ano + 1)).forEach(function (fe) {
    var d = deChaveDia(fe.data);
    evento('fer-' + icsData(d), ['DTSTART;VALUE=DATE:' + icsData(d), 'DTEND;VALUE=DATE:' + icsData(somaDias(d, 1)),
      'SUMMARY:' + icsTexto('🇵🇹 ' + fe.nome), 'TRANSP:TRANSPARENT']);
  });
  var vistosICS = {};
  calendariosEmUso(f).forEach(function (cal) {
    escola.anos(cal).forEach(function (a) {
      (a.interrupcoes || []).forEach(function (x) {
        var uid = 'int-' + x.inicio.replace(/-/g, '') + '-' + x.fim.replace(/-/g, '');
        if (vistosICS[uid]) return;
        vistosICS[uid] = true;
        evento(uid, ['DTSTART;VALUE=DATE:' + icsData(deChaveDia(x.inicio)),
          'DTEND;VALUE=DATE:' + icsData(somaDias(deChaveDia(x.fim), 1)),
          'SUMMARY:' + icsTexto(escola.icone(x.nome) + ' ' + x.nome + ' (sem aulas)'), 'TRANSP:TRANSPARENT']);
      });
      (a.diasEspeciais || []).forEach(function (x) {
        var uid = 'esp-' + x.data.replace(/-/g, '');
        if (vistosICS[uid]) return;
        vistosICS[uid] = true;
        evento(uid, ['DTSTART;VALUE=DATE:' + icsData(deChaveDia(x.data)),
          'DTEND;VALUE=DATE:' + icsData(somaDias(deChaveDia(x.data), 1)),
          'SUMMARY:' + icsTexto('🏫 ' + x.nome), 'TRANSP:TRANSPARENT']);
      });
    });
  });

  L.push('END:VCALENDAR');
  return L.map(dobrar).join('\r\n') + '\r\n';
}

// ---------- Logótipos dos destinos (guardados em data/logos, fora do git) ----------

var PASTA_LOGOS = path.join(ROOT, 'data', 'logos');

// Recebe { url } ou { dados: "data:image/...;base64,..." }, reduz para 96x96 PNG e associa ao destino
function guardarLogo(id, corpo) {
  var sharp = require('sharp');
  var obter;
  if (corpo.dados) {
    obter = Promise.resolve(Buffer.from(String(corpo.dados).replace(/^data:[^,]+,/, ''), 'base64'));
  } else if (/^https?:\/\//.test(corpo.url || '')) {
    obter = fetch(corpo.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(function (r) {
      if (!r.ok) throw new Error('não consegui descarregar a imagem (HTTP ' + r.status + ')');
      return r.arrayBuffer();
    }).then(function (b) { return Buffer.from(b); });
  } else {
    return Promise.reject(new Error('falta o link ou o ficheiro da imagem'));
  }
  return obter.then(function (buf) {
    return sharp(buf).resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }).then(function (png) {
    var f = lerFamilia();
    var d = f.destinos.filter(function (x) { return x.id === id; })[0];
    if (!d) throw new Error('destino não encontrado');
    fs.mkdirSync(PASTA_LOGOS, { recursive: true });
    fs.writeFileSync(path.join(PASTA_LOGOS, id + '.png'), png);
    d.logo = '/logos/' + id + '.png?v=' + Date.now(); // ?v= força o iPad a ir buscar a nova versão
    guardarFamilia(f);
    return d;
  });
}

function apagarLogo(id) {
  var f = lerFamilia();
  var d = f.destinos.filter(function (x) { return x.id === id; })[0];
  if (!d) throw new Error('destino não encontrado');
  try { fs.unlinkSync(path.join(PASTA_LOGOS, id + '.png')); } catch (e) {}
  delete d.logo;
  guardarFamilia(f);
  return d;
}

// ---------- HTTP ----------

function enderecosLocais() {
  var ips = [];
  var ifs = require('os').networkInterfaces();
  Object.keys(ifs).forEach(function (n) {
    ifs[n].forEach(function (i) { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); });
  });
  return ips.length ? ips : ['localhost'];
}

var TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

function enviarJSON(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req, cb) {
  var partes = [], tamanho = 0;
  req.on('data', function (c) { tamanho += c.length; if (tamanho < 12e6) partes.push(c); });
  req.on('end', function () { cb(Buffer.concat(partes).toString('utf8')); });
}

function pinValido(req) {
  return !config.pinGestao || req.headers['x-pin'] === String(config.pinGestao);
}

// Afinações do ecrã (tempos, horas, quantidades): valores por omissão, alteráveis em config.json → "ecra"
var ECRA_PADRAO = {
  atualizarMinutos: 2,          // de quanto em quanto tempo o ecrã pede dados novos
  recarregarHoras: 6,           // recarrega a página inteira (evita fugas de memória no iPad antigo)
  fecharPainelSegundos: 60,     // um painel ampliado fecha sozinho
  fecharFotoMinutos: 10,        // uma foto ampliada fecha sozinha
  fecharMenuSegundos: 20,       // o menu volta a esconder-se
  financasSegundos: 60,         // as finanças ficam visíveis
  acordadoNoiteMinutos: 2,      // à noite, tocar no ecrã mostra o dashboard
  mochilaAmanhaAPartirDas: 18,  // a partir desta hora, "Não esquecer" mostra o dia seguinte
  datasEscolaMax: 3             // datas da escola na linha do fundo
};
function configEcra() {
  var e = Object.assign({}, ECRA_PADRAO, config.ecra || {});
  e.diasAgenda = config.diasAgenda || 7;
  return e;
}

// Data da última alteração aos ficheiros da página do ecrã (entra na versão)
function versaoPagina() {
  var v = 0;
  ['index.html', 'app.js', 'comum.js', 'style.css'].forEach(function (n) {
    try { v = Math.max(v, fs.statSync(path.join(ROOT, 'public', n)).mtimeMs); } catch (e) {}
  });
  return String(Math.round(v));
}

function dashboard(res) {
  var resultado = {
    agora: Date.now(),
    versao: VERSAO + '.' + versaoPagina(), // muda quando o servidor reinicia ou os ficheiros da página mudam
    ecra: configEcra(),
    noite: { inicio: noite.inicio || '22:00', fim: noite.fim || '07:00', fotos: fotos.ativo(), intervalo: noite.intervaloSegundos || 60 },
    // intervaloSegundos tem prioridade; intervaloMinutos mantém-se por compatibilidade
    agendaFotos: { ativo: fotosAgenda.ativo(), intervaloSegundos: cfgAgendaFotos.intervaloSegundos || (cfgAgendaFotos.intervaloMinutos || 10) * 60 }
  };
  var f;
  try { f = lerFamilia(); } catch (e) {
    f = { filhos: [], atividades: [], eventos: [], aniversarios: [] };
    resultado.erroFamilia = 'data/familia.json inválido: ' + e.message;
  }
  resultado.familia = resumoFamilia(f);
  var de = inicioDoDia(new Date());
  var ate = somaDias(de, config.diasAgenda || 7);
  Promise.all([
    meteorologia().then(function (m) { resultado.meteo = m; }, function (e) { resultado.meteo = { erro: e.message }; }),
    agendaCalendarios().then(function (a) { return a; }, function () { return []; }),
    transito.calcular(f.casa, f.destinos).then(function (t) {
      // calcula todos os destinos (o painel ampliado mostra-os todos); o ecrã principal só mostra os de hoje
      var deHoje = destinosDeHoje(f).map(function (d) { return d.id; });
      resultado.transito = t && Object.assign({}, t, { rotas: t.rotas.map(function (r) { return Object.assign({}, r, { principal: deHoje.indexOf(r.id) >= 0 }); }) });
    }, function (e) { console.error('[trânsito]', e.message); resultado.transito = null; }),
    frase.doDia().then(function (fr) { resultado.frase = fr; }, function () { resultado.frase = null; })
  ]).then(function (r) {
    resultado.agenda = r[1].concat(eventosFamilia(f, de, ate), eventosEscola(f, de, ate)).sort(ordenarAgenda);
    enviarJSON(res, 200, resultado);
  });
}

http.createServer(function (req, res) {
  var url = req.url.split('?')[0];

  if (url === '/api/dashboard') return dashboard(res);

  // Calendário para subscrever no iPhone: /familia.ics (todos) ou /familia.ics?quem=Maria
  if (url === '/familia.ics') {
    try {
      var quem = new URL(req.url, 'http://x').searchParams.get('quem') || '';
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(calendarioICS(lerFamilia(), quem));
    } catch (e) {
      res.writeHead(500); return res.end(e.message);
    }
  }

  // Coordenadas a partir de um link do Google Maps (também links curtos maps.app.goo.gl)
  if (url === '/api/coordenadas') {
    var link = new URL(req.url, 'http://x').searchParams.get('url') || '';
    return transitoLib.resolverLink(link).then(function (c) { enviarJSON(res, c ? 200 : 404, c || { erro: 'Não encontrei coordenadas nesse link' }); });
  }
  if (url === '/api/transito') {
    var fam = lerFamilia();
    return transito.calcular(fam.casa, fam.destinos).then(function (t) { enviarJSON(res, 200, t || {}); },
      function (e) { enviarJSON(res, 500, { erro: e.message }); });
  }

  var mFeito = /^\/api\/prazos\/([A-Za-z0-9_-]+)\/feito$/.exec(url);
  if (mFeito && req.method === 'POST') {
    if (!pinValido(req)) return enviarJSON(res, 401, { erro: 'PIN errado' });
    try {
      var famP = lerFamilia();
      var p = prazoFeito(famP, mFeito[1]);
      if (!p) return enviarJSON(res, 404, { erro: 'prazo não encontrado' });
      guardarFamilia(famP);
      return enviarJSON(res, 200, { prazo: p });
    } catch (e) { return enviarJSON(res, 500, { erro: e.message }); }
  }

  var mLogo = /^\/api\/destinos\/([A-Za-z0-9_-]+)\/logo$/.exec(url);
  if (mLogo && (req.method === 'POST' || req.method === 'DELETE')) {
    if (!pinValido(req)) return enviarJSON(res, 401, { erro: 'PIN errado' });
    if (req.method === 'DELETE') {
      try { return enviarJSON(res, 200, { destino: apagarLogo(mLogo[1]) }); } catch (e) { return enviarJSON(res, 400, { erro: e.message }); }
    }
    return lerCorpo(req, function (txt) {
      var corpo;
      try { corpo = JSON.parse(txt); } catch (e) { return enviarJSON(res, 400, { erro: 'pedido inválido' }); }
      guardarLogo(mLogo[1], corpo).then(function (d) { enviarJSON(res, 200, { destino: d }); },
        function (e) { enviarJSON(res, 400, { erro: e.message }); });
    });
  }
  var mLogoImg = /^\/logos\/([A-Za-z0-9_-]+)\.png$/.exec(url);
  if (mLogoImg) {
    return fs.readFile(path.join(PASTA_LOGOS, mLogoImg[1] + '.png'), function (err, buf) {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=604800' });
      res.end(buf);
    });
  }

  if (url === '/api/escola') return enviarJSON(res, 200, escola.resumo(chaveDia(new Date())));

  if (url === '/api/fotos/aleatoria') {
    var origemFotos = new URL(req.url, 'http://x').searchParams.get('origem') === 'agenda' ? fotosAgenda : fotos;
    return origemFotos.aleatoria().then(function (f) { enviarJSON(res, 200, f || { erro: fotos.estado().erro }); },
      function (e) { enviarJSON(res, 500, { erro: e.message }); });
  }
  if (url === '/api/fotos/estado' && new URL(req.url, 'http://x').searchParams.get('origem') === 'agenda') {
    return fotosAgenda.atualizarLista().then(function () { enviarJSON(res, 200, fotosAgenda.estado()); });
  }
  if (url === '/api/fotos/estado') {
    return fotos.atualizarLista().then(function () { enviarJSON(res, 200, fotos.estado()); });
  }
  var mFoto = /^\/fotos\/([A-Za-z0-9_-]+)\.jpg$/.exec(url);
  if (mFoto) {
    // a foto pode ser da agenda ou do modo noite
    return fotosAgenda.imagem(mFoto[1]).catch(function () { return fotos.imagem(mFoto[1]); }).then(function (buf) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' });
      res.end(buf);
    }, function (e) { res.writeHead(404); res.end(e.message); });
  }

  if (url === '/api/familia' && req.method === 'GET') {
    try { return enviarJSON(res, 200, { familia: lerFamilia(), pin: !!config.pinGestao, endereco: enderecosLocais()[0] + ':' + (config.porta || 3000) }); }
    catch (e) { return enviarJSON(res, 500, { erro: e.message }); }
  }

  if (url === '/api/familia' && req.method === 'PUT') {
    if (!pinValido(req)) return enviarJSON(res, 401, { erro: 'PIN errado' });
    return lerCorpo(req, function (corpo) {
      try {
        var f = JSON.parse(corpo);
        if (!f || !Array.isArray(f.filhos)) throw new Error('formato inválido');
        ['atividades', 'eventos', 'aniversarios', 'contas', 'pagamentos', 'horarios', 'destinos', 'prazos'].forEach(function (k) { if (!Array.isArray(f[k])) f[k] = []; });
        guardarFamilia(f);
        enviarJSON(res, 200, { familia: f });
      } catch (e) {
        enviarJSON(res, 400, { erro: e.message });
      }
    });
  }

  if (url === '/') url = '/index.html';
  if (url === '/gerir') url = '/gerir.html';
  if (url === '/iphone') url = '/iphone.html';
  var ficheiro = path.join(ROOT, 'public', path.normalize(url).replace(/^(\.\.[\/\\])+/, ''));
  if (ficheiro.indexOf(path.join(ROOT, 'public')) !== 0) { res.writeHead(403); return res.end(); }
  fs.readFile(ficheiro, function (err, conteudo) {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ficheiro)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(conteudo);
  });
}).listen(config.porta || 3000, '0.0.0.0', function () {
  var ips = enderecosLocais();
  var porta = config.porta || 3000;
  console.log('FamilyDesk a correr:');
  ips.forEach(function (ip) { console.log('  iPad:    http://' + ip + ':' + porta); });
  console.log('  Gerir:   http://localhost:' + porta + '/gerir');
});
