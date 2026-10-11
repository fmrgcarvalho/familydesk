// Feriados de Portugal e calendários escolares (interrupções letivas, início e fim do ano por nível).
// Responde à pergunta "há aulas neste dia para este filho?", usada para pausar atividades.
//
// data/calendario-escolar.json tem vários calendários:
//   - entradas em "anos" sem "calendario" são o calendário nacional (despacho);
//   - entradas com "calendario": "<id>" são de um agrupamento (ex.: escolas com semestres);
//   - "creche" é um calendário especial: só feriados (as creches não param nas férias escolares).
// Cada filho escolhe o seu calendário em /gerir.

var fs = require('fs');
var path = require('path');
var idioma = require('./idioma');
var L = idioma.L;

var NIVEIS = {
  creche: 'Creche',
  pre: 'Pré-escolar',
  '1ciclo': '1.º ciclo (1.º–4.º)',
  '2ciclo': '2.º ciclo (5.º–6.º)',
  '3ciclo': '7.º–8.º ano',
  '9ano': '9.º ano',
  '10ano': '10.º ano',
  secundario: '11.º–12.º ano'
};
var NIVEIS_EN = {
  creche: 'Daycare',
  pre: 'Preschool',
  '1ciclo': '1st cycle (grades 1–4)',
  '2ciclo': '2nd cycle (grades 5–6)',
  '3ciclo': 'Grades 7–8',
  '9ano': 'Grade 9',
  '10ano': 'Grade 10',
  secundario: 'Grades 11–12'
};
function niveis() { return idioma.idioma() === 'en' ? NIVEIS_EN : NIVEIS; }

// Nomes que vêm de data/calendario-escolar*.json (em português) → inglês, quando o idioma é "en".
// Nomes desconhecidos ficam como estão.
var NOMES_EN = {
  'férias de natal': 'Christmas break',
  'férias do natal': 'Christmas break',
  'férias de carnaval': 'Carnival break',
  'férias do carnaval': 'Carnival break',
  'carnaval': 'Carnival break',
  'férias da páscoa': 'Easter break',
  'férias de páscoa': 'Easter break',
  'férias de verão': 'Summer holidays',
  'avaliação intercalar': 'Mid-term assessment break',
  'pausa entre semestres': 'Semester break',
  'pausa intercalar': 'Mid-term break',
  'dia do agrupamento': 'School Group Day',
  'dia da escola': 'School Day'
};
function traduzir(nome) {
  if (!nome || idioma.idioma() !== 'en') return nome;
  return NOMES_EN[String(nome).trim().toLowerCase()] || nome;
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function chave(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function deChave(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function somaDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function diasEntre(a, b) { return Math.round((deChave(b) - deChave(a)) / 86400000); }

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function pascoa(ano) {
  var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function criar(opcoes) {
  var ficheiro = path.join(opcoes.raiz, 'data', 'calendario-escolar.json');
  var municipal = opcoes.feriadoMunicipal; // { nome, data: "MM-DD" | "pascoa+39" }
  var cacheFeriados = {};

  // calendario-escolar.json (nacional, no git) + calendario-escolar.local.json (agrupamentos, fora do git)
  function ler(f) {
    if (!fs.existsSync(f)) return {};
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { console.error(L('[calendário escolar] ', '[school calendar] ') + path.basename(f) + ':', e.message); return {}; }
  }
  function dados() {
    var base = ler(ficheiro), local = ler(ficheiro.replace(/\.json$/, '.local.json'));
    return {
      calendarios: Object.assign({}, base.calendarios, local.calendarios),
      anos: (base.anos || []).concat(local.anos || [])
    };
  }

  // Lista de calendários disponíveis para escolher em /gerir
  function calendarios() {
    var lista = [{ id: 'nacional', nome: L('Nacional (despacho)', 'National (official calendar)') }];
    var extra = dados().calendarios || {};
    Object.keys(extra).forEach(function (id) { lista.push({ id: id, nome: extra[id].nome || id, fonte: extra[id].fonte || '' }); });
    lista.push({ id: 'creche', nome: L('Creche (só feriados)', 'Daycare (public holidays only)') });
    return lista;
  }

  // Anos letivos de um calendário; para anos sem versão própria usa o nacional
  function anos(cal) {
    cal = cal || 'nacional';
    if (cal === 'creche') return [];
    var todos = dados().anos || [];
    var proprios = todos.filter(function (a) { return (a.calendario || 'nacional') === cal; });
    var nacionais = todos.filter(function (a) {
      return !a.calendario && !proprios.some(function (p) { return p.anoLetivo === a.anoLetivo; });
    });
    return proprios.concat(nacionais).sort(function (a, b) { return a.anoLetivo < b.anoLetivo ? -1 : 1; });
  }

  function feriadosDoAno(ano) {
    var ck = idioma.idioma() + ano; // a cache é por idioma (os nomes mudam)
    if (cacheFeriados[ck]) return cacheFeriados[ck];
    var p = pascoa(ano);
    var lista = [
      ['01-01', L('Ano Novo', 'New Year’s Day')], ['04-25', L('Dia da Liberdade', 'Freedom Day')], ['05-01', L('Dia do Trabalhador', 'Labour Day')],
      ['06-10', L('Dia de Portugal', 'Portugal Day')], ['08-15', L('Assunção de Nossa Senhora', 'Assumption Day')], ['10-05', L('Implantação da República', 'Republic Day')],
      ['11-01', L('Dia de Todos os Santos', 'All Saints’ Day')], ['12-01', L('Restauração da Independência', 'Restoration of Independence')],
      ['12-08', L('Imaculada Conceição', 'Immaculate Conception')], ['12-25', L('Natal', 'Christmas Day')]
    ].map(function (f) { return { data: ano + '-' + f[0], nome: f[1] }; });
    lista.push({ data: chave(somaDias(p, -2)), nome: L('Sexta-feira Santa', 'Good Friday') });
    lista.push({ data: chave(p), nome: L('Páscoa', 'Easter Sunday') });
    lista.push({ data: chave(somaDias(p, 60)), nome: L('Corpo de Deus', 'Corpus Christi') });
    // feriado municipal: data fixa "MM-DD" ou móvel "pascoa+39" (ex.: Quinta-feira da Ascensão)
    if (municipal && municipal.data) {
      var movel = /^pascoa([+-]\d+)$/i.exec(municipal.data);
      var dataMun = movel ? chave(somaDias(p, parseInt(movel[1], 10))) : ano + '-' + municipal.data;
      lista.push({ data: dataMun, nome: municipal.nome || L('Feriado municipal', 'Municipal holiday'), municipal: true });
    }
    lista.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    return (cacheFeriados[ck] = lista);
  }

  function feriado(k) {
    var l = feriadosDoAno(+k.slice(0, 4));
    for (var i = 0; i < l.length; i++) if (l[i].data === k) return l[i];
    return null;
  }

  function interrupcao(k, cal) {
    var a = anos(cal);
    for (var i = 0; i < a.length; i++) {
      var ints = a[i].interrupcoes || [];
      for (var j = 0; j < ints.length; j++) if (k >= ints[j].inicio && k <= ints[j].fim) return ints[j];
    }
    return null;
  }

  // Dias assinalados que não são pausa (ex.: Dia do Agrupamento)
  function especial(k, cal) {
    var a = anos(cal);
    for (var i = 0; i < a.length; i++) {
      var esp = a[i].diasEspeciais || [];
      for (var j = 0; j < esp.length; j++) if (esp[j].data === k) return esp[j];
    }
    return null;
  }

  // Férias de verão: entre o fim de um ano letivo e o início do seguinte (ou 10 de setembro se ainda não se conhece)
  function verao(k, nivel, cal) {
    if (!nivel) return null;
    var a = anos(cal);
    for (var i = 0; i < a.length; i++) {
      var fim = (a[i].fim || {})[nivel];
      if (!fim || k <= fim) continue;
      var seguinte = a[i + 1] && (a[i + 1].inicio || {})[nivel];
      var ate = seguinte || fim.slice(0, 4) + '-09-10';
      if (k < ate) return { nome: L('Férias de verão', 'Summer holidays'), inicio: chave(somaDias(deChave(fim), 1)), fim: chave(somaDias(deChave(ate), -1)) };
    }
    // antes do início do primeiro ano conhecido (julho até ao início das aulas)
    if (a.length) {
      var ini = (a[0].inicio || {})[nivel];
      if (ini && k < ini && k >= ini.slice(0, 4) + '-07-01') return { nome: L('Férias de verão', 'Summer holidays'), inicio: ini.slice(0, 4) + '-07-01', fim: chave(somaDias(deChave(ini), -1)) };
    }
    return null;
  }

  // Informação de um dia para um nível e calendário (sem nível: só o que é comum a todos)
  function dia(k, nivel, cal) {
    var f = feriado(k);
    var intr = interrupcao(k, cal) || verao(k, nivel, cal);
    var esp = especial(k, cal);
    var dow = deChave(k).getDay();
    return {
      dia: k,
      feriado: f ? f.nome : null,
      interrupcao: intr ? traduzir(intr.nome) : null,
      especial: esp ? traduzir(esp.nome) : null,
      fimDeSemana: dow === 0 || dow === 6,
      semAulas: !!(f || intr || dow === 0 || dow === 6)
    };
  }

  function icone(nome) {
    if (/natal|christmas/i.test(nome)) return '🎄';
    if (/carnaval|carnival/i.test(nome)) return '🎭';
    if (/p[aá]scoa|easter/i.test(nome)) return '🐣';
    if (/ver[aã]o|summer/i.test(nome)) return '☀️';
    if (/avalia|semest|assessment|mid-term/i.test(nome)) return '📝';
    return '🏖';
  }

  // Contagens decrescentes para o dashboard.
  // alvos: [{ nome, nivel, calendario }] — um por filho
  function contagens(hojeK, alvos) {
    var out = [];
    var limite = chave(somaDias(deChave(hojeK), 120));
    alvos = (alvos || []).filter(function (a) { return a.calendario !== 'creche' && a.nivel !== 'creche'; });

    // próximo feriado (até 21 dias)
    var ano = +hojeK.slice(0, 4);
    var fs_ = feriadosDoAno(ano).concat(feriadosDoAno(ano + 1));
    for (var i = 0; i < fs_.length; i++) {
      if (fs_[i].data < hojeK) continue;
      var n = diasEntre(hojeK, fs_[i].data);
      if (n <= 21) out.push({ icone: '🇵🇹', texto: n === 0 ? L('Hoje é feriado: ', 'Public holiday today: ') + fs_[i].nome : n === 1 ? L('Amanhã é feriado: ', 'Public holiday tomorrow: ') + fs_[i].nome : fs_[i].nome + L(' em ', ' in ') + n + L(' dias', ' days') });
      break;
    }

    // férias: por calendário (os filhos no mesmo calendário partilham a contagem)
    var grupos = {};
    alvos.forEach(function (a) { var c = a.calendario || 'nacional'; (grupos[c] = grupos[c] || []).push(a); });
    var ids = Object.keys(grupos);
    var vistos = {};
    ids.forEach(function (cal) {
      var g = grupos[cal];
      var quem = ids.length > 1 ? ' (' + g.map(function (a) { return a.nome; }).join(', ') + ')' : '';
      var agora = interrupcao(hojeK, cal) || verao(hojeK, g[0].nivel, cal);
      var item;
      if (agora) {
        var regresso = somaDias(deChave(agora.fim), 1);
        while (regresso.getDay() === 0 || regresso.getDay() === 6 || feriado(chave(regresso))) regresso = somaDias(regresso, 1);
        var r = diasEntre(hojeK, chave(regresso));
        item = { icone: icone(agora.nome), texto: traduzir(agora.nome) + quem + L(' · regresso às aulas ', ' · back to school ') + (r === 1 ? L('amanhã', 'tomorrow') : L('em ', 'in ') + r + L(' dias', ' days')) };
      } else {
        var proximas = [];
        anos(cal).forEach(function (a) { (a.interrupcoes || []).forEach(function (x) { if (x.inicio > hojeK && x.inicio <= limite) proximas.push(x); }); });
        proximas.sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
        // a próxima pausa e, se for curta (avaliação, Carnaval), também as próximas férias "a sério"
        for (var p = 0; p < proximas.length && p < 2; p++) {
          var x = proximas[p];
          var d = diasEntre(hojeK, x.inicio);
          var sem = diasEntre(x.inicio, x.fim) + 1;
          var t = traduzir(x.nome) + quem + (d === 1 ? L(' começa amanhã', ' starts tomorrow') : L(' em ', ' in ') + d + L(' dias', ' days'));
          if (!vistos[t]) { vistos[t] = true; out.push({ icone: icone(x.nome), texto: t }); }
          if (sem >= 5) break;
        }
      }
      if (item && !vistos[item.texto]) { vistos[item.texto] = true; out.push(item); }
    });

    // último dia de aulas (nos últimos 45 dias), agrupado por data
    var porFim = {};
    alvos.forEach(function (a) {
      if (!a.nivel) return;
      anos(a.calendario).forEach(function (ano) {
        var fim = (ano.fim || {})[a.nivel];
        if (!fim || fim < hojeK || diasEntre(hojeK, fim) > 45) return;
        if ((porFim[fim] = porFim[fim] || []).indexOf(a.nome) < 0) porFim[fim].push(a.nome);
      });
    });
    var fins = Object.keys(porFim).sort();
    fins.forEach(function (fim) {
      var dd = diasEntre(hojeK, fim);
      var quem = fins.length > 1 ? ' (' + porFim[fim].join(', ') + ')' : '';
      out.push({ icone: '☀️', texto: L('Último dia de aulas', 'Last day of school') + quem + (dd === 0 ? L(' é hoje', ' is today') : L(' em ', ' in ') + dd + L(' dias', ' days')) });
    });
    return out;
  }

  // Resumo para a página de gestão
  function resumo(hojeK) {
    var ano = +hojeK.slice(0, 4);
    var cals = calendarios();
    return {
      niveis: niveis(),
      calendarios: cals,
      anos: (dados().anos || []).map(function (a) {
        var c = a.calendario || 'nacional';
        var info = cals.filter(function (x) { return x.id === c; })[0];
        // cópia com os nomes traduzidos (os dados guardados não mudam)
        var t = function (x) { return Object.assign({}, x, { nome: traduzir(x.nome) }); };
        return Object.assign({ calendarioNome: info ? info.nome : c }, a, {
          interrupcoes: (a.interrupcoes || []).map(t),
          diasEspeciais: a.diasEspeciais ? a.diasEspeciais.map(t) : a.diasEspeciais
        });
      }),
      feriados: feriadosDoAno(ano).concat(feriadosDoAno(ano + 1)).filter(function (f) { return f.data >= hojeK; }).slice(0, 14)
    };
  }

  return {
    dia: dia, feriado: feriado, feriadosDoAno: feriadosDoAno, anos: anos, calendarios: calendarios,
    contagens: contagens, resumo: resumo, icone: icone, traduzir: traduzir, NIVEIS: NIVEIS, niveis: niveis
  };
}

module.exports = { criar: criar, pascoa: pascoa, NIVEIS: NIVEIS, niveis: niveis, traduzir: traduzir };
