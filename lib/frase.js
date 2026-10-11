// Frase inspiracional do dia.
// ZenQuotes (https://zenquotes.io, grátis, uma frase nova por dia, em inglês) traduzida para português
// com a MyMemory (grátis). Pede-se uma vez por dia e guarda-se em cache/frase.json.
// Se as APIs falharem, usa uma frase da lista local (em português).
// Com o idioma em inglês ("idioma": "en") usa a frase original, sem tradução, e a lista local em inglês.

var fs = require('fs');
var path = require('path');
var idioma = require('./idioma');

var LOCAIS = [
  ['A melhor maneira de prever o futuro é criá-lo.', 'Peter Drucker'],
  ['Tudo vale a pena se a alma não é pequena.', 'Fernando Pessoa'],
  ['O sucesso é a soma de pequenos esforços repetidos dia após dia.', 'Robert Collier'],
  ['Pedras no caminho? Guardo todas, um dia vou construir um castelo.', 'Fernando Pessoa'],
  ['Não é o mais forte que sobrevive, mas o que melhor se adapta.', 'Charles Darwin'],
  ['A persistência é o caminho do êxito.', 'Charles Chaplin'],
  ['Cada dia é uma nova oportunidade para mudar a tua vida.', ''],
  ['Faz hoje o que os outros não querem e amanhã terás o que os outros não têm.', ''],
  ['A felicidade não é algo pronto. Vem das tuas próprias ações.', 'Dalai Lama'],
  ['Quem não sabe o que procura não entende o que encontra.', 'Claude Bernard'],
  ['Começa onde estás. Usa o que tens. Faz o que podes.', 'Arthur Ashe'],
  ['Sê a mudança que queres ver no mundo.', 'Mahatma Gandhi'],
  ['O otimismo é a fé que leva à realização.', 'Helen Keller'],
  ['A vida é 10% o que nos acontece e 90% como reagimos.', 'Charles Swindoll'],
  ['Grandes coisas nunca vêm de zonas de conforto.', ''],
  ['A gratidão transforma o que temos em suficiente.', ''],
  ['Acredita que podes e já estás a meio caminho.', 'Theodore Roosevelt'],
  ['O segredo para avançar é começar.', 'Mark Twain'],
  ['Pequenos passos todos os dias levam a grandes resultados.', ''],
  ['A família é onde a vida começa e o amor nunca acaba.', '']
];

// A mesma lista em inglês (usada quando o idioma é "en")
var LOCAIS_EN = [
  ['The best way to predict the future is to create it.', 'Peter Drucker'],
  ['Everything is worthwhile if the soul is not small.', 'Fernando Pessoa'],
  ['Success is the sum of small efforts, repeated day in and day out.', 'Robert Collier'],
  ['Stones in the way? I keep them all; one day I will build a castle.', 'Fernando Pessoa'],
  ['It is not the strongest that survives, but the one most adaptable to change.', 'Charles Darwin'],
  ['Persistence is the path to success.', 'Charlie Chaplin'],
  ['Every day is a new chance to change your life.', ''],
  ['Do today what others won’t, and tomorrow you will have what others don’t.', ''],
  ['Happiness is not something ready made. It comes from your own actions.', 'Dalai Lama'],
  ['He who does not know what he is looking for will not understand what he finds.', 'Claude Bernard'],
  ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
  ['Be the change you wish to see in the world.', 'Mahatma Gandhi'],
  ['Optimism is the faith that leads to achievement.', 'Helen Keller'],
  ['Life is 10% what happens to us and 90% how we react to it.', 'Charles Swindoll'],
  ['Great things never come from comfort zones.', ''],
  ['Gratitude turns what we have into enough.', ''],
  ['Believe you can and you’re halfway there.', 'Theodore Roosevelt'],
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Small steps every day lead to big results.', ''],
  ['Family is where life begins and love never ends.', '']
];

function criar(opcoes) {
  var ficheiro = path.join(opcoes.raiz, 'cache', 'frase.json');
  var atual = null;
  var aPedir = null;

  try { atual = JSON.parse(fs.readFileSync(ficheiro, 'utf8')); } catch (e) {}

  function hojeK() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }

  function local(dia) {
    var lista = idioma.idioma() === 'en' ? LOCAIS_EN : LOCAIS;
    var n = Math.floor(new Date(dia).getTime() / 86400000) % lista.length;
    return { dia: dia, idioma: idioma.idioma(), texto: lista[n][0], autor: lista[n][1], fonte: 'local' };
  }

  function traduzir(texto) {
    var url = 'https://api.mymemory.translated.net/get?langpair=en|pt-PT&q=' + encodeURIComponent(texto);
    return fetch(url, { signal: AbortSignal.timeout(10000) }).then(function (r) { return r.json(); }).then(function (j) {
      var t = j && j.responseData && j.responseData.translatedText;
      // a MyMemory devolve avisos em maiúsculas quando a quota acaba
      if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error(idioma.L('tradução indisponível', 'translation unavailable'));
      return t;
    });
  }

  function pedir(dia) {
    return fetch('https://zenquotes.io/api/today', { signal: AbortSignal.timeout(10000) }).then(function (r) {
      if (!r.ok) throw new Error('ZenQuotes HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var q = j[0];
      if (!q || !q.q || /too many requests/i.test(q.q)) throw new Error(idioma.L('ZenQuotes sem frase', 'ZenQuotes returned no quote'));
      var lingua = idioma.idioma();
      // em inglês a frase já vem na língua certa: não é preciso traduzir
      if (lingua === 'en') return { dia: dia, idioma: lingua, texto: q.q, autor: q.a, fonte: 'zenquotes' };
      return traduzir(q.q).then(function (pt) {
        return { dia: dia, idioma: lingua, texto: pt, original: q.q, autor: q.a, fonte: 'zenquotes' };
      }, function () {
        return { dia: dia, idioma: lingua, texto: q.q, autor: q.a, fonte: 'zenquotes' };
      });
    });
  }

  function doDia() {
    var dia = hojeK();
    // a cache é por dia e por idioma (mudar o idioma volta a pedir a frase)
    if (atual && atual.dia === dia && (atual.idioma || 'pt') === idioma.idioma()) return Promise.resolve(atual);
    if (aPedir) return aPedir;
    aPedir = pedir(dia).catch(function (e) {
      console.error(idioma.L('[frase]', '[quote]'), e.message);
      return local(dia);
    }).then(function (f) {
      atual = f;
      aPedir = null;
      try { fs.mkdirSync(path.dirname(ficheiro), { recursive: true }); fs.writeFileSync(ficheiro, JSON.stringify(f)); } catch (e) {}
      return f;
    });
    return aPedir;
  }

  return { doDia: doDia };
}

module.exports = { criar: criar };
