/* Dashboard da entrada. ES5 propositadamente: o iPad 2 fica no iOS 9 (Safari 9),
   sem fetch, sem Intl, sem arrow functions nem template strings. */
(function () {
  'use strict';

  var C = window.Comum;
  var DIAS = C.DIAS, DIAS_CURTOS = C.DIAS_CURTOS, MESES = C.MESES, MESES_CURTOS = C.MESES_CURTOS;
  var tempo = C.tempo, ICONE_TIPO = C.ICONE_TIPO, NIVEL_AVISO = C.NIVEL_AVISO;
  var direcaoVento = C.direcaoVento, nivelUV = C.nivelUV, nivelAr = C.nivelAr, nivelPolen = C.nivelPolen;
  var pad = C.pad, esc = C.esc, chaveDia = C.chaveDia, deChave = C.deChave, hhmm = C.hhmm, chip = C.chip;
  var nomeDia = C.nomeDia, euros = C.euros, getJSON = C.getJSON;
  var L = C.L, EN = C.EN, dataCurta = C.dataCurta;

  // "Domingo, 12 de outubro" / "Sunday, October 12"
  function dataLonga(a) {
    return EN ? DIAS[a.getDay()] + ', ' + MESES[a.getMonth()] + ' ' + a.getDate() : DIAS[a.getDay()] + ', ' + a.getDate() + ' de ' + MESES[a.getMonth()];
  }

  // textos fixos do index.html (elementos com data-en)
  function traduzirPagina() {
    document.documentElement.lang = EN ? 'en' : 'pt-PT';
    if (!EN) return;
    var els = document.querySelectorAll('[data-en]');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = els[i].getAttribute('data-en');
  }
  traduzirPagina();

  // Afinações do ecrã: vêm do servidor (config.json → "ecra"); estes são os valores até à primeira resposta
  var cfgEcra = {
    atualizarMinutos: 2, recarregarHoras: 6, fecharPainelSegundos: 60, fecharFotoMinutos: 10, fecharMenuSegundos: 20,
    financasSegundos: 60, acordadoNoiteMinutos: 2, mochilaAmanhaAPartirDas: 18, datasEscolaMax: 3, diasAgenda: 30
  };

  function $(id) { return document.getElementById(id); }
  function classe(el, nome, ligar) {
    var partes = el.className ? el.className.split(' ') : [], out = [];
    for (var i = 0; i < partes.length; i++) if (partes[i] && partes[i] !== nome) out.push(partes[i]);
    if (ligar) out.push(nome);
    el.className = out.join(' ');
  }

  // ---------- Relógio ----------

  var dados = null;
  var versao = null;
  var ultimoDia = null;
  function tic() {
    var a = new Date();
    $('hh').innerHTML = hhmm(a);
    $('ss').innerHTML = pad(a.getSeconds());
    var k = chaveDia(a);
    if (k !== ultimoDia) {
      ultimoDia = k;
      $('data').innerHTML = EN ? '<b>' + DIAS[a.getDay()] + '</b>, ' + MESES[a.getMonth()] + ' ' + a.getDate()
        : '<b>' + DIAS[a.getDay()] + '</b>, ' + a.getDate() + ' de ' + MESES[a.getMonth()];
      if (dados) desenhar(dados); // muda "Hoje"/"Amanhã" à meia-noite
    }
    noite = eNoite(a) || location.hash === '#noite';
    if (verFinancasAte && Date.now() > verFinancasAte) verFinancasAte = 0;
    if (acordadoAte && Date.now() > acordadoAte) acordadoAte = 0;
    if (cfgAgendaFotos.ativo && !noite && Date.now() >= agFoto.proxima) trocarFotoAgenda();
    if (noite) {
      $('fotos-hora').innerHTML = hhmm(a);
      $('fotos-data').innerHTML = dataLonga(a);
      if (cfgNoite.fotos && !acordadoAte && Date.now() >= proximaFotoEm) trocarFoto();
    } else if (temFoto) {
      limparFotos();
    }
    aplicarClasses();
  }

  var noite = false;
  var verFinancasAte = 0; // a área bancária só aparece durante 60s depois de tocar no botão
  function aplicarClasses() {
    var emFotos = noite && cfgNoite.fotos && temFoto && !acordadoAte;
    var c = (emFotos ? 'fotos ' : noite ? 'noite ' : '') + (verFinancasAte ? 'ver-financas ' : '') + (menuAberto ? 'menu-aberto ' : '') + (expandido ? 'tem-expandido' : '');
    if (document.body.className !== c) document.body.className = c;
  }

  // ---------- Modo noite: fotos da família em vez do dashboard ----------

  var cfgNoite = { inicio: '22:00', fim: '07:00', fotos: false, intervalo: 60 };
  var acordadoAte = 0;               // tocar no ecrã à noite mostra o dashboard durante 2 minutos
  var camada = 0, temFoto = false, aCarregar = false, proximaFotoEm = 0;

  function minutos(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function eNoite(a) {
    var m = a.getHours() * 60 + a.getMinutes(), i = minutos(cfgNoite.inicio), f = minutos(cfgNoite.fim);
    return i > f ? (m >= i || m < f) : (m >= i && m < f);
  }

  function trocarFoto() {
    if (aCarregar) return;
    aCarregar = true;
    getJSON('/api/fotos/aleatoria', function (err, f) {
      if (err || !f || !f.url) { aCarregar = false; proximaFotoEm = Date.now() + 60000; return; }
      var img = new Image();
      img.onload = function () {
        var nova = $('foto' + (1 - camada)), velha = $('foto' + camada);
        nova.style.backgroundImage = 'url(' + f.url + ')';
        nova.className = 'foto visivel';
        velha.className = 'foto';
        // liberta a memória da foto anterior depois do fade (o iPad 2 tem pouca RAM)
        setTimeout(function () { if (velha.className === 'foto') velha.style.backgroundImage = 'none'; }, 2500);
        camada = 1 - camada;
        temFoto = true;
        aCarregar = false;
        proximaFotoEm = Date.now() + cfgNoite.intervalo * 1000;
        aplicarClasses();
      };
      img.onerror = function () { aCarregar = false; proximaFotoEm = Date.now() + 30000; };
      img.src = f.url;
    });
  }

  function limparFotos() {
    $('foto0').style.backgroundImage = 'none';
    $('foto1').style.backgroundImage = 'none';
    $('foto0').className = $('foto1').className = 'foto';
    temFoto = false;
    proximaFotoEm = 0;
  }

  $('fotos').addEventListener('click', function () {
    fecharExpandido();
    acordadoAte = Date.now() + cfgEcra.acordadoNoiteMinutos * 60000;
    aplicarClasses();
  });

  // ---------- Fotos na zona da agenda (trocam a cada N segundos) ----------

  var cfgAgendaFotos = { ativo: false, intervaloSegundos: 600 };
  var agFoto = { camada: 0, proxima: 0, aCarregar: false };

  function trocarFotoAgenda() {
    if (agFoto.aCarregar) return;
    agFoto.aCarregar = true;
    getJSON('/api/fotos/aleatoria?origem=agenda', function (err, f) {
      if (err || !f || !f.url) { agFoto.aCarregar = false; agFoto.proxima = Date.now() + 60000; return; }
      var img = new Image();
      img.onload = function () {
        var nova = $('afoto' + (1 - agFoto.camada)), velha = $('afoto' + agFoto.camada);
        nova.style.backgroundImage = 'url(' + f.url + ')';
        // fotos ao alto aparecem inteiras (com fundo escuro dos lados); as deitadas enchem a moldura
        nova.className = 'afoto visivel' + (img.height > img.width ? ' alto' : '');
        velha.className = velha.className.replace(' visivel', ''); // mantém o enquadramento durante o fade
        // liberta a memória da foto anterior depois do fade (o iPad 2 tem pouca RAM)
        setTimeout(function () { if (velha.className.indexOf('visivel') < 0) velha.style.backgroundImage = 'none'; }, 2000);
        agFoto.camada = 1 - agFoto.camada;
        agFoto.aCarregar = false;
        agFoto.proxima = Date.now() + cfgAgendaFotos.intervaloSegundos * 1000;
      };
      img.onerror = function () { agFoto.aCarregar = false; agFoto.proxima = Date.now() + 60000; };
      img.src = f.url;
    });
  }

  // ---------- Meteorologia ----------

  function desenharMeteo(m) {
    if (!m || m.erro) {
      $('agora-desc').innerHTML = L('Sem meteorologia', 'No weather data');
      return;
    }
    var a = m.atual;
    var hoje = m.dias[0] || {};
    var t = tempo(a.codigo);
    $('agora-icone').innerHTML = a.dia ? t[0] : t[1];
    $('agora-temp').innerHTML = a.temp + '°';
    // texto em 3 linhas curtas, para o tempo ocupar pouca largura e sobrar espaço para a frase
    $('agora-desc').innerHTML = esc(t[2]) + ' <small>' + hoje.max + '° / ' + hoje.min + '°</small>' +
      '<div class="ag-sol">🌅 ' + hoje.nascer + '  🌇 ' + hoje.por + '</div>' +
      '<div class="ag-local">' + esc(m.local) + '</div>';

    // os detalhes (sensação, vento, UV, sol, ar) estão só na vista ampliada da meteorologia

    // Próximas horas
    var html = '', i;
    for (i = 0; i < m.horas.length; i += 2) {
      var h = m.horas[i], seg = m.horas[i + 1];
      var chuva2 = Math.max(h.chuva || 0, seg ? seg.chuva || 0 : 0);
      html += '<div class="hr' + (i >= 16 ? ' mais' : '') + '"><div class="h">' + (i === 0 ? L('Agora', 'Now') : pad(h.hora) + 'h') + '</div>' +
        '<div class="i">' + tempo(h.codigo)[h.dia ? 0 : 1] + '</div>' +
        '<div class="t">' + h.temp + '°</div>' +
        '<div class="c">' + (chuva2 >= 10 ? chuva2 + '%' : '') + '</div></div>';
    }
    $('horas').innerHTML = html;

    // 5 dias
    var hojeK = chaveDia(new Date());
    html = '';
    for (i = 0; i < m.dias.length && i < 6; i++) {
      var d = m.dias[i];
      var dt = deChave(d.dia);
      var nome = d.dia === hojeK ? L('Hoje', 'Today') : DIAS_CURTOS[dt.getDay()] + ' ' + dt.getDate();
      html += '<div class="dia-prev' + (d.dia === hojeK ? ' hoje' : '') + '">' +
        '<div class="nome">' + nome + '</div>' +
        '<span class="icone">' + tempo(d.codigo)[0] + '</span>' +
        '<div class="meio">' + d.max + '°<span class="min">' + d.min + '°</span></div>' +
        '<div class="chuva">' + (d.chuva > 0 ? '💧' + d.chuva + '%' + (d.mm >= 0.5 ? ' ' + d.mm + 'mm' : '') : '') + '</div>' +
        '<div class="extra">💨 ' + d.vento + ' km/h · UV ' + d.uv + '</div>' +
        '<div class="det-exp">💨 ' + L('rajadas ', 'gusts ') + d.rajada + ' km/h<br>🌅 ' + d.nascer + ' · 🌇 ' + d.por + '</div>' +
        '</div>';
    }
    $('previsao').innerHTML = html;
    desenharTempoDetalhe(m);
  }

  // Vista ampliada da meteorologia: agora, resumo da semana e os próximos 7 dias (um por linha)
  function desenharTempoDetalhe(m) {
    var a = m.atual, hoje = m.dias[0] || {}, t = tempo(a.codigo), i;
    var hojeK = chaveDia(new Date());
    var html = '<div class="td-agora"><span class="td-ic">' + (a.dia ? t[0] : t[1]) + '</span><span class="td-temp">' + a.temp + '°</span>' +
      '<span class="td-info"><b>' + esc(t[2]) + '</b> · ' + L('sensação ', 'feels like ') + a.sensacao + '° · ' + L('humidade ', 'humidity ') + a.humidade + '%<br>' +
      '💨 ' + a.vento + ' km/h ' + direcaoVento(a.direcao) + ' (' + L('rajadas ', 'gusts ') + a.rajada + ') · ☀️ UV ' + Math.round(a.uv) + ' ' + nivelUV(a.uv) + ' (' + L('máx ', 'max ') + hoje.uv + ')' +
      ' · 🌅 ' + hoje.nascer + ' 🌇 ' + hoje.por +
      (m.ar && m.ar.aqi != null ? ' · 🍃 ' + L('ar ', 'air ') + nivelAr(m.ar.aqi) + (m.ar.polen ? ' · ' + L('pólen ', 'pollen ') + nivelPolen(m.ar.polen.valor) : '') : '') + '</span></div>';

    // resumo da semana
    var lo = 99, hi = -99, quente = null, chuvosos = [], mm = 0, sol = 0;
    for (i = 0; i < m.dias.length; i++) {
      var d = m.dias[i];
      if (d.min < lo) lo = d.min;
      if (d.max > hi) { hi = d.max; quente = d; }
      if (d.chuva >= 40) chuvosos.push(d);
      mm += d.mm || 0;
      sol += d.sol || 0;
    }
    function nomeCurto(d) { var dt = deChave(d.dia); return d.dia === hojeK ? L('hoje', 'today') : DIAS_CURTOS[dt.getDay()].toLowerCase() + ' ' + dt.getDate(); }
    var chuvaTxt = chuvosos.length ? '☔ ' + L('chuva provável: ', 'rain likely: ') + chuvosos.map(nomeCurto).join(', ') + (mm >= 1 ? ' (' + Math.round(mm) + ' mm)' : '') : '☀️ ' + L('sem chuva prevista', 'no rain expected');
    html += '<div class="td-titulo">' + L('Próximos 7 dias', 'Next 7 days') + '</div><div class="td-resumo">🌡 ' + lo + L('° a ', '° to ') + hi + '° · ' + L('mais quente: ', 'warmest: ') + nomeCurto(quente) + ' (' + quente.max + '°) · ' +
      chuvaTxt + ' · ' + Math.round(sol) + L(' h de sol', ' h of sun') + '</div>';

    // um dia por linha, com barra mínima–máxima à escala da semana
    var amp = Math.max(1, hi - lo);
    for (i = 0; i < m.dias.length; i++) {
      var dd = m.dias[i], dt2 = deChave(dd.dia);
      var esq = Math.round((dd.min - lo) / amp * 100), dir = Math.round((hi - dd.max) / amp * 100);
      html += '<div class="dl' + (dd.dia === hojeK ? ' hoje' : '') + '">' +
        '<span class="dl-dia">' + (dd.dia === hojeK ? L('Hoje', 'Today') : DIAS[dt2.getDay()]) + '<small>' + dataCurta(dt2) + '</small></span>' +
        '<span class="dl-ic">' + tempo(dd.codigo)[0] + '</span>' +
        '<span class="dl-desc">' + esc(tempo(dd.codigo)[2]) + '<small>☀️ ' + dd.sol + L(' h de sol', ' h of sun') + '</small></span>' +
        '<span class="dl-chuva' + (dd.chuva >= 40 ? ' forte' : '') + '">💧 ' + dd.chuva + '%<small>' + (dd.mm >= 0.1 ? dd.mm + ' mm · ' + dd.horasChuva + ' h' : '—') + '</small></span>' +
        '<span class="dl-temp"><span class="dl-min">' + dd.min + '°</span><span class="dl-barra"><span class="dl-ench" style="left:' + esq + '%;right:' + dir + '%"></span></span><span class="dl-max">' + dd.max + '°</span></span>' +
        '<span class="dl-vento">💨 ' + dd.vento + ' ' + direcaoVento(dd.direcao) + '<small>' + L('rajadas ', 'gusts ') + dd.rajada + '</small></span>' +
        '<span class="dl-uv">UV ' + dd.uv + '<small>' + nivelUV(dd.uv) + '</small></span>' +
        '<span class="dl-sol">🌅 ' + dd.nascer + '<small>🌇 ' + dd.por + '</small></span>' +
        '</div>';
    }
    $('tempo-det').innerHTML = html;
  }

  // Avisos do IPMA + dicas práticas para quem sai de casa + contagens (feriados, férias)
  // Faixa de avisos: só aparece quando há avisos do IPMA ou dicas do dia
  // (as contagens e os prazos estão na agenda)
  function desenharAlertas(m) {
    var html = '';
    if (m && !m.erro) {
      var avisos = m.avisos || [];
      for (var i = 0; i < avisos.length; i++) {
        var w = avisos[i];
        var fim = new Date(w.fim);
        html += '<span class="alerta ' + esc(w.nivel) + '">⚠️ ' + (EN ? (NIVEL_AVISO[w.nivel] || '') + ' warning' : 'Aviso ' + (NIVEL_AVISO[w.nivel] || '')) + ': ' + esc(w.tipo) +
          L(' até ', ' until ') + DIAS_CURTOS[fim.getDay()] + ' ' + hhmm(fim) + '</span>';
      }
      var dicas = C.dicasTempo(m);
      for (i = 0; i < dicas.length; i++) html += '<span class="alerta">' + dicas[i] + '</span>';
    }
    var faixa = $('alertas');
    faixa.innerHTML = html;
    // só uma linha: tira do fim as etiquetas que passaram para a linha de baixo
    var etiquetas = faixa.getElementsByTagName('span');
    while (etiquetas.length > 1 && etiquetas[etiquetas.length - 1].offsetTop > etiquetas[0].offsetTop) {
      faixa.removeChild(etiquetas[etiquetas.length - 1]);
    }
  }

  // ---------- Agenda, atividades, aniversários ----------

  // Agenda única: compromissos, aniversários e prazos dos próximos dias (config "diasAgenda"), por dia (prazos atrasados no topo)
  function desenharAgenda(eventos, aniversarios, prazos) {
    var hoje = new Date();
    var hojeK = chaveDia(hoje);
    var amanhaK = chaveDia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
    var agora = hoje.getTime();
    var html = '', diaAtual = null, n = 0, i;

    var especiais = [];
    for (i = 0; i < aniversarios.length; i++) if (aniversarios[i].faltam <= cfgEcra.diasAgenda) especiais.push({ dia: aniversarios[i].dia, aniv: aniversarios[i] });
    for (i = 0; i < prazos.length; i++) {
      if (prazos[i].atrasado) {
        if (!n++) html += '<div class="ag-dia atrasado">' + L('Atrasados', 'Overdue') + '</div>';
        html += linhaPrazo(prazos[i]);
      } else if (prazos[i].faltam <= cfgEcra.diasAgenda) especiais.push({ dia: prazos[i].data, prazo: prazos[i] });
    }
    // no mesmo dia, aniversários e prazos vêm antes dos compromissos
    var lista = especiais.concat(eventos).map(function (e, k) { return { e: e, k: k }; });
    lista.sort(function (x, y) {
      if (x.e.dia !== y.e.dia) return x.e.dia < y.e.dia ? -1 : 1;
      return x.k - y.k;
    });

    for (i = 0; i < lista.length; i++) {
      var e = lista[i].e;
      if (!e.aniv && !e.prazo && !e.diaInteiro && e.fim < agora) continue; // já terminou
      if (e.dia !== diaAtual) {
        diaAtual = e.dia;
        html += '<div class="ag-dia' + (e.dia === hojeK ? ' hoje' : '') + '">' + nomeDia(e.dia, hojeK, amanhaK) + '</div>';
      }
      n++;
      if (e.prazo) { html += linhaPrazo(e.prazo); continue; }
      if (e.aniv) {
        var a = e.aniv;
        html += '<div class="ev aniv' + (a.faltam === 0 ? ' hoje' : '') + '"><span class="barra"></span><span class="h">🎂</span>' +
          '<span class="t">' + (a.faltam === 0 ? '🎉 ' : '') + esc(a.nome) + (a.idade ? ' (' + a.idade + ')' : '') + chip(a.quem, a.cor) + '</span></div>';
        continue;
      }
      var icone = e.tipo ? (ICONE_TIPO[e.tipo] || '') + ' ' : '';
      html += '<div class="ev"><span class="barra" style="background:' + esc(e.cor || '#58a6ff') + '"></span>' +
        '<span class="h">' + (e.diaInteiro ? L('dia', 'all day') : hhmm(new Date(e.inicio))) + '</span>' +
        '<span class="t">' + icone + esc(e.titulo) + (e.quem ? chip(e.quem, e.cor) : '') + '</span>' +
        (e.local ? '<span class="l">' + esc(e.local) + '</span>' : '') +
        '</div>';
    }
    $('agenda').innerHTML = n ? html : '<div class="vazio">' + L('Sem compromissos nos próximos dias', 'No appointments in the coming days') + '</div>';
  }

  function desenharAtividades(lista, dias, escolaDias) {
    // Hoje e amanhã: o dia de escola de cada filho (entrada/saída, AEC, o que levar).
    // Depois, as atividades dos próximos 7 dias, uma linha por atividade com os dias em que acontece
    // (o servidor já tirou as que fazem pausa em feriados e férias; aqui só se indica o motivo).
    var html = '', i, off, grupos = [], porChave = {}, pausas = [];
    for (off = 0; off < dias.length; off++) {
      var info = dias[off];
      var d = deChave(info.dia);
      var curto = off === 0 ? L('hoje', 'today') : off === 1 ? L('amanhã', 'tomorrow') : DIAS_CURTOS[d.getDay()].toLowerCase();
      if (off <= 1) {
        var escolaDoDia = '';
        for (i = 0; i < escolaDias.length; i++) {
          var e = escolaDias[i];
          if (e.dia !== info.dia) continue;
          var extra = [];
          if (e.aec) extra.push(L('AEC ', 'After-school ') + e.aec + L(' até ', ' until ') + e.saida);
          if (e.levar) extra.push('🎒 ' + e.levar);
          escolaDoDia += '<div class="at escola"><span class="h">' + esc(e.entrada) + '</span>🏫 ' + L('Escola até ', 'School until ') + esc(e.aec ? e.saidaSemAec || e.saida : e.saida) + chip(e.quem, e.cor) +
            (extra.length ? '<span class="lv">' + esc(extra.join(' · ')) + '</span>' : '') + '</div>';
        }
        if (escolaDoDia) html += '<div class="at-dia' + (off === 0 ? ' hoje' : '') + '">' + (off === 0 ? L('Hoje', 'Today') : L('Amanhã', 'Tomorrow')) + '</div>' + escolaDoDia;
      }
      if (info.pausadas) pausas.push(curto.charAt(0).toUpperCase() + curto.slice(1) + ': ' + (info.feriado ? '🇵🇹 ' + info.feriado : info.interrupcao || L('pausa', 'break')) + ' · ' + info.pausadas + L(' em pausa', ' paused'));
      for (i = 0; i < lista.length; i++) {
        var a = lista[i];
        if (a.dia !== info.dia) continue;
        var k = [a.atividade, a.quem, a.inicio, a.levar].join('|');
        if (!porChave[k]) grupos.push(porChave[k] = { a: a, dias: [] });
        porChave[k].dias.push(curto);
      }
    }
    grupos.sort(function (x, y) {
      var a = x.a.inicio || '99', b = y.a.inicio || '99';
      return a < b ? -1 : a > b ? 1 : 0;
    });
    if (grupos.length || pausas.length) html += '<div class="at-dia">' + L('Esta semana', 'This week') + '</div>';
    for (i = 0; i < grupos.length; i++) {
      var g = grupos[i], ds = g.dias;
      var quando = ds.length > 1 ? ds.slice(0, -1).join(', ') + L(' e ', ' and ') + ds[ds.length - 1] : ds[0];
      html += '<div class="at"><span class="h">' + esc(g.a.inicio) + '</span>' + esc(g.a.atividade) + chip(g.a.quem, g.a.cor) +
        '<span class="qd">' + esc(quando) + '</span>' +
        (g.a.levar ? '<span class="lv">🎒 ' + esc(g.a.levar) + '</span>' : '') + '</div>';
    }
    for (i = 0; i < pausas.length; i++) html += '<div class="at-pausa">' + esc(pausas[i]) + '</div>';
    if (!html) html = '<div class="vazio">' + L('Sem atividades esta semana', 'No activities this week') + '</div>';
    $('atividades').innerHTML = html;
  }

  // "Não esquecer": tudo o que vai na mochila, por filho (de hoje; ao fim do dia, de amanhã)
  function desenharMochila(atividades, escolaDias) {
    var agora = new Date();
    var amanha = agora.getHours() >= cfgEcra.mochilaAmanhaAPartirDas;
    var alvo = chaveDia(amanha ? new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1) : agora);
    var porQuem = {}, ordem = [], i, j;
    function junta(x) {
      if (x.dia !== alvo || !x.levar) return;
      if (!porQuem[x.quem]) { porQuem[x.quem] = { cor: x.cor, itens: [] }; ordem.push(x.quem); }
      var partes = x.levar.split(/\s*,\s*|\s+(?:e|and)\s+/);
      for (j = 0; j < partes.length; j++) {
        var it = partes[j].trim();
        if (it && porQuem[x.quem].itens.indexOf(it) < 0) porQuem[x.quem].itens.push(it);
      }
    }
    for (i = 0; i < escolaDias.length; i++) junta(escolaDias[i]);
    for (i = 0; i < atividades.length; i++) junta(atividades[i]);
    var html = '';
    for (i = 0; i < ordem.length; i++) {
      var q = porQuem[ordem[i]];
      html += '<div class="mo">' + chip(ordem[i], q.cor) + '<span class="it">' + esc(q.itens.join(', ')) + '</span></div>';
    }
    $('mochila').innerHTML = html;
    $('mochila-quando').innerHTML = '· ' + (amanha ? L('amanhã', 'tomorrow') : L('hoje', 'today'));
    classe($('painel-mochila'), 'ativo', !!html);
  }

  // Próximas datas da escola (feriados, avaliações, férias) numa linha discreta
  function desenharDatasEscola(datas) {
    var html = '';
    for (var i = 0; i < datas.length && i < cfgEcra.datasEscolaMax; i++) html += (i ? ' · ' : '') + datas[i].icone + ' ' + esc(datas[i].texto);
    $('datas-escola').innerHTML = html;
  }

  // Trânsito: uma linha por destino (minutos com a cor do trânsito, atraso e hora de chegada).
  // O ecrã principal mostra os destinos de hoje; a vista ampliada mostra todos.
  function desenharTransito(t) {
    var p = $('painel-transito');
    var aberto = p.className.indexOf('expandido') >= 0; // não fechar o painel ampliado ao atualizar
    if (!t || !t.rotas || !t.rotas.length) { p.className = 'painel'; return; }
    p.className = 'painel ativo' + (aberto ? ' expandido' : '');
    var html = '';
    for (var i = 0; i < t.rotas.length; i++) {
      var r = t.rotas[i];
      html += '<div class="tr ' + (r.erro ? 'sem-dados' : esc(r.estado)) + (r.principal === false ? ' tr-extra' : '') + '">' +
        '<span class="tr-nome">' + (r.logo ? '<img class="tr-logo" src="' + esc(r.logo) + '">' : esc(r.icone)) + ' ' + esc(r.nome) + '</span>' +
        (r.erro
          ? '<span class="tr-min"><b>—</b></span><span class="tr-sub">' + L('sem rota', 'no route') + '</span>'
          : '<span class="tr-min"><b>' + r.minutos + '</b> min' + (r.atraso >= 3 ? ' <span class="atr">+' + r.atraso + '</span>' : '') + '</span>' +
            '<span class="tr-sub">' + L('chega ', 'arrives ') + r.chegada + '<span class="det-exp"> · ' + (EN ? String(r.km) : String(r.km).replace('.', ',')) + ' km' +
            (t.comTransito ? ' · ' + L('normal ', 'usually ') + r.normal + ' min' : '') + '</span></span>') +
        '</div>';
    }
    $('transito').innerHTML = html;
    $('transito-info').innerHTML = (t.comTransito ? '' : '<span class="sem-tr">' + L('sem tempo real', 'no live traffic') + '</span>') + hhmm(new Date(t.atualizado));
  }

  // Frase inspiracional do dia (ZenQuotes, traduzida); muda todos os dias
  function desenharFrase(f) {
    if (!f || !f.texto) { $('frase').innerHTML = ''; return; }
    $('frase').innerHTML = '<div class="t">“' + esc(f.texto) + '”</div>' +
      (f.autor || f.fonte === 'zenquotes' ? '<div class="a">' + (f.autor ? '— ' + esc(f.autor) : '') + (f.fonte === 'zenquotes' ? ' · zenquotes.io' : '') + '</div>' : '');
  }

  // Aniversários e prazos da casa no mesmo painel, ordenados por quantos dias faltam
  function linhaPrazo(p) {
    var q = p.atrasado ? L('atrasado ', 'overdue ') + (-p.faltam) + ' d' : p.faltam === 0 ? L('hoje', 'today') : p.faltam === 1 ? L('amanhã', 'tomorrow') : L('faltam ' + p.faltam + ' dias', 'in ' + p.faltam + ' days');
    return '<div class="ev prazo' + (p.atrasado ? ' atrasado' : p.faltam <= 7 ? ' breve' : '') + '"><span class="barra"></span>' +
      '<span class="h">' + p.icone + '</span><span class="t">' + esc(p.titulo) + (p.quem ? chip(p.quem, p.cor) : '') + '</span>' +
      '<span class="l">' + q + '</span></div>';
  }

  // ---------- Finanças ----------

  function desenharFinancas(fin) {
    classe($('btn-fin'), 'oculto', !fin);
    if (!fin) { verFinancasAte = 0; aplicarClasses(); marcarMenu(); return; }
    var html = '<div class="fin-total">' + L('Saldo total', 'Total balance') + '<b' + (fin.total < 0 ? ' class="neg"' : '') + '>' + euros(fin.total) + '</b></div>';
    if (!fin.contas.length && !fin.pagamentos.length) html += '<div class="vazio">' + L('Ainda sem contas nem pagamentos. Acrescenta-os em ✏️ Gerir → 💶 Contas e 💸 Pagamentos.', 'No accounts or payments yet. Add them in ✏️ Manage → 💶 Accounts and 💸 Payments.') + '</div>';
    if (fin.contas.length) html += '<div class="fin-sub">' + L('Contas', 'Accounts') + '</div>';
    for (var i = 0; i < fin.contas.length; i++) {
      var c = fin.contas[i];
      var at = c.atualizado ? deChave(c.atualizado) : null;
      html += '<div class="fin-conta"><span>' + esc(c.nome) + (at ? '<small>' + dataCurta(at) + '</small>' : '') + '</span>' +
        '<span' + (c.saldo < 0 ? ' class="neg"' : '') + '>' + euros(c.saldo) + '</span></div>';
    }
    if (fin.pagamentos.length) {
      html += '<div class="fin-sub">' + L('Próximos pagamentos · ', 'Upcoming payments · ') + euros(fin.totalPagamentos) + '</div>';
      for (i = 0; i < fin.pagamentos.length; i++) {
        var p = fin.pagamentos[i];
        var dt = deChave(p.dia);
        var q = p.faltam === 0 ? L('hoje', 'today') : p.faltam === 1 ? L('amanhã', 'tomorrow') : dataCurta(dt);
        html += '<div class="fin-pag' + (p.faltam <= 3 ? ' breve' : '') + '"><span class="q">' + q + '</span><span class="d">' + esc(p.descricao) + '</span><span>' + euros(p.valor) + '</span></div>';
      }
    }
    $('financas').innerHTML = html;
  }

  function alternarFinancas() {
    verFinancasAte = verFinancasAte ? 0 : Date.now() + cfgEcra.financasSegundos * 1000;
    aplicarClasses();
    marcarMenu();
  }
  $('btn-fin').addEventListener('click', alternarFinancas);
  $('fin-fechar').addEventListener('click', function (ev) {
    ev.stopPropagation();
    fecharExpandido();
    alternarFinancas();
  });

  // ---------- Expandir painéis: tocar abre em ecrã inteiro, tocar outra vez volta ao normal ----------

  var expandido = null, expandidoTimer = null;

  function fecharExpandido() {
    if (!expandido) return;
    expandido.className = expandido.className.replace(/\s*expandido/g, '');
    expandido = null;
    clearTimeout(expandidoTimer);
    aplicarClasses();
    marcarMenu();
  }

  function adiarFecho() {
    clearTimeout(expandidoTimer);
    expandidoTimer = setTimeout(fecharExpandido, expandido && expandido.id === 'agenda-foto' ? cfgEcra.fecharFotoMinutos * 60000 : cfgEcra.fecharPainelSegundos * 1000);
  }

  function alternarExpandido(el) {
    if (expandido === el) { fecharExpandido(); return; }
    fecharExpandido();
    expandido = el;
    el.className += ' expandido';
    el.scrollTop = 0;
    adiarFecho();
    aplicarClasses();
    marcarMenu();
  }

  // ---------- Barra de menu ----------

  var botoesMenu = $('menu').getElementsByTagName('span');
  function marcarMenu() {
    for (var i = 0; i < botoesMenu.length; i++) {
      var b = botoesMenu[i], alvo = b.getAttribute('data-alvo');
      if (alvo) classe(b, 'ativo', !!expandido && expandido.id === alvo);
    }
    classe($('btn-fin'), 'ativo', !!verFinancasAte);
  }
  for (var im = 0; im < botoesMenu.length; im++) {
    (function (b) {
      var alvo = b.getAttribute('data-alvo');
      if (!alvo) return;
      b.addEventListener('click', function () {
        if (alvo === 'agenda-foto' && $('agenda-foto').className.indexOf('ativo') < 0) return; // sem fotos configuradas
        alternarExpandido($(alvo));
      });
    })(botoesMenu[im]);
  }
  $('mb-atualizar').addEventListener('click', function () { location.reload(); });

  // O menu fica escondido para dar espaço; o botão ☰ mostra-o e ele volta a esconder-se 20 s depois do último toque
  var menuAberto = false, fechoMenu = null;
  function abrirMenu(abrir) {
    menuAberto = abrir;
    clearTimeout(fechoMenu);
    if (abrir) fechoMenu = setTimeout(function () { abrirMenu(false); }, cfgEcra.fecharMenuSegundos * 1000);
    aplicarClasses();
  }
  // a página de gestão precisa de um browser moderno (o Safari do iPad 2 não a abre)
  if (!(window.fetch && window.Promise)) classe($('mb-gerir'), 'oculto', true);
  $('btn-menu').addEventListener('click', function () { abrirMenu(!menuAberto); });
  $('menu').addEventListener('click', function () { if (menuAberto) abrirMenu(true); });
  // tocar na foto amplia-a (sem ampliar a agenda por baixo)
  $('agenda-foto').addEventListener('click', function (ev) {
    ev.stopPropagation();
    alternarExpandido($('agenda-foto'));
  });

  var EXPANDIVEIS = ['col-agenda', 'painel-transito', 'painel-atividades', 'painel-financas', 'faixa-tempo'];
  for (var ix = 0; ix < EXPANDIVEIS.length; ix++) {
    (function (el) {
      el.addEventListener('click', function () { alternarExpandido(el); });
      el.addEventListener('scroll', function () { if (expandido === el) adiarFecho(); });
    })($(EXPANDIVEIS[ix]));
  }
  // a lista da agenda tem scroll próprio; enquanto se faz scroll, a vista ampliada não fecha
  $('agenda').addEventListener('scroll', function () { if (expandido) adiarFecho(); });

  function desenhar(d) {
    desenharMeteo(d.meteo);
    desenharAgenda(d.agenda || [], d.familia.aniversarios || [], d.familia.prazos || []);
    desenharAlertas(d.meteo);
    desenharAtividades(d.familia.atividades || [], d.familia.dias || [], d.familia.escola || []);
    desenharMochila(d.familia.atividades || [], d.familia.escola || []);
    desenharDatasEscola(d.familia.datasEscola || []);
    desenharTransito(d.transito);
    desenharFrase(d.frase);
    desenharFinancas(d.familia.financas);
    if (d.familia.financas && location.hash === '#financas' && !verFinancasAte) alternarFinancas();
    // pré-visualização: /#expandir=painel-atividades abre esse painel ampliado
    var mExp = /#expandir=([a-z-]+)/.exec(location.hash);
    if (mExp && !expandido && $(mExp[1])) alternarExpandido($(mExp[1]));
    if (d.erroFamilia) $('atividades').innerHTML = '<div class="vazio">' + esc(d.erroFamilia) + '</div>';
  }

  var recarregarMarcado = false;
  function atualizar() {
    getJSON('/api/dashboard', function (err, d) {
      var est = $('estado');
      if (err) {
        est.className = 'erro';
        est.innerHTML = L('sem ligação ao servidor · a tentar de novo', 'no connection to the server · retrying');
        setTimeout(atualizar, 60000);
        return;
      }
      // o servidor foi atualizado/reiniciado: recarregar para usar o código novo
      if (versao && d.versao && d.versao !== versao) { location.reload(); return; }
      versao = d.versao;
      dados = d;
      if (d.ecra) cfgEcra = d.ecra;
      // recarrega a página inteira de tempos a tempos (marcado na primeira resposta, já com a configuração)
      if (!recarregarMarcado) { recarregarMarcado = true; setTimeout(function () { location.reload(); }, cfgEcra.recarregarHoras * 3600000); }
      if (d.noite) cfgNoite = d.noite;
      if (d.agendaFotos) {
        cfgAgendaFotos = d.agendaFotos;
        classe($('agenda-foto'), 'ativo', d.agendaFotos.ativo);
      }
      desenhar(d);
      est.className = '';
      est.innerHTML = L('atualizado ', 'updated ') + hhmm(new Date());
      setTimeout(atualizar, cfgEcra.atualizarMinutos * 60000);
    });
  }

  tic();
  setInterval(tic, 1000);
  atualizar();
})();
