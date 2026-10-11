// Fotos para o modo noite do iPad.
// Duas origens possíveis (config.fotos):
//   - "pasta": uma pasta local (ex.: a pasta sincronizada pelo Google Drive para computador)
//   - "googleDrive": { pastaId, contaServico } — lê diretamente do Drive com uma conta de serviço,
//     sem a pasta ter de ser pública (basta partilhá-la com o e-mail da conta de serviço)
// As fotos são reduzidas para caber no ecrã do iPad 2 (1024x768) e guardadas em cache no disco.

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var EXT = /\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;
var LADO = 1024;

function criar(opcoes) {
  var cfg = opcoes.config || {};
  var raiz = opcoes.raiz;
  var pastaCache = path.join(raiz, 'cache', 'fotos');
  var sharp = null;
  try { sharp = require('sharp'); } catch (e) { console.error('[fotos] falta o módulo sharp (npm install)'); }

  var lista = [];      // [{ id, origem: 'local'|'drive', caminho|driveId, mime, miniatura }]
  var porId = {};
  var listadoEm = 0;
  var saco = [];       // ordem aleatória sem repetições até esgotar
  var erro = null;

  function ativo() { return cfg.ativo !== false && !!(cfg.pasta || (cfg.googleDrive && cfg.googleDrive.pastaId)); }

  // ---------- Pasta local ----------

  function listarLocal(dir, out, profundidade) {
    var entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { erro = 'Não consigo abrir a pasta: ' + dir; return; }
    entradas.forEach(function (e) {
      var p = path.join(dir, e.name);
      if (e.isDirectory() && profundidade < 3 && e.name[0] !== '.') listarLocal(p, out, profundidade + 1);
      else if (e.isFile() && EXT.test(e.name)) out.push({ id: crypto.createHash('sha1').update(p).digest('hex').slice(0, 16), origem: 'local', caminho: p });
    });
  }

  // ---------- Google Drive (conta de serviço, sem dependências) ----------

  var token = null, tokenAte = 0;

  function b64url(s) { return Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

  function obterToken() {
    return Promise.resolve().then(obterTokenSinc);
  }
  function obterTokenSinc() {
    if (token && Date.now() < tokenAte - 60000) return token;
    var ficheiro = path.resolve(raiz, cfg.googleDrive.contaServico || 'google-service-account.json');
    var conta = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
    var agora = Math.floor(Date.now() / 1000);
    var corpo = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
      iss: conta.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600
    }));
    var assinatura = crypto.createSign('RSA-SHA256').update(corpo).sign(conta.private_key, 'base64')
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + corpo + '.' + assinatura
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.access_token) throw new Error('Google: ' + (j.error_description || j.error || 'sem token'));
      token = j.access_token;
      tokenAte = Date.now() + j.expires_in * 1000;
      return token;
    });
  }

  function listarDrive(pastaId, out, profundidade) {
    var q = "'" + pastaId + "' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder')";
    function pagina(pageToken) {
      return obterToken().then(function (t) {
        var url = 'https://www.googleapis.com/drive/v3/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' +
          '&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,thumbnailLink)') +
          '&q=' + encodeURIComponent(q) + (pageToken ? '&pageToken=' + pageToken : '');
        return fetch(url, { headers: { Authorization: 'Bearer ' + t } });
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error('Drive: ' + j.error.message);
        var sub = [];
        j.files.forEach(function (f) {
          if (f.mimeType === 'application/vnd.google-apps.folder') { if (profundidade < 2) sub.push(f.id); }
          else out.push({ id: f.id, origem: 'drive', driveId: f.id, mime: f.mimeType, miniatura: f.thumbnailLink });
        });
        var seguinte = j.nextPageToken ? pagina(j.nextPageToken) : Promise.resolve();
        return seguinte.then(function () {
          return Promise.all(sub.map(function (id) { return listarDrive(id, out, profundidade + 1); }));
        });
      });
    }
    return pagina(null);
  }

  // ---------- Lista (renovada a cada 30 min) ----------

  var aListar = null;
  function atualizarLista() {
    if (!ativo()) { erro = null; return Promise.resolve([]); }
    if (aListar) return aListar;
    if (Date.now() - listadoEm < 30 * 60 * 1000 && lista.length) return Promise.resolve(lista);
    var nova = [];
    erro = null;
    var p = cfg.pasta ? Promise.resolve(listarLocal(cfg.pasta, nova, 0)) : Promise.resolve().then(function () { return listarDrive(cfg.googleDrive.pastaId, nova, 0); });
    aListar = p.then(function () {
      lista = nova;
      porId = {};
      lista.forEach(function (f) { porId[f.id] = f; });
      listadoEm = Date.now();
      saco = [];
      if (!lista.length && !erro) erro = 'A pasta não tem fotos (JPG, PNG, WEBP, HEIC)';
      console.log('[fotos] ' + lista.length + ' fotos');
      return lista;
    }).catch(function (e) {
      erro = e.message;
      console.error('[fotos]', e.message);
      return lista;
    }).then(function (l) { aListar = null; return l; });
    return aListar;
  }

  function aleatoria() {
    return atualizarLista().then(function (l) {
      if (!l.length) return null;
      if (!saco.length) {
        saco = l.map(function (f) { return f.id; });
        for (var i = saco.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = saco[i]; saco[i] = saco[j]; saco[j] = t; }
      }
      var id = saco.pop();
      return porId[id] ? { id: id, url: '/fotos/' + id + '.jpg' } : null;
    });
  }

  // ---------- Imagem reduzida ----------

  function original(f) {
    if (f.origem === 'local') {
      var buf = fs.readFileSync(f.caminho);
      // HEIC (fotos do iPhone): o sharp não lê, converte-se primeiro para JPEG
      if (/\.hei[cf]$/i.test(f.caminho)) {
        return require('heic-convert')({ buffer: buf, format: 'JPEG', quality: 0.9 }).then(function (b) { return Buffer.from(b); });
      }
      return Promise.resolve(buf);
    }
    return obterToken().then(function (t) {
      // HEIC (fotos do iPhone): o sharp não lê, por isso usamos a miniatura que o Drive gera
      var url = (/heic|heif/i.test(f.mime) && f.miniatura)
        ? f.miniatura.replace(/=s\d+$/, '') + '=s' + LADO
        : 'https://www.googleapis.com/drive/v3/files/' + f.driveId + '?alt=media&supportsAllDrives=true';
      return fetch(url, { headers: { Authorization: 'Bearer ' + t } });
    }).then(function (r) {
      if (!r.ok) throw new Error('Drive HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (b) { return Buffer.from(b); });
  }

  function imagem(id) {
    var f = porId[id];
    if (!f) return Promise.reject(new Error('foto desconhecida'));
    var emCache = path.join(pastaCache, id + '.jpg');
    if (fs.existsSync(emCache)) return Promise.resolve(fs.readFileSync(emCache));
    if (!sharp) return Promise.reject(new Error('sharp não instalado'));
    return original(f).then(function (buf) {
      return sharp(buf).rotate().resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78, progressive: false }).toBuffer();
    }).then(function (out) {
      fs.mkdirSync(pastaCache, { recursive: true });
      fs.writeFileSync(emCache, out);
      return out;
    });
  }

  function estado() {
    return {
      ativo: ativo(),
      origem: cfg.pasta ? 'Pasta: ' + cfg.pasta : cfg.googleDrive && cfg.googleDrive.pastaId ? 'Google Drive (pasta ' + cfg.googleDrive.pastaId + ')' : 'não configurada',
      total: lista.length,
      erro: erro
    };
  }

  return { ativo: ativo, aleatoria: aleatoria, imagem: imagem, estado: estado, atualizarLista: atualizarLista };
}

module.exports = { criar: criar };
