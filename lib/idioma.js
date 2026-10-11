// Language of the app: config.json → "idioma": "en" (default) or "pt".
// L('texto em português', 'English text') returns the text in the chosen language.

var atual = 'en';

function definir(idioma) { atual = idioma === 'pt' ? 'pt' : 'en'; }
function L(pt, en) { return atual === 'en' && en != null ? en : pt; }
function idioma() { return atual; }

module.exports = { definir: definir, L: L, idioma: idioma };
