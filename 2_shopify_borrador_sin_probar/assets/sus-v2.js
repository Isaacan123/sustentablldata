/*
  SUSTENTABLL · Diseño definitivo para Horizon (sus-v2)
  Archivo: assets/sus-v2.js · NUEVO · módulo ES sin dependencias.
  Componentes: <sus2-shop>, <sus2-hero>, <sus2-story>, <sus2-water>, <sus2-contact>, <sus2-reveal>.
  Todos los datos de productos vienen de Shopify (JSON generado por Liquid). No hay catálogo simulado.
*/

const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DESIGN = !!(window.Shopify && window.Shopify.designMode);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function norm(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9$<\- ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function track(name, data) {
  try { if (window.Shopify && Shopify.analytics && typeof Shopify.analytics.publish === 'function') Shopify.analytics.publish(name, data || {}); } catch (e) { /* nunca bloquear */ }
}
function readJson(el, fallback) { if (!el) return fallback; try { return JSON.parse(el.textContent); } catch (e) { return fallback; } }
function onLoaded(fn) {
  if (!document.getElementById('sus-ld') || document.documentElement.dataset.susLoaded === '1') { fn(); return; }
  document.addEventListener('sus:loaded', fn, { once: true });
}

/* ---------- Dinero (usa el formato de la tienda; moneda MXN configurada en Shopify) ---------- */
export function formatMoney(cents, format) {
  const n = Number(cents) / 100;
  const f = format || '${{amount}}';
  const fix = (num, dec, th, de) => {
    const [i, d] = num.toFixed(dec).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, th) + (dec ? de + d : '');
  };
  return f.replace(/\{\{\s*(\w+)\s*\}\}/, (m, k) => ({
    amount: fix(n, 2, ',', '.'),
    amount_no_decimals: fix(n, 0, ',', '.'),
    amount_with_comma_separator: fix(n, 2, '.', ','),
    amount_no_decimals_with_comma_separator: fix(n, 0, '.', ','),
    amount_with_apostrophe_separator: fix(n, 2, "'", '.')
  }[k] || fix(n, 2, ',', '.')));
}

/* ---------- Carrito: acción nativa de Horizon o Ajax API de Shopify ---------- */
export async function addToCart(variantId, quantity = 1) {
  const actions = window.Shopify && window.Shopify.actions;
  if (actions && typeof actions.updateCart === 'function') {
    const result = await actions.updateCart({ lines: [{ merchandiseId: `gid://shopify/ProductVariant/${variantId}`, quantity }] }, { context: 'product' });
    if (result && result.userErrors && result.userErrors.length) throw new Error(result.userErrors[0].message || 'No se pudo agregar al carrito.');
    if (typeof actions.openCart === 'function') { try { await actions.openCart(); } catch (e) { /* ya agregado */ } }
    return { mode: 'actions' };
  }
  const root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  const r = await fetch(`${root}cart/add.js`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: [{ id: Number(variantId), quantity }] }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.description || data.message || 'No se pudo agregar al carrito.');
  document.dispatchEvent(new CustomEvent('cart:update', { bubbles: true, detail: { source: 'sus2', data } }));
  return { mode: 'ajax' };
}

/* ---------- Normalización de productos (product | json y /products/handle.js) ---------- */
function imgUrl(src, w) {
  if (!src) return '';
  let s = typeof src === 'string' ? src : (src.src || (src.preview_image && src.preview_image.src) || '');
  if (!s) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  return s + (s.includes('?') ? '&' : '?') + 'width=' + w;
}
export function parseColorMap(text) {
  return String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, hex, group, syn] = l.split('|').map((x) => (x || '').trim());
    return { name, hex: /^#[0-9a-f]{3,8}$/i.test(hex) ? hex : '#c9c6bf', alt: /altern/i.test(group || ''), syn: (syn || '').split(',').map(norm).filter(Boolean) };
  }).filter((c) => c.name);
}
export function normalizeProduct(raw, extra, cfg) {
  const p = raw || {};
  const optNames = (p.options || []).map((o) => (typeof o === 'string' ? o : o.name));
  const find = (want) => optNames.findIndex((n) => norm(n) === norm(want));
  let ci = find(cfg.colorOption || 'Color'); if (ci < 0) ci = optNames.findIndex((n) => /^(color|colour)$/i.test(norm(n)));
  let si = find(cfg.sizeOption || 'Talla'); if (si < 0) si = optNames.findIndex((n) => /^(talla|size|tamano)$/i.test(norm(n)));
  const variants = (p.variants || []).map((v) => ({
    id: v.id, price: Number(v.price), compare: Number(v.compare_at_price || 0), available: !!v.available,
    opts: v.options || [v.option1, v.option2, v.option3].filter((x) => x != null),
    img: v.featured_image ? (v.featured_image.src || v.featured_image) : null
  }));
  const media = (p.media && p.media.length ? p.media.filter((m) => !m.media_type || m.media_type === 'image').map((m) => ({ src: m.src || (m.preview_image && m.preview_image.src), alt: m.alt || '' }))
    : (p.images || []).map((s) => ({ src: typeof s === 'string' ? s : s.src, alt: (s && s.alt) || '' }))).filter((m) => m.src);
  const map = cfg.colorMapList || [];
  const rawColors = ci >= 0 ? [...new Set(variants.map((v) => v.opts[ci]))] : [];
  const known = map.filter((c) => rawColors.some((r) => norm(r) === norm(c.name)));
  const unknown = rawColors.filter((r) => !map.some((c) => norm(c.name) === norm(r))).map((r) => ({ name: r, hex: '#c9c6bf', alt: false, syn: [] }));
  const colors = known.map((c) => ({ ...c, name: rawColors.find((r) => norm(r) === norm(c.name)) })).concat(unknown);
  const sizes = si >= 0 ? [...new Set(variants.map((v) => v.opts[si]))] : [];
  const imagesFor = (color) => {
    if (ci < 0) return media.map((m) => m.src);
    const out = [];
    variants.filter((v) => norm(v.opts[ci]) === norm(color) && v.img).forEach((v) => { const s = typeof v.img === 'string' ? v.img : v.img.src; if (s && !out.includes(s)) out.push(s); });
    const nc = norm(color);
    media.filter((m) => norm(m.alt).startsWith(nc)).sort((a, b) => (/espalda|back/.test(norm(a.alt)) ? 1 : 0) - (/espalda|back/.test(norm(b.alt)) ? 1 : 0)).forEach((m) => { if (!out.includes(m.src)) out.push(m.src); });
    return out;
  };
  return {
    id: p.id, handle: p.handle, title: p.title || '', type: p.type || p.product_type || '', url: (extra && extra.url) || p.url || `/products/${p.handle}`,
    priceMin: Number(p.price_min != null ? p.price_min : p.price), available: !!p.available,
    ci, si, colors, sizes, variants, media, imagesFor,
    m: (extra && extra.m) || {}, desc: (extra && extra.desc) || String(p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 420)
  };
}
function variantFor(p, color, size) {
  return p.variants.find((v) => (p.ci < 0 || norm(v.opts[p.ci]) === norm(color)) && (p.si < 0 || !size || norm(v.opts[p.si]) === norm(size)));
}
function colorPrice(p, color) {
  const vs = p.variants.filter((v) => p.ci < 0 || norm(v.opts[p.ci]) === norm(color));
  return vs.length ? Math.min(...vs.map((v) => v.price)) : p.priceMin;
}
function colorAvailable(p, color) { return p.variants.some((v) => (p.ci < 0 || norm(v.opts[p.ci]) === norm(color)) && v.available); }
function sizeAvailable(p, color, size) { return p.variants.some((v) => (p.ci < 0 || norm(v.opts[p.ci]) === norm(color)) && norm(v.opts[p.si]) === norm(size) && v.available); }

/* ---------- Buscador: intención (tipo, color, talla, precio, mayoreo) ---------- */
function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 9;
  const m = []; for (let i = 0; i <= b.length; i++) m[i] = [i]; for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1));
  return m[b.length][a.length];
}
function hasWord(text, w) {
  if (!w) return false;
  if (w.includes(' ')) return (' ' + text + ' ').includes(' ' + w + ' ');
  if ((' ' + text + ' ').includes(' ' + w + ' ')) return true;
  return w.length >= 4 && text.split(' ').some((t) => t.length >= 4 && levenshtein(t, w) <= 1);
}
export function parseQuery(raw, ctx) {
  const t = ' ' + norm(raw) + ' ';
  const r = { text: norm(raw), types: [], colors: [], size: null, max: null, b2b: false };
  const m = t.match(/(?:menos de|hasta|maximo|max|debajo de|<)\s*\$?\s*(\d{2,6})/) || t.match(/\$\s*(\d{2,6})/);
  if (m) r.max = Number(m[1]);
  Object.entries(ctx.typeWords).forEach(([type, words]) => { if (words.some((w) => hasWord(t.trim(), w))) r.types.push(type); });
  ctx.colors.forEach((c) => { const words = [norm(c.name)].concat(c.syn); if (words.some((w) => hasWord(t.trim(), w))) r.colors.push(c.name); });
  // Desambiguación simple: el nombre completo gana a sinónimos genéricos ("gris", "azul", "verde").
  const exact = ctx.colors.filter((c) => (' ' + t + ' ').includes(' ' + norm(c.name) + ' ')).map((c) => c.name);
  if (exact.length) r.colors = exact;
  const sm = t.match(/talla\s+(xxs|xs|s|m|l|xl|xxl|\d{1,2})\b/) || t.match(/\b(xs|xl|xxl)\b/);
  if (sm) r.size = sm[1].toUpperCase();
  r.b2b = ctx.b2b.some((w) => hasWord(t.trim(), w));
  r.structured = !!(r.types.length || r.colors.length || r.size || r.max || r.b2b);
  return r;
}
export function searchResults(products, q) {
  const out = [];
  products.forEach((p) => {
    if (q.types.length && !q.types.includes(norm(p.type))) return;
    if (q.max && p.priceMin / 100 > q.max) return;
    if (q.size && p.si >= 0 && !p.sizes.some((s) => norm(s) === norm(q.size))) return;
    const cols = p.colors.length ? p.colors : [{ name: '' }];
    cols.forEach((c) => {
      if (q.colors.length && !q.colors.some((x) => norm(x) === norm(c.name))) return;
      out.push({ p, c: c.name });
    });
  });
  if (!q.structured && q.text) return out.filter((x) => norm(`${x.p.title} ${x.c} ${x.p.type} ${x.p.m.comp || ''}`).includes(q.text));
  return out;
}

/* ---------- Revelado por palabras y por bloques ---------- */
export function splitWords(el) {
  if (!el || el.dataset.sus2Splitted) return;
  el.dataset.sus2Splitted = '1';
  let i = 0;
  (function walk(n) {
    Array.from(n.childNodes).forEach((c) => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { f.appendChild(document.createTextNode(w)); return; }
          const o = document.createElement('span'); o.className = 'sw-w';
          const s = document.createElement('span'); s.textContent = w; s.style.setProperty('--d', (i++ * 0.08) + 's');
          o.appendChild(s); f.appendChild(o);
        });
        c.parentNode.replaceChild(f, c);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    });
  })(el);
}
function revealAll(root) {
  const heads = $$('[data-sus2-split]', root);
  heads.forEach(splitWords);
  const els = heads.concat($$('[data-sus2-reveal]', root));
  if (RM || DESIGN || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('is-in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -10% 0px' });
  onLoaded(() => els.forEach((e) => io.observe(e)));
}
function define(name, ctor) { if (!customElements.get(name)) customElements.define(name, ctor); }

class Sus2Reveal extends HTMLElement { connectedCallback() { revealAll(this); } }
define('sus2-reveal', Sus2Reveal);

/* ============================== TIENDA ============================== */
class Sus2Shop extends HTMLElement {
  connectedCallback() {
    if (this._ready) return; this._ready = true;
    const cfg = readJson($('[data-sus2-config]', this), {});
    cfg.colorMapList = parseColorMap(cfg.colorMap);
    this.cfg = cfg;
    const rows = readJson($('[data-sus2-products]', this), []);
    this.products = rows.map((r) => normalizeProduct(r.p, r, cfg)).filter((p) => p.variants.length);
    this.byHandle = new Map(this.products.map((p) => [p.handle, p]));
    this.typeWords = {};
    String(cfg.garmentSynonyms || '').split(/\n+/).forEach((l) => { const [k, v] = l.split(':'); if (k && v) this.typeWords[norm(k)] = [norm(k)].concat(v.split(',').map(norm).filter(Boolean)); });
    this.products.forEach((p) => { const k = norm(p.type); if (k && !this.typeWords[k]) this.typeWords[k] = [k]; });
    this.ctx = { typeWords: this.typeWords, colors: cfg.colorMapList.concat(...this.products.map((p) => p.colors.filter((c) => !cfg.colorMapList.some((x) => norm(x.name) === norm(c.name))))), b2b: String(cfg.b2bWords || '').split(',').map(norm).filter(Boolean) };
    this.state = new Map();
    this.filter = 'todo'; this.q = null;
    this.saved = this.loadSaved(); this.svSize = {};
    this.grid = $('[data-grid]', this);
    revealAll(this);
    if (!this.grid) return;
    this.renderTabs(); this.renderGrid(); this.bindGrid(); this.bindSearch(); this.bindModal(); this.bindSaved(); this.renderSavedCount();
    if (location.hash === '#guardados') setTimeout(() => this.openSaved(), 300);
    window.addEventListener('hashchange', () => { if (location.hash === '#guardados') this.openSaved(); });
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-sus2-saved-open], a[href$="#guardados"]'); if (b && !this.contains(b) || (b && b.hasAttribute('data-sus2-saved-open'))) { e.preventDefault(); this.openSaved(); } });
  }
  money(c) { return formatMoney(c, this.cfg.money); }
  toast(msg) {
    const t = $('[data-toast]', this); if (!t) return;
    t.textContent = msg; t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2600);
  }
  /* --- tarjetas --- */
  swGroup(p, cur, attr) {
    const main = p.colors.filter((c) => !c.alt), alt = p.colors.filter((c) => c.alt);
    const btn = (c, i) => `<button type="button" ${attr}="${esc(c.name)}" class="sw${/jaspe/i.test(norm(c.name)) ? ' sw-j' : ''}${c.alt ? ' sw-alt' : ''}" style="--sw:${esc(c.hex)};--i:${i || 0}" aria-pressed="${norm(c.name) === norm(cur)}" aria-label="${esc(c.name)}${colorAvailable(p, c.name) ? '' : ' (agotado)'}" title="${esc(c.name)}"></button>`;
    const open = alt.some((c) => norm(c.name) === norm(cur));
    return `<div class="swg${open ? ' is-open' : ''}" role="group" aria-label="Color">${main.map((c) => btn(c)).join('')}${alt.length ? `<button type="button" class="sw-more" aria-expanded="${open}" aria-label="Más colores"><span class="sw-more-o">+${alt.length}</span><span class="sw-more-c">−</span></button><span class="sw-alts">${alt.map((c, i) => btn(c, i)).join('')}</span>` : ''}</div>`;
  }
  mediaHtml(p, color, eager) {
    const imgs = p.imagesFor(color);
    if (!imgs.length) return `<span class="st-noimg">${p.ci >= 0 ? 'Sin foto de este color' : 'Imagen no disponible'}</span>`;
    const alt = esc(`${p.title}${color ? ' ' + color : ''}`);
    const main = `<img src="${imgUrl(imgs[0], 720)}" srcset="${imgUrl(imgs[0], 360)} 360w, ${imgUrl(imgs[0], 540)} 540w, ${imgUrl(imgs[0], 720)} 720w, ${imgUrl(imgs[0], 900)} 900w" sizes="(min-width: 990px) 33vw, (min-width: 600px) 50vw, 100vw" alt="${alt}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
    const back = imgs[1] ? `<img class="st-back" src="${imgUrl(imgs[1], 720)}" alt="" loading="lazy" decoding="async">` : '';
    return main + back;
  }
  cardHtml(p, i) {
    const st = this.state.get(p.handle) || { color: p.colors[0] ? p.colors[0].name : '', size: '' };
    this.state.set(p.handle, st);
    const on = this.saved.includes(`${p.handle}|${st.color}`);
    const avail = colorAvailable(p, st.color);
    const sizes = p.si >= 0 ? `<div class="st-sizesh"><span>Tallas</span><button type="button" class="st-link" data-act="open">Ver detalles</button></div><div class="st-sizes" role="group" aria-label="Talla">${p.sizes.map((s) => { const ok = sizeAvailable(p, st.color, s); return `<button type="button" data-act="size" data-s="${esc(s)}" aria-pressed="${norm(s) === norm(st.size)}"${ok ? '' : ' disabled aria-disabled="true" title="Agotado"'}>${esc(s)}</button>`; }).join('')}</div>` : '';
    const addLabel = !avail ? 'Agotado' : (st.size ? `Agregar talla ${esc(st.size)}` : (p.si >= 0 ? 'Agregar al carrito' : 'Agregar al carrito'));
    return `<li><article class="st-card" data-h="${esc(p.handle)}" data-c="${esc(st.color)}">
      <button class="st-media" type="button" data-act="open" aria-label="Ver detalles: ${esc(p.title + ' ' + st.color)}">${this.mediaHtml(p, st.color, i < 3)}</button>
      <div class="st-body"><div class="st-bar"><span class="st-badge${avail ? '' : ' off'}">${avail ? 'Disponible' : 'Agotado'}</span>${this.querySelector('[data-saved]') ? `<button type="button" class="st-save" data-act="save" aria-pressed="${on}" aria-label="${on ? 'Quitar de guardados' : 'Guardar'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg></button>` : ''}</div>
      <div class="st-head"><h3><a href="${esc(p.url)}" data-act="open">${esc(p.title)}</a></h3><b>${this.money(colorPrice(p, st.color))}</b></div>
      ${p.type ? `<p class="st-meta">${esc(p.type)}</p>` : ''}
      ${this.cfg.showComp && p.m.comp ? `<p class="st-comp"><i></i>${esc(p.m.comp)}</p>` : ''}
      ${p.colors.length ? `<div class="st-cw"><span class="st-cn">${esc(st.color)}</span>${this.swGroup(p, st.color, 'data-act="color" data-col')}</div>` : ''}
      ${sizes}</div>
      <button type="button" class="st-add${st.size && avail ? ' ready' : ''}" data-act="add"${avail ? '' : ' disabled'}>${addLabel}</button></article></li>`;
  }
  renderGrid() {
    this.grid.innerHTML = this.products.map((p, i) => this.cardHtml(p, i)).join('');
    this.applyFilter();
  }
  rerenderCard(handle) {
    const p = this.byHandle.get(handle); const el = $(`.st-card[data-h="${CSS.escape(handle)}"]`, this.grid); if (!p || !el) return;
    const li = el.parentElement; const tmp = document.createElement('ul'); tmp.innerHTML = this.cardHtml(p, 9);
    const n = tmp.firstElementChild; n.hidden = li.hidden; li.replaceWith(n);
  }
  renderTabs() {
    const box = $('[data-tabs]', this); if (!box) return;
    if (!this.cfg.showTabs) { box.hidden = true; return; }
    const types = [...new Set(this.products.map((p) => p.type).filter(Boolean))];
    if (types.length < 2) { box.hidden = true; return; }
    box.innerHTML = `<button type="button" data-tab="todo" aria-pressed="true">Todo</button>` + types.map((t) => `<button type="button" data-tab="${esc(norm(t))}" aria-pressed="false">${esc(t)}</button>`).join('');
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; this.filter = b.dataset.tab; $$('[data-tab]', box).forEach((x) => x.setAttribute('aria-pressed', x === b)); this.applyFilter(); });
  }
  applyFilter() {
    let any = false; const q = this.q;
    const res = q && q.text ? searchResults(this.products, q) : null;
    $$('.st-card', this.grid).forEach((el) => {
      const p = this.byHandle.get(el.dataset.h);
      const okTab = this.filter === 'todo' || norm(p.type) === this.filter;
      let hit = true, col = null;
      if (res) { const mine = res.filter((x) => x.p === p); hit = mine.length > 0; if (hit && q.colors.length) col = mine[0].c; }
      el.parentElement.hidden = !(okTab && hit);
      if (okTab && hit) {
        any = true;
        const st = this.state.get(p.handle);
        let changed = false;
        if (col && norm(col) !== norm(st.color)) { st.color = col; changed = true; }
        if (q && q.size && p.sizes.some((s) => norm(s) === norm(q.size))) { st.size = p.sizes.find((s) => norm(s) === norm(q.size)); changed = true; }
        if (changed) this.rerenderCard(p.handle);
      }
    });
    const none = $('[data-none]', this); if (none) { none.hidden = any; const a = $('[data-search-all]', none); if (a) a.href = `${this.cfg.searchUrl || '/search'}?q=${encodeURIComponent(q ? q.text : '')}`; }
    const counts = { todo: 0 }; this.products.forEach((p) => { const ok = !res || res.some((x) => x.p === p); if (ok) { counts.todo++; const k = norm(p.type); counts[k] = (counts[k] || 0) + 1; } });
    $$('[data-tab]', this).forEach((t) => { let s = t.querySelector('sup'); if (!s) { s = document.createElement('sup'); t.appendChild(s); } s.textContent = counts[t.dataset.tab] || 0; });
    const meta = $('[data-meta]', this); if (meta) { const vis = $$('li:not([hidden])', this.grid).length; meta.textContent = q && q.text ? `${vis} ${vis === 1 ? 'prenda' : 'prendas'} para “${this.qRaw}”` : `${vis} ${vis === 1 ? 'prenda' : 'prendas'}`; }
  }
  bindGrid() {
    this.grid.addEventListener('click', async (e) => {
      const more = e.target.closest('.sw-more');
      if (more) { e.preventDefault(); const g = more.parentElement; const o = !g.classList.contains('is-open'); g.classList.toggle('is-open', o); more.setAttribute('aria-expanded', o); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const card = b.closest('.st-card'); const p = this.byHandle.get(card.dataset.h); const st = this.state.get(p.handle); const a = b.dataset.act;
      if (a === 'open') { e.preventDefault(); this.openModal(p, st.color, st.size); }
      else if (a === 'color') { st.color = b.dataset.col; if (st.size && !sizeAvailable(p, st.color, st.size)) st.size = ''; this.rerenderCard(p.handle); }
      else if (a === 'size') { st.size = b.dataset.s; this.rerenderCard(p.handle); const ad = $(`.st-card[data-h="${CSS.escape(p.handle)}"] .st-add`, this.grid); if (ad) ad.focus(); }
      else if (a === 'save') { this.toggleSave(p, st.color); }
      else if (a === 'add') { await this.add(p, st.color, st.size, card.querySelector('.st-media'), b); }
    });
  }
  async add(p, color, size, fromEl, btn) {
    if (p.si >= 0 && !size) { this.toast('Elige una talla.'); const z = fromEl && fromEl.closest('.st-card') ? fromEl.closest('.st-card').querySelector('.st-sizes') : null; if (z) { z.classList.remove('is-shake'); void z.offsetWidth; z.classList.add('is-shake'); } return false; }
    const v = variantFor(p, color, size);
    if (!v || !v.available) { this.toast('Esa combinación está agotada.'); return false; }
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Agregando…'; }
    try {
      const r = await addToCart(v.id, 1);
      this.fly(fromEl);
      this.toast(`${p.title} · ${color}${size ? ' · talla ' + size : ''} agregado al carrito.`);
      if (r.mode === 'ajax') this.toast('Agregado. Abre el carrito para ver tu pedido.');
      return true;
    } catch (err) { this.toast(err.message || 'No se pudo agregar.'); return false; }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }
  fly(src) {
    if (RM || !src) return;
    const target = document.querySelector(this.cfg.cartSelector || 'a[href$="/cart"]'); if (!target) return;
    const im = src.querySelector('img:not(.st-back)'); if (!im) return;
    const fr = src.getBoundingClientRect(), to = target.getBoundingClientRect(); const sz = Math.min(fr.width, fr.height) * 0.5;
    const f = document.createElement('div'); f.className = 'sus2-fly'; f.style.cssText = `width:${sz}px;height:${sz}px;left:${fr.left + fr.width / 2 - sz / 2}px;top:${fr.top + fr.height / 2 - sz / 2}px`;
    f.appendChild(im.cloneNode()); document.body.appendChild(f);
    const dx = to.left + to.width / 2 - (fr.left + fr.width / 2), dy = to.top + to.height / 2 - (fr.top + fr.height / 2);
    const an = f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.12)`, opacity: 0.3 }], { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)' });
    an.onfinish = () => f.remove();
  }
  /* --- guardados --- */
  loadSaved() { try { return JSON.parse(localStorage.getItem('sus2-saved') || '[]').filter((x) => typeof x === 'string'); } catch (e) { return []; } }
  persist() { try { localStorage.setItem('sus2-saved', JSON.stringify(this.saved)); } catch (e) { /* modo privado */ } this.renderSavedCount(); }
  toggleSave(p, color) {
    const k = `${p.handle}|${color}`; const i = this.saved.indexOf(k);
    if (i > -1) { this.saved.splice(i, 1); this.toast('Quitada de guardados.'); }
    else { this.saved.push(k); this.toast('Guardada. Encuéntrala en Guardados.'); track('add_to_wishlist', { product: p.title, color }); }
    this.persist(); this.rerenderCard(p.handle);
  }
  renderSavedCount() {
    const n = this.saved.length;
    $$('[data-sv-count]').forEach((c) => { if (c.textContent !== String(n)) { c.textContent = n; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); } c.closest('.st-svbtn, .pv-sv') && c.closest('.st-svbtn, .pv-sv').classList.toggle('has', n > 0); });
  }
  async productFor(handle) {
    if (this.byHandle.has(handle)) return this.byHandle.get(handle);
    try {
      const r = await fetch(`${this.cfg.root || '/'}products/${encodeURIComponent(handle)}.js`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      const p = normalizeProduct(await r.json(), null, this.cfg); this.byHandle.set(handle, p); return p;
    } catch (e) { return null; }
  }
  async renderSaved() {
    const d = $('[data-saved]', this); if (!d) return;
    const list = $('[data-sv-list]', d); const rows = [];
    for (const k of this.saved) {
      const [h, c] = k.split('|'); const p = await this.productFor(h);
      if (!p) { rows.push(`<li class="sv-it sv-gone"><div class="sv-b"><h4>Producto no disponible</h4><button type="button" class="sv-rm" data-sv-rm="${esc(k)}" aria-label="Quitar">Quitar</button></div></li>`); continue; }
      const sz = this.svSize[k] || ''; const imgs = p.imagesFor(c);
      rows.push(`<li class="sv-it" style="--i:${rows.length}"><button type="button" class="sv-th" data-sv-open="${esc(k)}" aria-label="Ver ${esc(p.title + ' ' + c)}">${imgs[0] ? `<img src="${imgUrl(imgs[0], 240)}" alt="" loading="lazy">` : '<span class="st-noimg">Sin foto</span>'}</button>
        <div class="sv-b"><div class="sv-h"><div><h4>${esc(p.title)}</h4><p><i class="sv-dot" style="background:${esc((p.colors.find((x) => norm(x.name) === norm(c)) || {}).hex || '#ccc')}"></i>${esc(c)}</p></div><b>${this.money(colorPrice(p, c))}</b></div>
        ${p.si >= 0 ? `<div class="sv-sz" role="group" aria-label="Talla">${p.sizes.map((z) => `<button type="button" data-sv-size="${esc(z)}" data-k="${esc(k)}" aria-pressed="${z === sz}"${sizeAvailable(p, c, z) ? '' : ' disabled'}>${esc(z)}</button>`).join('')}</div>` : ''}
        <div class="sv-ac"><button type="button" class="sv-add" data-sv-add="${esc(k)}"${sz || p.si < 0 ? '' : ' aria-disabled="true"'}>${sz ? 'Agregar talla ' + esc(sz) : (p.si < 0 ? 'Agregar' : 'Elige talla')}</button><button type="button" class="sv-rm" data-sv-rm="${esc(k)}" aria-label="Quitar de guardados"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button></div></div></li>`);
    }
    list.innerHTML = rows.join('');
    const n = this.saved.length;
    $('[data-sv-empty]', d).hidden = n > 0; $('[data-sv-foot]', d).hidden = n === 0;
    $('[data-sv-n]', d).textContent = n ? (n === 1 ? '1 prenda' : `${n} prendas`) : '';
    let tot = 0; for (const k of this.saved) { const [h, c] = k.split('|'); const p = this.byHandle.get(h); if (p) tot += colorPrice(p, c); }
    $('[data-sv-tot]', d).textContent = this.money(tot);
    const wa = $('[data-sv-wa]', d);
    if (wa && this.cfg.whatsapp) {
      const lines = ['Hola SUSTENTABLL, me interesan estas prendas:', ''].concat(this.saved.map((k) => { const [h, c] = k.split('|'); const p = this.byHandle.get(h); return `- ${p ? p.title : h} · ${c}${this.svSize[k] ? ' · talla ' + this.svSize[k] : ''}`; }));
      wa.href = `https://wa.me/${this.cfg.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
    }
  }
  openSaved() { const d = $('[data-saved]', this); if (!d) return; this.renderSaved(); if (!d.open) d.showModal(); }
  bindSaved() {
    const d = $('[data-saved]', this); if (!d) return;
    d.addEventListener('click', async (e) => {
      if (e.target === d) { d.close(); return; }
      const b = e.target.closest('button,a'); if (!b) return;
      if (b.hasAttribute('data-close')) { d.close(); return; }
      if (b.hasAttribute('data-sv-go')) { d.close(); this.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); return; }
      if (b.dataset.svSize) { this.svSize[b.dataset.k] = b.dataset.svSize; await this.renderSaved(); return; }
      if (b.dataset.svAdd) { const k = b.dataset.svAdd; const [h, c] = k.split('|'); const p = await this.productFor(h); if (!p) return; if (await this.add(p, c, this.svSize[k], null, b)) { b.textContent = 'Agregado ✓'; } return; }
      if (b.dataset.svRm) { const li = b.closest('.sv-it'); li.classList.add('out'); setTimeout(async () => { this.saved.splice(this.saved.indexOf(b.dataset.svRm), 1); this.persist(); await this.renderSaved(); const [h] = b.dataset.svRm.split('|'); this.rerenderCard(h); }, 240); return; }
      if (b.dataset.svOpen) { const [h, c] = b.dataset.svOpen.split('|'); const p = await this.productFor(h); if (p) { d.close(); this.openModal(p, c, this.svSize[b.dataset.svOpen]); } }
    });
  }
  /* --- vista rápida --- */
  bindModal() {
    const m = $('[data-modal]', this); if (!m) return; this.modal = m;
    m.addEventListener('click', async (e) => {
      if (e.target === m) { m.close(); return; }
      const more = e.target.closest('.sw-more'); if (more) { const g = more.parentElement; const o = !g.classList.contains('is-open'); g.classList.toggle('is-open', o); more.setAttribute('aria-expanded', o); return; }
      const b = e.target.closest('button'); if (!b) return; const M = this.M;
      if (b.hasAttribute('data-close')) m.close();
      else if (b.hasAttribute('data-m-prev')) { M.i = (M.i - 1 + M.imgs.length) % M.imgs.length; this.renderModal(); }
      else if (b.hasAttribute('data-m-next')) { M.i = (M.i + 1) % M.imgs.length; this.renderModal(); }
      else if (b.dataset.gi) { M.i = Number(b.dataset.gi); this.renderModal(); }
      else if (b.dataset.mc) { M.c = b.dataset.mc; M.i = 0; if (M.s && !sizeAvailable(M.p, M.c, M.s)) M.s = ''; this.renderModal(); }
      else if (b.dataset.ms) { M.s = b.dataset.ms; this.renderModal(); }
      else if (b.hasAttribute('data-m-add')) { await this.add(M.p, M.c, M.s, $('[data-m-main]', m), b); }
    });
    m.addEventListener('keydown', (e) => { if (!this.M || this.M.imgs.length < 2) return; if (e.key === 'ArrowLeft') $('[data-m-prev]', m).click(); if (e.key === 'ArrowRight') $('[data-m-next]', m).click(); });
    const wa = $('[data-m-wa]', m); if (wa) wa.addEventListener('click', () => track('click_whatsapp', { source: 'quick_view', product: this.M && this.M.p.title }));
  }
  openModal(p, color, size) {
    if (!this.modal) { location.href = p.url; return; }
    this.M = { p, c: color || (p.colors[0] && p.colors[0].name) || '', s: size || '', i: 0, imgs: [] };
    this.renderModal(); this.modal.showModal(); track('quick_view', { product: p.title });
  }
  renderModal() {
    const m = this.modal, M = this.M, p = M.p;
    M.imgs = p.imagesFor(M.c); if (M.i >= M.imgs.length) M.i = 0;
    const main = $('[data-m-main]', m);
    main.innerHTML = M.imgs.length ? `<img src="${imgUrl(M.imgs[M.i], 1100)}" alt="${esc(p.title + ' ' + M.c)}" decoding="async">` : `<span class="st-noimg">${p.ci >= 0 ? 'Sin foto de este color' : 'Imagen no disponible'}</span>`;
    $('[data-m-prev]', m).hidden = $('[data-m-next]', m).hidden = M.imgs.length < 2;
    $('[data-m-thumbs]', m).innerHTML = M.imgs.length > 1 ? M.imgs.map((s, i) => `<button type="button" data-gi="${i}" aria-current="${i === M.i}" aria-label="Imagen ${i + 1}"><img src="${imgUrl(s, 160)}" alt="" loading="lazy"></button>`).join('') : '';
    $('[data-m-kick]', m).textContent = p.type || '';
    $('[data-m-title]', m).textContent = p.title;
    $('[data-m-price]', m).textContent = this.money((variantFor(p, M.c, M.s) || {}).price || colorPrice(p, M.c));
    $('[data-m-color]', m).textContent = M.c;
    $('[data-m-sw]', m).innerHTML = p.colors.length ? this.swGroup(p, M.c, 'data-mc') : '';
    const sizesBox = $('[data-m-sizes]', m); $('[data-m-size-lbl]', m).hidden = sizesBox.hidden = p.si < 0;
    sizesBox.innerHTML = p.sizes.map((s) => `<button type="button" data-ms="${esc(s)}" aria-pressed="${s === M.s}"${sizeAvailable(p, M.c, s) ? '' : ' disabled title="Agotado"'}>${esc(s)}</button>`).join('');
    $('[data-m-desc]', m).textContent = p.desc || '';
    const rows = []; if (p.m.comp) rows.push(['Material', p.m.comp]); if (p.m.proc) rows.push(['Proceso', p.m.proc]); if (p.m.agua) rows.push(['Agua*', `≈${Number(p.m.agua).toLocaleString('es-MX')} Lt${p.m.aguaNota ? ' · ' + p.m.aguaNota : ''}`]);
    const dl = $('[data-m-dl]', m); dl.hidden = !rows.length; dl.innerHTML = rows.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('');
    $('[data-m-note]', m).hidden = !p.m.agua;
    const avail = colorAvailable(p, M.c); const ad = $('[data-m-add]', m);
    ad.disabled = !avail; ad.textContent = !avail ? 'Agotado' : (M.s ? `Agregar talla ${M.s}` : 'Agregar al carrito'); ad.classList.toggle('ready', !!M.s && avail);
    $('[data-m-link]', m).href = (variantFor(p, M.c, M.s) ? `${p.url}?variant=${variantFor(p, M.c, M.s).id}` : p.url);
    const wa = $('[data-m-wa]', m);
    if (wa && this.cfg.whatsapp) {
      const v = variantFor(p, M.c, M.s); const msg = String(this.cfg.waTemplate || '').replace('{producto}', p.title).replace('{color}', M.c || '-').replace('{talla}', M.s || 'por definir').replace('{precio}', this.money(v ? v.price : colorPrice(p, M.c))).replace('{url}', location.origin + p.url);
      wa.href = `https://wa.me/${this.cfg.whatsapp}?text=${encodeURIComponent(msg)}`;
    }
  }
  /* --- buscador --- */
  bindSearch() {
    const inp = $('[data-q]', this); if (!inp) return;
    const box = $('[data-sug]', this), clr = $('[data-clr]', this);
    let act = -1, items = [], recent = [];
    try { recent = JSON.parse(localStorage.getItem('sus2-recent') || '[]'); } catch (e) { recent = []; }
    const saveRecent = (v) => { v = v.trim(); if (!v) return; recent = [v].concat(recent.filter((x) => x !== v)).slice(0, 4); try { localStorage.setItem('sus2-recent', JSON.stringify(recent)); } catch (e) { /* */ } };
    const pop = String(this.cfg.popular || '').split(',').map((x) => x.trim()).filter(Boolean);
    const allColors = this.ctx.colors.filter((c) => this.products.some((p) => p.colors.some((x) => norm(x.name) === norm(c.name))));
    const sw = (prefix) => `<div class="sg-sw">${allColors.map((c) => `<button type="button" class="sg-chip sg-col" data-qv="${esc((prefix ? prefix + ' ' : '') + c.name.toLowerCase())}"><i style="background:${esc(c.hex)}"></i>${esc(c.name)}</button>`).join('')}</div>`;
    const mini = (p, c, i) => { const im = p.imagesFor(c)[0]; return `<button type="button" class="sg-card" role="option" id="sg-${this.dataset.sectionId}-${i}" data-h="${esc(p.handle)}" data-c="${esc(c)}"><span class="sg-th">${im ? `<img src="${imgUrl(im, 240)}" alt="" loading="lazy">` : '<span class="st-noimg">Sin foto</span>'}</span><b>${esc(p.title)}</b><small>${esc(c)}</small><em>${this.money(colorPrice(p, c))}</em></button>`; };
    const open = (h) => { box.innerHTML = h; if (box.hidden) { box.hidden = false; box.classList.remove('is-in'); void box.offsetWidth; box.classList.add('is-in'); } inp.setAttribute('aria-expanded', 'true'); };
    const close = () => { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; inp.removeAttribute('aria-activedescendant'); };
    const render = () => {
      const v = inp.value; clr.hidden = !v; this.qRaw = v.trim(); this.q = v.trim() ? parseQuery(v, this.ctx) : null; this.applyFilter();
      if (!v.trim()) {
        open(`<div class="sg-grid"><div class="sg-col1">${recent.length ? `<p class="sg-h">Recientes</p><div class="sg-chips">${recent.map((x) => `<button type="button" class="sg-chip sg-rec" data-qv="${esc(x)}">↺ ${esc(x)}</button>`).join('')}</div>` : ''}${pop.length ? `<p class="sg-h">Populares</p><div class="sg-chips">${pop.map((x) => `<button type="button" class="sg-chip" data-qv="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}${allColors.length ? `<p class="sg-h">Por color</p>${sw('')}` : ''}</div><div class="sg-col2"><p class="sg-h">Prendas</p><div class="sg-cards">${this.products.slice(0, 3).map((p, i) => mini(p, p.colors[0] ? p.colors[0].name : '', i)).join('')}</div></div></div>`);
      } else {
        const q = this.q, res = searchResults(this.products, q), tags = [];
        if (q.types.length) tags.push(...q.types); if (q.colors.length) tags.push(...q.colors); if (q.size) tags.push('Talla ' + q.size); if (q.max) tags.push('Hasta $' + q.max);
        let h = `<div class="sg-top"><span>${res.length ? `${res.length} ${res.length === 1 ? 'resultado' : 'resultados'}` : 'Sin resultados aquí'}</span>${tags.length ? `<span class="sg-tags">${tags.map((x) => `<i>${esc(x)}</i>`).join('')}</span>` : ''}</div><div class="sg-grid"><div class="sg-col1">`;
        if (q.b2b && this.cfg.whatsapp) h += `<a class="sg-b2b" role="option" id="sg-b2b-${this.dataset.sectionId}" href="https://wa.me/${this.cfg.whatsapp}?text=${encodeURIComponent(this.cfg.waQuote || '')}" target="_blank" rel="noopener noreferrer" data-b2b><b>Uniformes con tu logo</b><small>Cotiza por WhatsApp</small><span>→</span></a>`;
        if (q.types.length && !q.colors.length && allColors.length) h += `<p class="sg-h">Elige color</p>${sw(q.types.join(' '))}`;
        else if (res.length) h += `<p class="sg-h">Sugerencias</p><div class="sg-list">${res.slice(0, 4).map((x, i) => `<button type="button" class="sg-li" role="option" id="sgl-${this.dataset.sectionId}-${i}" data-h="${esc(x.p.handle)}" data-c="${esc(x.c)}"><i style="background:${esc((x.p.colors.find((c) => c.name === x.c) || {}).hex || '#ccc')}"></i><span>${esc(x.p.title)} · ${esc(x.c)}${q.size ? ' · talla ' + esc(q.size) : ''}</span></button>`).join('')}</div>`;
        h += `<a class="sg-site" href="${esc(this.cfg.searchUrl || '/search')}?q=${encodeURIComponent(v.trim())}">Buscar “${esc(v.trim())}” en toda la tienda →</a></div><div class="sg-col2">`;
        h += res.length ? `<p class="sg-h">Prendas</p><div class="sg-cards">${res.slice(0, 3).map((x, i) => mini(x.p, x.c, i)).join('')}</div><button type="button" class="sg-all" data-all>Ver ${res.length === 1 ? 'el resultado' : `los ${res.length} resultados`}</button>` : `<div class="sg-empty"><b>No encontramos “${esc(v)}” en esta sección</b><span>Busca por prenda, color, talla o precio.</span></div>`;
        open(h + '</div></div>');
      }
      items = $$('.sg-b2b,.sg-chip,.sg-li,.sg-card,.sg-all,.sg-site', box); act = -1;
    };
    const setAct = (i) => { items.forEach((x) => x.classList.remove('is-act')); act = i; if (i > -1 && items[i]) { items[i].classList.add('is-act'); if (items[i].id) inp.setAttribute('aria-activedescendant', items[i].id); items[i].scrollIntoView({ block: 'nearest' }); } };
    const goAll = () => { saveRecent(inp.value); close(); this.grid.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); track('search', { query: inp.value }); };
    inp.addEventListener('input', render); inp.addEventListener('focus', render);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (box.hidden) render(); setAct(Math.min(items.length - 1, act + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(Math.max(-1, act - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (act > -1 && items[act]) items[act].click(); else goAll(); }
      else if (e.key === 'Escape') { if (!box.hidden) close(); else { inp.value = ''; render(); close(); } }
    });
    box.addEventListener('mousedown', (e) => { if (!e.target.closest('a')) e.preventDefault(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.sg-b2b,.sg-li,.sg-card,.sg-all,.sg-chip,.sg-site'); if (!b) return;
      if (b.classList.contains('sg-chip')) { inp.value = b.dataset.qv; render(); inp.focus(); return; }
      if (b.hasAttribute('data-all')) { goAll(); return; }
      if (b.hasAttribute('data-b2b')) { track('request_quote', { source: 'search' }); close(); return; }
      if (b.classList.contains('sg-site')) { track('search', { query: inp.value, scope: 'site' }); return; }
      if (b.dataset.h) { saveRecent(inp.value); close(); this.openModal(this.byHandle.get(b.dataset.h), b.dataset.c, this.q && this.q.size); }
    });
    inp.addEventListener('blur', () => setTimeout(close, 150));
    clr.addEventListener('click', () => { inp.value = ''; render(); inp.focus(); });
    document.addEventListener('keydown', (e) => { const a = document.activeElement; if (e.key === '/' && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !(a && a.isContentEditable)) { e.preventDefault(); inp.focus(); } });
  }
}
define('sus2-shop', Sus2Shop);

/* ============================== HERO DE VIDEO ============================== */
class Sus2Hero extends HTMLElement {
  connectedCallback() {
    revealAll(this);
    const v = $('video', this); const t = $('[data-sus2-hero-title]', this);
    if (t) { splitWords(t); onLoaded(() => setTimeout(() => t.classList.add('is-in'), RM ? 0 : 120)); }
    $$('[data-sus2-hero-in]', this).forEach((el) => onLoaded(() => el.classList.add('is-in')));
    if (!v) return;
    let paused = false;
    if (RM) { v.removeAttribute('autoplay'); v.pause(); }
    else { const pr = v.play && v.play(); if (pr && pr.catch) pr.catch(() => {}); }
    v.addEventListener('click', () => { if (v.paused) { v.play(); paused = false; } else { v.pause(); paused = true; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else if (!paused && !RM) v.play().catch(() => {}); });
  }
}
define('sus2-hero', Sus2Hero);

/* ============================== HISTORIA: 5 PASOS ============================== */
class Sus2Story extends HTMLElement {
  connectedCallback() {
    revealAll(this);
    const st = $('[data-stage]', this); if (!st) return;
    const steps = $$('[data-step]', this); const badge = $('[data-badge]', this); const cap = $('[data-cap]', this);
    const total = steps.length;
    const set = (el) => { steps.forEach((s) => s.classList.toggle('on', s === el)); st.dataset.s = el.dataset.scene || el.dataset.step; if (badge) badge.textContent = `${String(steps.indexOf(el) + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`; if (cap) cap.textContent = el.dataset.cap || ''; this.cycle(st.dataset.s === '5'); };
    if (steps[0]) set(steps[0]);
    if (DESIGN || !('IntersectionObserver' in window)) { steps.forEach((s) => s.addEventListener('focusin', () => set(s))); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) set(e.target); }), { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => io.observe(s));
  }
  cycle(on) {
    clearInterval(this._t);
    const ph = $$('[data-cycle]', this); const chip = $('[data-chip]', this); if (!ph.length) return;
    let k = 0; const show = (i) => { ph.forEach((p, j) => p.classList.toggle('on', j === i)); if (chip) chip.innerHTML = `<i style="background:${esc(ph[i].dataset.hex || '#ccc')}"></i>${esc(ph[i].dataset.label || '')}`; };
    if (!on) return; show(0);
    if (!RM && ph.length > 1) this._t = setInterval(() => { k = (k + 1) % ph.length; show(k); }, 1800);
  }
  disconnectedCallback() { clearInterval(this._t); }
}
define('sus2-story', Sus2Story);

/* ============================== HISTORIA: AGUA ============================== */
export function waterFor(g, n) {
  const R = g.riego * n, W = g.humedo * n; const T = g.sumar ? R + W : R;
  return { R, W, T, jugs: T / 20, tanks: T / 1100, pool: (T / 2500000) * 100 };
}
class Sus2Water extends HTMLElement {
  connectedCallback() {
    revealAll(this);
    this.G = readJson($('[data-water-data]', this), []); if (!this.G.length) return;
    this.g = 0; this.seen = false;
    this.inp = $('[data-qty]', this); this.rng = $('[data-range]', this);
    $$('[data-garment]', this).forEach((b, i) => b.addEventListener('click', () => { this.g = i; $$('[data-garment]', this).forEach((x) => x.setAttribute('aria-pressed', x === b)); this.update(); }));
    $$('[data-step-qty]', this).forEach((b) => b.addEventListener('click', () => { this.inp.value = Math.max(1, (parseInt(this.inp.value, 10) || 1) + Number(b.dataset.stepQty)); this.rng.value = Math.min(+this.inp.value, +this.rng.max); this.update(); }));
    this.rng.addEventListener('input', () => { this.inp.value = this.rng.value; this.update(); });
    this.inp.addEventListener('input', () => { const n = parseInt(this.inp.value, 10); if (n > 0) { this.rng.value = Math.min(n, +this.rng.max); this.update(); } });
    this.inp.addEventListener('blur', () => { if (!(parseInt(this.inp.value, 10) > 0)) this.inp.value = 1; this.update(); });
    const rt = $('[data-route]', this);
    const go = () => { this.seen = true; if (rt) rt.classList.add('in'); this.update(); };
    if (RM || DESIGN || !('IntersectionObserver' in window)) go();
    else { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { go(); io.disconnect(); } }, { threshold: 0.2 }); io.observe(rt || this); }
    this.counters();
    this.update();
  }
  tween(el, to, fmt) {
    if (!el) return; const from = Number(el.dataset.v || 0); el.dataset.v = to;
    if (RM) { el.textContent = fmt(to); return; }
    let t0 = null; const f = (ts) => { if (!t0) t0 = ts; let k = Math.min(1, (ts - t0) / 700); k = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * k); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
  }
  update() {
    const g = this.G[this.g]; const n = Math.max(1, Math.min(100000, parseInt(this.inp.value, 10) || 1)); const w = waterFor(g, n);
    const F = (x) => Math.round(x).toLocaleString('es-MX');
    $$('[data-unit]', this).forEach((u) => { u.textContent = n === 1 ? g.singular : g.plural; });
    const L = $('[data-liters]', this); if (L) L.textContent = '≈' + F(w.T) + ' Lt';
    const J = $('[data-jugs]', this); if (J) J.textContent = w.jugs < 100 ? w.jugs.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : F(w.jugs);
    const box = $('[data-jug-grid]', this);
    if (box) {
      const f = Math.floor(w.jugs), cap = 60; let h = '';
      const jug = (p, i) => { const y = (38 - 30 * p).toFixed(1); return `<svg viewBox="0 0 26 40" style="--d:${i * 28}ms" aria-hidden="true"><rect x="9" y="1" width="8" height="4" fill="#B99979"/><path d="M8 5h10v4c5 1 7 4 7 9v18a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V18c0-5 2-8 7-9z" fill="rgba(134,184,174,.14)" stroke="#86B8AE" stroke-width="1.3"/><g class="wl"><rect x="2" y="${y}" width="22" height="${(39 - y).toFixed(1)}" rx="2" fill="#86B8AE" opacity=".85"/></g></svg>`; };
      for (let i = 0; i < Math.min(f, cap); i++) h += jug(1, i);
      if (f < cap && w.jugs - f > 0.01) h += jug(w.jugs - f, f);
      if (f > cap) h += `<span class="wc-more">+${(Math.ceil(w.jugs) - cap).toLocaleString('es-MX')} garrafones</span>`;
      box.innerHTML = h;
    }
    const note = $('[data-gnote]', this); if (note) note.textContent = g.nota || '';
    $$('[data-res-n]', this).forEach((res) => { res.textContent = `${n.toLocaleString('es-MX')} ${n === 1 ? g.singular : g.plural}`; });
    this.tween($('[data-res-total]', this), w.T, (v) => '≈' + F(v) + ' Lt');
    const sub = $('[data-res-sub]', this); if (sub) sub.textContent = g.sumar ? 'de agua evitada (riego + proceso húmedo)' : 'de agua de riego evitada';
    const a = $('[data-bar-a]', this), b = $('[data-bar-w]', this);
    const pa = g.sumar ? (w.R / w.T) * 100 : 100, pw = g.sumar ? (w.W / w.T) * 100 : 0;
    if (a) a.style.width = (this.seen ? pa : 0) + '%'; if (b) b.style.width = (this.seen ? pw : 0) + '%';
    const lr = $('[data-leg-r]', this); if (lr) lr.textContent = '≈' + F(w.R) + ' Lt';
    const lw = $('[data-leg-w]', this); if (lw) { lw.textContent = '≈' + F(w.W) + ' Lt'; lw.closest('[data-leg-w-row]').hidden = !g.sumar; }
    this.tween($('[data-eq-jugs]', this), w.jugs, (v) => F(v));
    this.tween($('[data-eq-tanks]', this), w.tanks, (v) => (v < 10 ? v.toLocaleString('es-MX', { maximumFractionDigits: 1 }) : F(v)));
    this.tween($('[data-eq-pool]', this), w.pool, (v) => (v >= 1 ? v.toLocaleString('es-MX', { maximumFractionDigits: 1 }) : v.toLocaleString('es-MX', { maximumFractionDigits: 3 })) + '%');
    const rn = $('[data-res-note]', this); if (rn) rn.textContent = g.nota || '';
  }
  counters() {
    if (RM || DESIGN || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((x) => {
      if (!x.isIntersecting) return; io.unobserve(x.target);
      $$('strong', x.target).forEach((el) => { const t = el.childNodes[0]; if (!t || t.nodeType !== 3) return; const m = t.textContent.match(/^(≈?)(\d+)(.*)$/); if (!m) return; const end = +m[2]; let t0 = null; const f = (ts) => { if (!t0) t0 = ts; let k = Math.min(1, (ts - t0) / 1100); k = 1 - Math.pow(1 - k, 3); t.textContent = m[1] + Math.round(end * k) + m[3]; if (k < 1) requestAnimationFrame(f); }; t.textContent = m[1] + '0' + m[3]; requestAnimationFrame(f); });
    }), { threshold: 0.4 });
    $$('[data-count-box]', this).forEach((b) => io.observe(b));
  }
}
define('sus2-water', Sus2Water);

/* ============================== CONTACTO ============================== */
class Sus2Contact extends HTMLElement {
  connectedCallback() {
    revealAll(this);
    const f = $('form', this); if (!f) return;
    const B = $('[data-dd-btn]', this), Mn = $('[data-dd-menu]', this), V = $('[data-dd-val]', this), I = $('[data-dd-input]', this);
    if (B && Mn) {
      const items = $$('[role="option"]', Mn); let act = 0;
      const mark = () => { items.forEach((x, i) => x.classList.toggle('act', i === act)); Mn.setAttribute('aria-activedescendant', items[act].id); };
      const open = () => { Mn.hidden = false; B.setAttribute('aria-expanded', 'true'); act = Math.max(0, items.findIndex((x) => x.getAttribute('aria-selected') === 'true')); mark(); Mn.focus(); };
      const close = (back) => { Mn.hidden = true; B.setAttribute('aria-expanded', 'false'); if (back) B.focus(); };
      const pick = (i) => { items.forEach((x, j) => x.setAttribute('aria-selected', j === i)); V.innerHTML = items[i].innerHTML; I.value = items[i].dataset.label; f.dataset.int = items[i].dataset.v; close(true); };
      B.addEventListener('click', () => (Mn.hidden ? open() : close()));
      Mn.addEventListener('click', (e) => { const li = e.target.closest('[role="option"]'); if (li) pick(items.indexOf(li)); });
      Mn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(items.length - 1, act + 1); mark(); } else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); mark(); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(act); } else if (e.key === 'Escape' || e.key === 'Tab') close(e.key === 'Escape'); });
      B.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
      document.addEventListener('click', (e) => { if (!Mn.hidden && !e.target.closest('[data-dd]')) close(); });
      const first = items.find((x) => x.getAttribute('aria-selected') === 'true') || items[0]; if (first) { f.dataset.int = first.dataset.v; I.value = first.dataset.label; }
    }
    f.addEventListener('input', (e) => { const w = e.target.closest('.ct-in'); if (w) w.classList.remove('bad'); });
    f.addEventListener('submit', (e) => {
      const err = []; $$('[data-required]', f).forEach((el) => { const v = el.value.trim(); const bad = !v || (el.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)); el.closest('.ct-in').classList.toggle('bad', bad); if (bad) err.push(el.dataset.required); });
      const pv = $('[data-privacy]', f); if (pv && !pv.checked) err.push('aceptar el aviso de privacidad');
      const box = $('[data-err]', f);
      if (err.length) { e.preventDefault(); box.hidden = false; box.textContent = 'Falta: ' + err.join(', ') + '.'; const first = $('.ct-in.bad input, .ct-in.bad textarea', f); if (first) first.focus(); return; }
      track('form_submit', { form: 'contacto', intent: I ? I.value : '' });
      if (f.dataset.int === 'mayoreo') track('request_quote', { source: 'form' });
    });
    $$('[data-ev]', this).forEach((a) => a.addEventListener('click', () => track(a.dataset.ev, { source: 'contact' })));
  }
}
define('sus2-contact', Sus2Contact);
