/* Behaviour for safalkumarshrestha.com.np. The page is complete without this file.
   - Agent field: an ε-greedy agent hunting goals on the masthead grid (canvas).
   - Scroll reveals: adds .reveal to items and .in once each is on screen (CSS animates).
   - "Pause / Play motion" control (WCAG 2.2.2), remembered per browser.
   - Nav highlights the section in view; the mobile menu closes when a link is chosen.
   - Copy-email button and a live Kathmandu clock in the footer.
   html.motion is set by the inline script in <head> (off by default under
   prefers-reduced-motion); while it is off the field shows one still frame. */
(() => {
  const root = document.documentElement;
  const field = agentField(document.querySelector('.field'));
  const toggles = document.querySelectorAll('.motion-toggle');

  const apply = (on) => {
    root.classList.toggle('motion', on);
    field.run(on);
    toggles.forEach((t) => { t.textContent = on ? 'Pause motion' : 'Play motion'; });
  };
  toggles.forEach((t) => {
    t.hidden = false;
    t.addEventListener('click', () => {
      const on = !root.classList.contains('motion');
      try { localStorage.setItem('motion', on ? 'on' : 'off'); } catch { /* storage blocked: session-only */ }
      apply(on);
    });
  });
  apply(root.classList.contains('motion'));

  // Nav: mark the link for the section in the middle of the viewport
  const navLinks = new Map(
    [...document.querySelectorAll('.nav a[href^="#"]')].map((a) => [a.hash.slice(1), a])
  );
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const link = navLinks.get(e.target.id);
      if (!e.isIntersecting || !link) continue;
      navLinks.forEach((a) => a.removeAttribute('aria-current'));
      link.setAttribute('aria-current', 'location');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));

  // Mobile menu (native popover): close it once a destination is picked
  const menu = document.getElementById('menu');
  if (menu && menu.hidePopover) {
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.hidePopover(); });
  }

  // Copy email
  const status = document.querySelector('.copy-status');
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    if (!navigator.clipboard) return;
    btn.hidden = false;
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied';
        if (status) status.textContent = `${btn.dataset.copy} copied to your clipboard.`;
      } catch {
        if (status) status.textContent = 'Couldn’t copy automatically — select the address above.';
      }
      setTimeout(() => { btn.textContent = label; }, 2000);
    });
  });

  // Local time in Kathmandu
  const clock = document.querySelector('.clock');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
    const tick = () => { clock.textContent = `${fmt.format(new Date())} NPT`; };
    tick();
    setInterval(tick, 30000);
  }

  // Scroll reveals: each element animates once; items entering together stagger 70ms apart.
  // Runs even while motion is off so already-seen items don't re-hide when it is switched on.
  const io = new IntersectionObserver((entries) => {
    let n = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.setProperty('--d', `${Math.min(n++, 5) * 70}ms`);
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('.section').forEach((el) => io.observe(el));
  document.querySelectorAll(
    '.case, .mini, .rows > li, .timeline > li, .skill-groups > div, .research > li, .about .portrait, ' +
    '.about-text, .trek-intro > *, .bento figure, .contact-kicker, .contact-lead, .contact .cta'
  ).forEach((el) => { el.classList.add('reveal'); io.observe(el); });

  /* ε-greedy agent on a grid. Each step it moves to the neighbour closest to the goal,
     except with probability EPSILON it explores at random. Reaching a goal sends a ripple
     through the grid and spawns a new goal. A mouse pointer becomes the goal; a tap sets it. */
  function agentField(canvas) {
    if (!canvas || !canvas.getContext) return { run() {} };
    const ctx = canvas.getContext('2d');
    const host = canvas.parentElement;
    const STEP_MS = 120;   // one grid move
    const EPSILON = 0.15;  // exploration rate
    const TRAIL = 40;      // cells of trail kept
    const RIPPLE_MS = 1400;

    let W = 0, H = 0, S = 30, cols = 0, rows = 0, ox = 0, oy = 0;
    let colors = {};
    let agent = null, goal = null, hoverGoal = null;
    let trail = [], ripples = [];
    let wantRun = false, onScreen = true, raf = 0, last = 0, acc = 0;

    const px = (c) => ox + c * S;
    const py = (r) => oy + r * S;
    const clampCell = (c, r) => ({
      c: Math.max(0, Math.min(cols - 1, c)),
      r: Math.max(0, Math.min(rows - 1, r)),
    });

    function readColors() {
      const cs = getComputedStyle(root);
      const v = (name) => cs.getPropertyValue(name).trim();
      colors = { dot: v('--line'), ink: v('--fg'), red: v('--red') };
    }

    function newGoal() {
      const far = Math.floor((cols + rows) / 3);
      for (let i = 0; i < 30; i++) {
        const g = { c: (Math.random() * cols) | 0, r: (Math.random() * rows) | 0 };
        if (Math.abs(g.c - agent.c) + Math.abs(g.r - agent.r) >= far) { goal = g; return; }
      }
      goal = { c: cols - 1 - agent.c, r: rows - 1 - agent.r };
    }

    function step() {
      const g = hoverGoal || goal;
      agent.pc = agent.c;
      agent.pr = agent.r;
      const moves = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dc, dr]) => ({ c: agent.c + dc, r: agent.r + dr }))
        .filter((m) => m.c >= 0 && m.r >= 0 && m.c < cols && m.r < rows);
      const dist = (m) => Math.abs(m.c - g.c) + Math.abs(m.r - g.r);
      let options = moves;
      if (Math.random() >= EPSILON) {
        const best = Math.min(...moves.map(dist));
        options = moves.filter((m) => dist(m) === best);
      }
      const next = options[(Math.random() * options.length) | 0];
      agent.c = next.c;
      agent.r = next.r;
      trail.push({ c: next.c, r: next.r });
      if (trail.length > TRAIL) trail.shift();
      if (next.c === g.c && next.r === g.r) {
        if (!hoverGoal) { ripples.push({ c: g.c, r: g.r, t: 0 }); newGoal(); }
        else if (!ripples.length) ripples.push({ c: g.c, r: g.r, t: 0 });
      }
    }

    function layout() {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = W < 640 ? 22 : 30;
      cols = Math.max(3, Math.floor(W / S));
      rows = Math.max(3, Math.floor(H / S));
      ox = (W - (cols - 1) * S) / 2;
      oy = (H - (rows - 1) * S) / 2;

      const first = !agent;
      agent = { ...clampCell(agent ? agent.c : 1, agent ? agent.r : rows >> 1) };
      agent.pc = agent.c;
      agent.pr = agent.r;
      trail = trail.filter((p) => p.c < cols && p.r < rows);
      if (!goal || goal.c >= cols || goal.r >= rows) newGoal();
      if (first) for (let i = 0; i < 24; i++) step(); // start with a path already drawn
      draw(1);
    }

    function draw(t) {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      const e = t * t * (3 - 2 * t);
      const ax = px(agent.pc + (agent.c - agent.pc) * e);
      const ay = py(agent.pr + (agent.r - agent.pr) * e);
      const reach = S * 3.5;

      // Grid: squares swell near the agent and along ripple fronts
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = px(c), y = py(r);
          let k = Math.max(0, 1 - Math.hypot(x - ax, y - ay) / reach);
          for (const rp of ripples) {
            const front = rp.t * S * 10;
            const d = Math.hypot(x - px(rp.c), y - py(rp.r));
            k = Math.max(k, (1 - rp.t) * Math.max(0, 1 - Math.abs(d - front) / S));
          }
          const s = 2 + k * 4;
          ctx.globalAlpha = k > 0.05 ? 0.25 + k * 0.75 : 1;
          ctx.fillStyle = k > 0.05 ? colors.ink : colors.dot;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }

      // Trail, fading from tail to head; last point follows the agent mid-move
      ctx.strokeStyle = colors.red;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const pts = trail.map((p) => [px(p.c), py(p.r)]);
      if (pts.length) pts[pts.length - 1] = [ax, ay];
      for (let i = 1; i < pts.length; i++) {
        ctx.globalAlpha = i / pts.length;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }

      // Ripple rings
      ctx.lineWidth = 1.5;
      for (const rp of ripples) {
        ctx.globalAlpha = (1 - rp.t) * 0.5;
        ctx.beginPath();
        ctx.arc(px(rp.c), py(rp.r), rp.t * S * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Goal: solid square, or an outline when the pointer is steering
      const g = hoverGoal || goal;
      const gs = S * 0.5;
      if (hoverGoal) {
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(px(g.c) - gs / 2, py(g.r) - gs / 2, gs, gs);
      } else {
        ctx.fillStyle = colors.ink;
        ctx.fillRect(px(g.c) - gs / 2, py(g.r) - gs / 2, gs, gs);
      }

      // Agent
      ctx.fillStyle = colors.red;
      ctx.beginPath();
      ctx.arc(ax, ay, S * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 100);
      last = now;
      acc += dt;
      while (acc >= STEP_MS) { acc -= STEP_MS; step(); }
      for (const rp of ripples) rp.t += dt / RIPPLE_MS;
      ripples = ripples.filter((rp) => rp.t < 1);
      draw(acc / STEP_MS);
    }

    function sync() {
      const go = wantRun && onScreen && !document.hidden && W > 0;
      if (go && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    function cellAt(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
      return clampCell(Math.round((x - ox) / S), Math.round((y - oy) / S));
    }

    host.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && wantRun) hoverGoal = cellAt(e);
    });
    host.addEventListener('pointerleave', () => {
      if (hoverGoal) { hoverGoal = null; newGoal(); }
    });
    host.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !wantRun) return;
      const c = cellAt(e);
      if (c) goal = c;
    });

    readColors();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(1); });
    new ResizeObserver(() => { layout(); sync(); }).observe(canvas);
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(canvas);
    document.addEventListener('visibilitychange', sync);

    return { run(on) { wantRun = on; sync(); } };
  }
})();
