/* Thème clair / sombre / système, partagé par les propositions.
   La préférence vit dans localStorage ('solde-theme') ; « système » suit prefers-color-scheme en direct.
   Le script inline du <head> pose data-theme avant le premier rendu, pour éviter le flash. */
(() => {
  const KEY = 'solde-theme';
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const read = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch {} };
  const resolve = (pref) => (pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref);
  const listeners = [];

  function apply(pref) {
    const root = document.documentElement;
    root.dataset.theme = resolve(pref);
    root.dataset.themePref = pref;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--ground').trim() || '#000';
    document.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === pref)));
    listeners.forEach((f) => f(root.dataset.theme));
  }

  // Changement de thème : un disque qui s'ouvre depuis le bouton cliqué (View Transitions), sinon direct.
  function set(pref, origin) {
    write(pref);
    const before = document.documentElement.dataset.theme;
    if (resolve(pref) === before || reduce.matches || !document.startViewTransition || !origin) { apply(pref); return; }
    const r = origin.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(() => apply(pref));
    t.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' }
    ));
  }

  // Le contrôle segmenté : trois boutons, l'icône et le libellé.
  const ICON = { light: 'sun', dark: 'moon', system: 'monitor' };
  const LABEL = { light: 'Clair', dark: 'Sombre', system: 'Système' };
  function control({ labels = true } = {}) {
    return `<div class="theme-switch" role="group" aria-label="Thème">${['light', 'dark', 'system'].map((v) =>
      `<button type="button" data-theme-choice="${v}" aria-pressed="false" ${labels ? '' : `aria-label="${LABEL[v]}" title="${LABEL[v]}"`}>${Solde.icon(ICON[v])}${labels ? `<span>${LABEL[v]}</span>` : ''}</button>`).join('')}</div>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-theme-choice]'); if (b) set(b.dataset.themeChoice, b); });
  mq.addEventListener('change', () => { if (read() === 'system') apply('system'); });

  // Un nombre qui glisse vers sa nouvelle valeur quand on change de mois ou qu'on simule une dépense.
  function tween(el, to, format, ms = 420) {
    const from = Number(el.dataset.value ?? to);
    el.dataset.value = to;
    if (reduce.matches || from === to) { el.innerHTML = format(to); return; }
    const t0 = performance.now(), ease = (t) => 1 - Math.pow(1 - t, 3);
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      el.innerHTML = format(t === 1 ? to : from + (to - from) * ease(t));
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  window.Theme = { read, set, apply, control, tween, onChange: (f) => listeners.push(f), reduce };
  document.addEventListener('DOMContentLoaded', () => apply(read()));
})();
