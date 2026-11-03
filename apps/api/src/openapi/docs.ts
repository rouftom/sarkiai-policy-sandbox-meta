/**
 * Self-contained interactive reference. It fetches `/openapi.json` and renders
 * it with no external asset: the API can serve it behind its own CSP, and a
 * reviewer can call an operation from the page with their own session token.
 */

export const DOCS_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SarkiAI Policy Sandbox · API</title>
<style>
  :root { color-scheme: light dark; --bg: #f8fafc; --panel: #ffffff; --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --accent: #1d4ed8; --ok: #047857; --warn: #b45309; --err: #b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b1120; --panel: #111827; --ink: #e2e8f0; --muted: #94a3b8; --line: #1f2937; --accent: #60a5fa; --ok: #34d399; --warn: #fbbf24; --err: #f87171; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
  header { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 20px; background: var(--panel); border-bottom: 1px solid var(--line); }
  header h1 { margin: 0; font-size: 15px; letter-spacing: -0.01em; }
  header p { margin: 0; color: var(--muted); font-size: 12px; }
  header .grow { flex: 1; }
  header input { width: min(360px, 100%); padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); font: inherit; }
  main { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; min-height: calc(100dvh - 66px); }
  nav { border-right: 1px solid var(--line); background: var(--panel); padding: 16px 12px 40px; overflow-y: auto; max-height: calc(100dvh - 66px); }
  nav h2 { margin: 18px 8px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); }
  nav h2:first-child { margin-top: 0; }
  nav button { display: flex; width: 100%; gap: 8px; align-items: baseline; padding: 6px 8px; border: 0; border-radius: 7px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
  nav button:hover, nav button.active { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  nav .method { flex: 0 0 52px; font: 600 10px/1.6 ui-monospace, monospace; text-transform: uppercase; color: var(--accent); }
  nav .path { font: 12px/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
  section { padding: 28px 32px 60px; overflow-x: hidden; }
  section h2 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
  section .lead { margin: 6px 0 22px; color: var(--muted); max-width: 70ch; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); font: 600 10px/1.6 ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.06em; }
  .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .card { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 16px 18px; }
  .card h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
  label { display: block; margin: 8px 0 4px; font-size: 11px; color: var(--muted); }
  input, textarea, select { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); font: 13px/1.5 ui-monospace, monospace; }
  textarea { min-height: 150px; resize: vertical; }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; }
  .actions button { padding: 8px 14px; border: 0; border-radius: 8px; background: var(--accent); color: white; font: 600 12px/1.4 inherit; cursor: pointer; }
  .actions button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  pre { margin: 12px 0 0; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); overflow: auto; max-height: 420px; font: 12px/1.55 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .status { font: 600 12px/1.5 ui-monospace, monospace; }
  .status.ok { color: var(--ok); } .status.warn { color: var(--warn); } .status.err { color: var(--err); }
  .empty { color: var(--muted); }
  .schema { font: 11px/1.5 ui-monospace, monospace; color: var(--muted); }
  @media (max-width: 760px) { main { grid-template-columns: 1fr; } nav { max-height: none; border-right: 0; border-bottom: 1px solid #ccc; } }
</style>
</head>
<body>
<header>
  <div>
    <strong>SarkiAI Policy Sandbox</strong>
    <p id="meta">Loading the OpenAPI document…</p>
  </div>
  <span class="grow"></span>
  <input id="token" type="password" autocomplete="off" placeholder="Session token for Try it (optional)">
</header>
<main>
  <nav id="nav"><p class="empty" style="padding:0 8px">Loading…</p></nav>
  <section id="detail"><p class="empty">Select an operation.</p></section>
</main>
<script>
(function () {
  var spec = null;
  var selected = null;
  var nav = document.getElementById('nav');
  var detail = document.getElementById('detail');
  var meta = document.getElementById('meta');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function example(schema) {
    if (!schema || typeof schema !== 'object') return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum) return schema.enum[0];
    if (schema.type === 'object') {
      var out = {};
      Object.keys(schema.properties || {}).forEach(function (key) {
        out[key] = example(schema.properties[key]);
      });
      return out;
    }
    if (schema.type === 'array') return schema.items ? [example(schema.items)] : [];
    if (schema.type === 'integer' || schema.type === 'number') return 1;
    if (schema.type === 'boolean') return false;
    if (schema.format === 'email') return 'operator@example.org';
    if (schema.format === 'date-time') return new Date().toISOString();
    return '';
  }

  function methodClass(method) {
    return method === 'get' ? 'get' : method === 'post' ? 'post' : method === 'delete' ? 'del' : 'other';
  }

  function renderNav() {
    var groups = {};
    Object.keys(spec.paths).forEach(function (path) {
      Object.keys(spec.paths[path]).forEach(function (method) {
        var op = spec.paths[path][method];
        var tag = (op.tags && op.tags[0]) || 'other';
        (groups[tag] = groups[tag] || []).push({ path: path, method: method, op: op });
      });
    });
    var html = '';
    Object.keys(groups).sort().forEach(function (tag) {
      html += '<h2>' + esc(tag) + '</h2>';
      groups[tag].forEach(function (entry) {
        var key = entry.method + ' ' + entry.path;
        var active = selected === key ? ' active' : '';
        html += '<button type="button" class="' + active + '" data-key="' + esc(key) + '">' +
          '<span class="method">' + esc(entry.method) + '</span>' +
          '<span class="path">' + esc(entry.path) + '</span></button>';
      });
    });
    nav.innerHTML = html;
    Array.prototype.forEach.call(nav.querySelectorAll('button'), function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-key');
        var parts = key.split(' ');
        select(parts[0], parts[1]);
      });
    });
  }

  function findOperation(method, path) {
    return spec.paths[path] && spec.paths[path][method];
  }

  function select(method, path) {
    selected = method + ' ' + path;
    renderNav();
    var op = findOperation(method, path);
    var params = op.parameters || [];
    var pathParams = params.filter(function (p) { return p.in === 'path'; });
    var queryParams = params.filter(function (p) { return p.in === 'query'; });
    var bodySchema = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'] && op.requestBody.content['application/json'].schema;
    var html = '';
    html += '<span class="pill">' + esc(method) + '</span> <code>' + esc(path) + '</code>';
    html += '<h2 style="margin-top:12px">' + esc(op.summary || '') + '</h2>';
    if (op.description) html += '<p class="lead">' + esc(op.description) + '</p>';
    else html += '<p class="lead"></p>';
    html += '<div class="grid">';
    if (pathParams.length || queryParams.length) {
      html += '<div class="card"><h3>Parameters</h3>';
      pathParams.forEach(function (p) {
        html += '<label for="p-' + esc(p.name) + '">' + esc(p.name) + ' (path)</label><input id="p-' + esc(p.name) + '" data-in="path" data-name="' + esc(p.name) + '" value="">';
      });
      queryParams.forEach(function (p) {
        html += '<label for="q-' + esc(p.name) + '">' + esc(p.name) + ' (query)' + (p.required ? ' · required' : '') + '</label><input id="q-' + esc(p.name) + '" data-in="query" data-name="' + esc(p.name) + '" value="">';
      });
      html += '</div>';
    }
    if (bodySchema) {
      html += '<div class="card"><h3>Request body</h3><textarea id="body">' + esc(JSON.stringify(example(bodySchema), null, 2)) + '</textarea></div>';
    }
    html += '</div>';
    html += '<div class="actions"><button type="button" id="send">Send</button><button type="button" class="secondary" id="curl">Copy curl</button><span class="status" id="status"></span></div>';
    html += '<pre id="response" class="empty">No request sent yet.</pre>';
    detail.innerHTML = html;

    document.getElementById('send').addEventListener('click', function () { send(method, path, op); });
    document.getElementById('curl').addEventListener('click', function () { copyCurl(method, path, op); });
  }

  function readInputs() {
    var values = { path: {}, query: {} };
    Array.prototype.forEach.call(detail.querySelectorAll('input[data-in]'), function (input) {
      values[input.getAttribute('data-in')][input.getAttribute('data-name')] = input.value;
    });
    return values;
  }

  function requestUrl(path) {
    var inputs = readInputs();
    var url = path.replace(/{([^}]+)}/g, function (_, name) {
      return encodeURIComponent(inputs.path[name] || '');
    });
    var query = new URLSearchParams();
    Object.keys(inputs.query).forEach(function (name) {
      if (inputs.query[name]) query.set(name, inputs.query[name]);
    });
    var suffix = query.toString();
    return suffix ? url + '?' + suffix : url;
  }

  function requestInit(method) {
    var token = document.getElementById('token').value.trim();
    var init = { method: method.toUpperCase(), headers: {} };
    if (token) init.headers.Authorization = 'Bearer ' + token;
    var body = document.getElementById('body');
    if (body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = body.value;
    }
    return init;
  }

  function printResponse(status, text) {
    var node = document.getElementById('status');
    var out = document.getElementById('response');
    node.textContent = String(status);
    node.className = 'status ' + (status < 300 ? 'ok' : status < 500 ? 'warn' : 'err');
    try { out.textContent = JSON.stringify(JSON.parse(text), null, 2); }
    catch (_) { out.textContent = text; }
  }

  async function send(method, path) {
    var url = requestUrl(path);
    var init = requestInit(method);
    try {
      var response = await fetch(url, init);
      printResponse(response.status, await response.text());
    } catch (error) {
      printResponse(0, String(error));
    }
  }

  function copyCurl(method, path) {
    var url = requestUrl(path);
    var token = document.getElementById('token').value.trim();
    var body = document.getElementById('body');
    var parts = ['curl -X ' + method.toUpperCase() + " '" + url + "'"];
    if (token) parts.push("-H 'Authorization: Bearer " + token + "'");
    if (body) { parts.push("-H 'Content-Type: application/json'"); parts.push("-d '" + body.value.replace(/'/g, "'\\''") + "'"); }
    var command = parts.join(' ');
    if (navigator.clipboard) navigator.clipboard.writeText(command);
    var node = document.getElementById('status');
    node.textContent = 'curl copied';
    node.className = 'status ok';
  }

  fetch('/openapi.json', { headers: { accept: 'application/json' } })
    .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
    .then(function (document) {
      spec = document;
      meta.textContent = document.info.title + ' · ' + document.info.version + ' · ' + Object.keys(document.paths).length + ' paths';
      renderNav();
    })
    .catch(function (error) {
      meta.textContent = 'Could not load /openapi.json: ' + String(error);
      nav.innerHTML = '<p class="empty" style="padding:0 8px">No document.</p>';
    });
})();
</script>
</body>
</html>`
