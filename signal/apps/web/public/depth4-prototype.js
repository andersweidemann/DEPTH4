/* static prototype — not wired to the Next /api feed. Same L1–4 + depth clock idea as the app. */
// eslint-disable-next-line no-unused-expressions
(() => {
  const FX = { SEK: 1, USD: 10.9, EUR: 11.7 };
  let holdings = [
    {
      tick: "FCX",
      name: "Freeport-McMoRan",
      shares: 120,
      cost: 198.87,
      cur: "SEK",
      action: "Hold",
      ifA: 2100,
      ifC: 4800,
      thesis: "Copper supported if Oman channel stabilises risk tone.",
    },
    {
      tick: "VLO",
      name: "Valero Energy",
      shares: 90,
      cost: 201.33,
      cur: "SEK",
      action: "Watch",
      ifA: 900,
      ifC: -1200,
      thesis: "Refining margins intact if crude is jumpy but not disorderly.",
    },
  ];
  const EDGE = [
    { tick: "FCX", score: 82 },
    { tick: "VLO", score: 74 },
    { tick: "XLE", score: 68 },
    { tick: "NTR", score: 45 },
    { tick: "COP", score: 55 },
    { tick: "DAL", score: 12 },
  ];
  const NEWS = [
    {
      id: "n1",
      src: "Al Jazeera",
      srcClass: "src-alj",
      age: "4m ago",
      title: "Tehran rejects talks under siege — Araghchi confirmed in Oman",
      tags: ["hot", "energy", "impact"],
      tagLabels: ["🔴 Developing", "⛽ Oil", "Affects: FCX·VLO"],
      depth: {
        l1: {
          event: "Tehran rejects talks under siege",
          why: 'Iran refuses to negotiate while under what it calls an active "US naval blockade" and with Strait of Hormuz incidents still unresolved.',
          next: "Araghchi moves to Muscat for indirect channel with Oman FM",
          signal:
            "This is a tactical retreat into the back channel — not a breakdown. Iran has used Oman this way in every crisis since 2013.",
        },
        l2: [
          {
            step: "Step 1",
            time: "Today–48h",
            desc: "Gulf focus narrows to Muscat. Oil stays bid. No closure signal yet, but no escalation spike either.",
            watch: "Watch: Oman FM social media, Brent front-month",
          },
          {
            step: "Step 2",
            time: "2–5 days",
            desc: "If Oman posts a readout, risk tone softens. Diesel in Europe stays firm — supply uncertainty persists.",
            watch: "Watch: Diesel/Brent spread, European gas prices",
          },
          {
            step: "Step 3",
            time: "1–2 wks",
            desc: "If talks stay alive, fertilizer and ag-chem names start trading the margin story.",
            watch: "Watch: NTR, CF — ammonia pricing vs gas",
          },
          {
            step: "Step 4",
            time: "1 month",
            desc: "Prolonged uncertainty reprices energy vs travel. XLE outperforms airline ETFs.",
            watch: "Watch: XLE vs JETS ratio",
          },
        ],
        l3: [
          {
            label: "Scenario A",
            sub: "Oman readout → quiet restart",
            prob: 45,
            fill: "gold",
            mkt: "Brent +$4–6 · S&P −0.8% · DXY +0.3%",
            win: ["FCX", "VLO", "XLE"],
            lose: ["DAL", "BKNG"],
            watch: "Oman FM tweets joint readout with Araghchi (even vague).",
          },
          {
            label: "Scenario B",
            sub: "Channel silent >48h; energy premium holds",
            prob: 35,
            fill: "flat",
            mkt: "Brent flat/+2% · S&P flat · USD mixed",
            win: ["XLE", "COP"],
            lose: ["DAL"],
            watch: "Silence >48h from Muscat → default B until inventories.",
          },
          {
            label: "Scenario C",
            sub: "Escalation — strait incidents confirmed",
            prob: 20,
            fill: "danger",
            mkt: "Brent +$6–8 · S&P −1.2% · DXY +0.6%",
            win: ["LMT", "NOC", "ITA"],
            lose: ["AAL", "CCL"],
            watch: "Gulf headlines referencing facility damage or tanker seizure.",
          },
        ],
        clock: {
          urgency: 78,
          horizon: "48–72h",
          recs: [
            { tick: "FCX", act: "buy", edge: 82, thesis: "First-order copper bid on soft risk landing." },
            { tick: "VLO", act: "buy", edge: 74, thesis: "Refining margins intact; products stay firm." },
            { tick: "XLE", act: "watch", edge: 68, thesis: "Broad energy hedge — works in B and C." },
            { tick: "DAL", act: "avoid", edge: 12, thesis: "Both A and C hit airlines. Only clean resolution is bullish." },
          ],
        },
      },
    },
    {
      id: "n2",
      src: "Reuters",
      srcClass: "src-reuters",
      age: "22m ago",
      title: "Trump cancels Witkoff trip to Islamabad after Iran snubs direct meeting",
      tags: ["hot", "energy"],
      tagLabels: ["🔴 Breaking", "⛽ Oil"],
      depth: {
        l1: {
          event: "Trump cancels Witkoff trip to Islamabad",
          why: "Iran refused direct talks in Pakistan, rendering the visit pointless. Trump signals displeasure without escalation order.",
          next: "White House reviewing options — military posture unchanged for now.",
          signal: "Cancellation is punitive signalling, not a ceasefire collapse. Witkoff stays in the region.",
        },
        l2: [
          {
            step: "Step 1",
            time: "Hours",
            desc: "Oil gets a brief risk premium. Equities slide slightly — mostly tech.",
            watch: "Watch: Brent next 3 hours, S&P futures",
          },
          {
            step: "Step 2",
            time: "1–3 days",
            desc: "If Witkoff re-engages via Oman, oil premium fades fast. If silence continues, premium sticks.",
            watch: "Watch: State Dept readout, Witkoff whereabouts",
          },
          {
            step: "Step 3",
            time: "1 wk",
            desc: "Market re-rates probability of Scenario C upward if no Oman signal.",
            watch: "Watch: CDS on Mideast names, Brent curve steepness",
          },
        ],
        l3: [
          {
            label: "Scenario A",
            sub: "Witkoff re-routes via Oman",
            prob: 40,
            fill: "gold",
            mkt: "Brent +$3–5 · Equities recover",
            win: ["FCX", "VLO", "XLE"],
            lose: ["AAL"],
            watch: "Any confirmation Witkoff meets Oman FM.",
          },
          {
            label: "Scenario B",
            sub: "Standoff continues; slow grind",
            prob: 40,
            fill: "flat",
            mkt: "Brent +$1–2 · USD firm",
            win: ["XLE", "COP"],
            lose: ["DAL"],
            watch: "No movement from either capital for 72h.",
          },
          {
            label: "Scenario C",
            sub: "Public escalation rhetoric heats",
            prob: 20,
            fill: "danger",
            mkt: "Brent +$7+ · S&P −1.5%",
            win: ["LMT", "NOC"],
            lose: ["AAL", "CCL", "DAL"],
            watch: "Trump tweets military language or fleet moves reported.",
          },
        ],
        clock: {
          urgency: 65,
          horizon: "24–48h",
          recs: [
            { tick: "XLE", act: "buy", edge: 70, thesis: "Energy hedge — works across B and C." },
            { tick: "VLO", act: "watch", edge: 65, thesis: "Hold margin story; watch crude direction." },
            { tick: "LMT", act: "watch", edge: 38, thesis: "Tail hedge only. Buy small if C probability rises." },
            { tick: "DAL", act: "avoid", edge: 10, thesis: "Jet fuel risk in any scenario that doesn't resolve cleanly." },
          ],
        },
      },
    },
  ];
  function fmt(n) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  }
  function fmtS(n) {
    return (n >= 0 ? "+" : "−") + fmt(Math.abs(n));
  }
  function edgeStyle(score) {
    const a = 0.1 + (score / 100) * 0.9;
    const l = 36 + (score / 100) * 20;
    const bar = `hsl(38,${38 + score * 0.55}%,${l}%)`;
    const col = `hsla(38,80%,${l + 8}%,${a})`;
    const glow = score > 65 ? `0 0 5px hsla(38,90%,55%,${(score - 65) / 120})` : "none";
    return { bar, col, glow };
  }
  function renderPortfolio() {
    let total = 0;
    const pl = document.getElementById("posList");
    const tb = document.getElementById("l4table");
    if (!pl || !tb) return;
    pl.innerHTML = "";
    tb.innerHTML = "";
    holdings.forEach((h) => {
      const v = h.shares * h.cost * (FX[h.cur] || 1);
      total += v;
      pl.innerHTML += `<div class="pos" role="button" tabindex="0"><div class="pos-l"><div class="tick">${h.tick}</div><div class="nm">${h.name}</div></div><div class="val">${fmt(v)}<br><span style="font-size:9px">${h.cur}</span></div></div>`;
      tb.innerHTML += `<tr><td>${h.tick}</td><td>${fmt(v)}</td><td class="${h.ifA >= 0 ? "up" : "down"}">${fmtS(h.ifA)}</td><td class="${h.ifC >= 0 ? "up" : "down"}">${fmtS(h.ifC)}</td><td><span class="abadge ${h.action === "Hold" ? "hold" : "watch"}">${h.action}</span></td></tr>`;
    });
    const pt = document.getElementById("ptotal");
    if (pt) pt.textContent = fmt(total);
  }
  function renderEdge() {
    const el = document.getElementById("edgeList");
    if (!el) return;
    el.innerHTML = EDGE.map((e) => {
      const s = edgeStyle(e.score);
      return `<div class="edge-row">
      <div class="etick" style="color:${s.col};text-shadow:${s.glow}">${e.tick}</div>
      <div class="ebar-wrap" aria-hidden="true"><div class="ebar-fill" style="width:${e.score}%;background:${s.bar};box-shadow:${s.glow}"></div></div>
      <div class="escore" style="color:${s.col}">${e.score}</div>
    </div>`;
    }).join("");
  }
  function buildDepthClock(clock) {
    const r = 56;
    const cx = 70;
    const cy = 70;
    const stroke = 8;
    const circ = 2 * Math.PI * r;
    const pct = clock.urgency / 100;
    const clr = clock.urgency > 70 ? "var(--red)" : clock.urgency > 45 ? "var(--gold)" : "var(--green)";
    const recs = clock.recs
      .map((rec) => {
        const s = edgeStyle(rec.edge);
        return `<div class="dc-rec">
      <div class="dc-tick" style="color:${s.col};text-shadow:${s.glow}">${rec.tick}</div>
      <span class="dc-act ${rec.act}">${rec.act.toUpperCase()}</span>
      <div class="dc-thesis">${rec.thesis}</div>
      <div class="dc-edge" style="color:${s.col}">${rec.edge}</div>
    </div>`;
      })
      .join("");
    return `<div class="dc-wrap">
    <svg class="dc-svg" viewBox="0 0 140 140" aria-label="Urgency ${clock.urgency} out of 100">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--s4)" stroke-width="${stroke}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${clr}" stroke-width="${stroke}"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset 1s ease"/>
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" dominant-baseline="middle"
        font-family="Cabinet Grotesk,sans-serif" font-size="22" font-weight="700" fill="${clr}">${clock.urgency}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" dominant-baseline="middle"
        font-family="Satoshi,sans-serif" font-size="9" fill="var(--muted)">URGENCY</text>
    </svg>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:-6px">Horizon: <strong style="color:var(--text)">${clock.horizon}</strong></div>
    <div class="dc-recs">${recs}</div>
  </div>`;
  }
  function buildDepthMap(d) {
    const l1 = `<div class="dm-section">
    <div class="dm-block">
      <div class="dm-kicker">Event</div><div>${d.l1.event}</div>
    </div>
    <div class="dm-block">
      <div class="dm-kicker">Why</div><div style="font-size:12px">${d.l1.why}</div>
    </div>
    <div class="dm-block">
      <div class="dm-kicker">Next</div><div style="font-size:12px">${d.l1.next}</div>
    </div>
    <div class="dm-signal">${d.l1.signal}</div>
  </div>`;
    const l2 = `<div class="dm-section">${d.l2
      .map(
        (t) => `
    <div class="tl-item">
      <div class="tl-step">${t.step}<span class="tl-time">${t.time}</span></div>
      <div><div class="tl-desc">${t.desc}</div><div class="tl-watch">↳ ${t.watch}</div></div>
    </div>`,
      )
      .join("")}</div>`;
    const l3 = `<div class="sc-tree">${d.l3
      .map(
        (s) => `
    <div class="sc-node ${s.fill === "danger" ? "tail" : ""}">
      <div class="sc-nh">
        <div><div class="sc-lbl ${s.fill === "danger" ? "tail" : ""}">${s.label}</div><div class="sc-sub">${s.sub}</div></div>
        <div class="sc-prob">${s.prob}%</div>
      </div>
      <div class="sc-bar" aria-hidden="true"><div class="sc-fill ${s.fill}" style="width:${s.prob}%"></div></div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:6px;font-variant-numeric:tabular-nums">${s.mkt}</div>
      <div class="sc-chips">
        ${s.win.map((x) => `<span class="sc-chip win">${x}</span>`).join("")}
        ${s.lose.map((t) => `<span class="sc-chip lose">${t}</span>`).join("")}
      </div>
      <div class="sc-watch ${s.fill === "danger" ? "danger" : ""}">${s.watch}</div>
    </div>`,
      )
      .join("")}</div>`;
    const clock = buildDepthClock(d.clock);
    return `
    <div class="dm-tabs" role="tablist" aria-label="Depth layers">
      <button type="button" class="dm-tab active" data-tab="l1" role="tab" aria-selected="true">Layer 1 — Event</button>
      <button type="button" class="dm-tab" data-tab="l2" role="tab" aria-selected="false">Layer 2 — Story</button>
      <button type="button" class="dm-tab" data-tab="l3" role="tab" aria-selected="false">Layer 3 — Scenarios</button>
      <button type="button" class="dm-tab" data-tab="clock" role="tab" aria-selected="false">Depth Clock</button>
    </div>
    <div class="dm-panel active" data-panel="l1" role="tabpanel">${l1}</div>
    <div class="dm-panel" data-panel="l2" role="tabpanel">${l2}</div>
    <div class="dm-panel" data-panel="l3" role="tabpanel">${l3}</div>
    <div class="dm-panel" data-panel="clock" role="tabpanel">${clock}</div>`;
  }
  function renderFeed() {
    const feed = document.getElementById("newsFeed");
    if (!feed) return;
    feed.innerHTML = NEWS.map((n) => {
      const tags = n.tags.map((t, i) => `<span class="btag ${t}">${n.tagLabels[i]}</span>`).join("");
      return `<div class="bubble" data-id="${n.id}">
      <div class="bubble-top">
        <span class="bubble-src ${n.srcClass}">${n.src}</span>
        <div class="bubble-content">
          <div class="bubble-title">${n.title}</div>
          <div class="bubble-meta"><span>${n.age}</span></div>
        </div>
        <span class="caret-hint" aria-hidden="true">▼</span>
      </div>
      <div class="bubble-tags">${tags}</div>
      <div class="depth-map" id="dm-${n.id}">${buildDepthMap(n.depth)}</div>
    </div>`;
    }).join("");
    feed.querySelectorAll(".bubble").forEach((bubble) => {
      bubble.addEventListener("click", (e) => {
        if (e.target.closest && e.target.closest(".dm-tab")) return;
        const wasActive = bubble.classList.contains("active");
        feed.querySelectorAll(".bubble").forEach((b) => b.classList.remove("active"));
        if (!wasActive) bubble.classList.add("active");
        feed.querySelectorAll(".bubble .dm-tab").forEach((t) => t.setAttribute("aria-selected", "false"));
        const activeB = feed.querySelector(".bubble.active .dm-tab.active");
        if (activeB) activeB.setAttribute("aria-selected", "true");
      });
    });
    feed.querySelectorAll(".dm-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        const dm = tab.closest(".depth-map");
        if (!dm) return;
        const key = tab.getAttribute("data-tab");
        dm.querySelectorAll(".dm-tab").forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        dm.querySelectorAll(".dm-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        const panel = dm.querySelector(`[data-panel="${key}"]`);
        if (panel) panel.classList.add("active");
      });
    });
  }
  function updateTimestamp() {
    const now = new Date();
    const el = document.getElementById("lastUpdated");
    if (el) el.textContent = "Updated " + now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function openModal() {
    const b = document.getElementById("backdrop");
    if (b) b.classList.add("open");
  }
  function closeModal() {
    const b = document.getElementById("backdrop");
    if (b) b.classList.remove("open");
    const err = document.getElementById("formErr");
    if (err) err.style.display = "none";
  }
  document.getElementById("openModal")?.addEventListener("click", openModal);
  document.getElementById("openModalSide")?.addEventListener("click", openModal);
  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  document.getElementById("cancelBtn")?.addEventListener("click", closeModal);
  document.getElementById("backdrop")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "backdrop") closeModal();
  });
  document.getElementById("saveBtn")?.addEventListener("click", () => {
    const tick = document.getElementById("fTick")?.value.trim().toUpperCase() || "";
    const name = document.getElementById("fName")?.value.trim() || "";
    const shares = parseFloat(document.getElementById("fShares")?.value || "");
    const cost = parseFloat(document.getElementById("fCost")?.value || "");
    const cur = document.getElementById("fCur")?.value || "SEK";
    const action = document.getElementById("fAct")?.value || "Hold";
    const ifA = parseFloat(document.getElementById("fIfA")?.value || "0");
    const ifC = parseFloat(document.getElementById("fIfC")?.value || "0");
    const thesis = document.getElementById("fThesis")?.value.trim() || "";
    const err = document.getElementById("formErr");
    if (!tick || !name || isNaN(shares) || isNaN(cost) || shares <= 0 || cost <= 0) {
      if (err) err.style.display = "block";
      return;
    }
    holdings.push({ tick, name, shares, cost, cur, action, ifA, ifC, thesis });
    renderPortfolio();
    for (const id of ["fTick", "fName", "fShares", "fCost", "fIfA", "fIfC", "fThesis"]) {
      const el = document.getElementById(id);
      if (el) el.value = "";
    }
    closeModal();
  });
  renderFeed();
  renderPortfolio();
  renderEdge();
  updateTimestamp();
  const first = document.querySelector("#newsFeed .bubble");
  if (first) first.classList.add("active");
})();
