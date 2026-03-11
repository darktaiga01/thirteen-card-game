/* ═══════════════════════════════════════════════════════════════
   effects.js  —  Digital Card Arena VFX
   All functions respect prefers-reduced-motion.
═══════════════════════════════════════════════════════════════ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Screen Shake ────────────────────────────────────────────────────────────
function screenShake(intensity = 'medium') {
    if (reduceMotion) return;
    const cls = `shake-${intensity}`;
    document.body.classList.remove('shake-light', 'shake-medium', 'shake-heavy');
    // Force reflow so re-adding works
    void document.body.offsetWidth;
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), 500);
}

// ─── Chop Flash ──────────────────────────────────────────────────────────────
function flashChop() {
    if (reduceMotion) return;
    const el = document.getElementById('vfx-chop');
    if (!el) return;
    el.classList.remove('visible');
    void el.offsetWidth;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 600);
}

// ─── Confetti Burst ──────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#4ade80', '#facc15', '#f87171', '#60a5fa', '#c084fc', '#fb923c'];

function confettiBurst(count = 60) {
    if (reduceMotion) return;
    const layer = document.getElementById('vfx-layer');
    if (!layer) return;

    for (let i = 0; i < count; i++) {
        const dot = document.createElement('div');
        dot.className = 'confetti-dot';
        dot.style.cssText = `
      left: ${Math.random() * 100}vw;
      background: ${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]};
      width: ${4 + Math.random() * 6}px;
      height: ${4 + Math.random() * 6}px;
      animation-duration: ${0.8 + Math.random() * 1.2}s;
      animation-delay: ${Math.random() * 0.4}s;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;
        layer.appendChild(dot);
        dot.addEventListener('animationend', () => dot.remove());
    }
}

// ─── Card Fly-In (table play animation) ───────────────────────────────────────
function cardFlyIn(cardEls) {
    if (reduceMotion) return;
    cardEls.forEach((el, i) => {
        el.style.animationDelay = `${i * 40}ms`;
        el.classList.add('card-fly-in');
        el.addEventListener('animationend', () => el.classList.remove('card-fly-in'), { once: true });
    });
}

// ─── On-Fire Streak Badge ─────────────────────────────────────────────────────
let _fireActive = false;
function triggerOnFire(active) {
    const badge = document.getElementById('on-fire-badge');
    if (!badge) return;
    if (active && !_fireActive) {
        _fireActive = true;
        badge.classList.remove('hidden');
        badge.classList.add('fire-enter');
        setTimeout(() => badge.classList.remove('fire-enter'), 600);
    } else if (!active) {
        _fireActive = false;
        badge.classList.add('hidden');
    }
}

// ─── Toast (wrapper used by game.js) ────────────────────────────────────────
function showToastFX(msg, type = 'info') {
    const toasts = document.getElementById('toasts');
    if (!toasts) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    toasts.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

// ─── Exports (used by game.js via global scope) ───────────────────────────────
window.FX = { screenShake, flashChop, confettiBurst, cardFlyIn, triggerOnFire, showToastFX };
