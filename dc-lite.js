/* dc-lite: un runtime mic care afișează paginile Design Component ca site static. */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) { var s = typeof p === 'function' ? p(this.state) : p; Object.assign(this.state, s || {}); schedule(); }
    forceUpdate() { schedule(); }
  }
  window.DCLogic = DCLogic;

  var root, tpl, comp, queued = false;
  function schedule() { if (queued) return; queued = true; Promise.resolve().then(function () { queued = false; render(); }); }

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true; if (path === 'false') return false; if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    var parts = path.split('.'), v;
    for (var i = scopes.length - 1; i >= 0; i--) { if (scopes[i] && Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) { v = scopes[i][parts[0]]; break; } }
    for (var j = 1; j < parts.length && v != null; j++) v = v[parts[j]];
    return v;
  }
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/, ANY = /\{\{\s*([^}]+?)\s*\}\}/g;
  function interp(str, scopes) { return str.replace(ANY, function (_, p) { var v = lookup(p, scopes); return v == null ? '' : String(v); }); }

  function build(node, scopes, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(node.data.indexOf('{{') < 0 ? node.data : interp(node.data, scopes))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      var list = lookup((node.getAttribute('list') || '').replace(/[{}]/g, ''), scopes) || [], as = node.getAttribute('as') || 'item';
      list.forEach(function (it, i) { var sc = {}; sc[as] = it; sc.$index = i; kids(node, scopes.concat([sc]), out); });
      return;
    }
    if (tag === 'sc-if') { if (lookup((node.getAttribute('value') || '').replace(/[{}]/g, ''), scopes)) kids(node, scopes, out); return; }
    var el = node.namespaceURI === 'http://www.w3.org/2000/svg' ? document.createElementNS(node.namespaceURI, node.tagName) : document.createElement(tag);
    el.__ev = {};
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a], name = at.name, val = at.value;
      if (name.indexOf('hint-') === 0) continue;
      var m = WHOLE.exec(val);
      if (/^on[a-z]/i.test(name) && m) {
        var fn = lookup(m[1], scopes), ev = name.slice(2).toLowerCase();
        if (ev === 'change') ev = 'input';
        if (typeof fn === 'function') el.__ev[ev] = fn;
        continue;
      }
      if (m) { var v = lookup(m[1], scopes); if (v === false || v == null) continue; val = v === true ? '' : String(v); }
      else if (val.indexOf('{{') >= 0) val = interp(val, scopes);
      el.setAttribute(name, val);
    }
    var sub = [];
    kids(node, scopes, sub);
    sub.forEach(function (c) { el.appendChild(c); });
    out.push(el);
  }
  function kids(node, scopes, out) { var ch = node.content ? node.content.childNodes : node.childNodes; for (var i = 0; i < ch.length; i++) build(ch[i], scopes, out); }

  function bind(el) {
    el.__h = el.__h || {};
    Object.keys(el.__ev || {}).forEach(function (ev) {
      if (!el.__h[ev]) { el.__h[ev] = true; el.addEventListener(ev, function (e) { var f = el.__ev && el.__ev[ev]; if (f) f(e); }); }
    });
  }
  function morph(cur, next) {
    if (cur.nodeType !== next.nodeType || cur.nodeName !== next.nodeName) { cur.parentNode.replaceChild(next, cur); walkBind(next); return; }
    if (cur.nodeType === 3) { if (cur.data !== next.data) cur.data = next.data; return; }
    var i, na = next.attributes, ca = cur.attributes;
    for (i = ca.length - 1; i >= 0; i--) if (!next.hasAttribute(ca[i].name)) cur.removeAttribute(ca[i].name);
    for (i = 0; i < na.length; i++) if (cur.getAttribute(na[i].name) !== na[i].value) cur.setAttribute(na[i].name, na[i].value);
    if ((cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA') && next.hasAttribute('value') && cur.value !== next.getAttribute('value') && document.activeElement !== cur) cur.value = next.getAttribute('value');
    cur.__ev = next.__ev; bind(cur);
    var cc = Array.prototype.slice.call(cur.childNodes), nc = Array.prototype.slice.call(next.childNodes);
    for (i = 0; i < nc.length; i++) { if (i < cc.length) morph(cc[i], nc[i]); else { cur.appendChild(nc[i]); walkBind(nc[i]); } }
    for (i = nc.length; i < cc.length; i++) cur.removeChild(cc[i]);
  }
  function walkBind(n) { if (n.nodeType !== 1) return; bind(n); for (var i = 0; i < n.childNodes.length; i++) walkBind(n.childNodes[i]); }

  function render() {
    var vals = comp.renderVals ? comp.renderVals() : {}, out = [];
    kids(tpl, [vals], out);
    var holder = document.createElement('div'); out.forEach(function (n) { holder.appendChild(n); });
    if (!root.__done) { root.innerHTML = ''; while (holder.firstChild) root.appendChild(holder.firstChild); walkBind(root); root.__done = true; return; }
    var tmp = document.createElement(root.tagName); tmp.__ev = {};
    while (holder.firstChild) tmp.appendChild(holder.firstChild);
    var cc = Array.prototype.slice.call(root.childNodes), nc = Array.prototype.slice.call(tmp.childNodes);
    for (var i = 0; i < nc.length; i++) { if (i < cc.length) morph(cc[i], nc[i]); else { root.appendChild(nc[i]); walkBind(nc[i]); } }
    for (i = nc.length; i < cc.length; i++) root.removeChild(cc[i]);
  }

  document.addEventListener('DOMContentLoaded', function () {
    root = document.querySelector('x-dc');
    tpl = document.createElement('template');
    tpl.innerHTML = root.innerHTML;
    var code = document.querySelector('script[data-dc-script]').textContent;
    var C = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
    comp = new C({});
    render();
    root.setAttribute('data-ready', '');
    if (comp.componentDidMount) comp.componentDidMount();
  });
})();
