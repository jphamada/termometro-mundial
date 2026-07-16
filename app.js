// ============================================================================
// Termómetro de la Final — lógica de la app (Firebase v9+ modular)
// ============================================================================

import { FIREBASE_CONFIG } from "./firebase-config.js?v=5";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ----------------------------------------------------------------------------
// 1) FECHAS CLAVE — CONSTANTES EDITABLES
//    Todas fijadas en hora de Argentina (UTC-3, sin horario de verano),
//    así el cálculo es correcto sin importar la zona horaria del dispositivo.
// ----------------------------------------------------------------------------

const PREVIA_START = new Date("2026-07-15T00:00:00-03:00");
const PARTIDO_START = new Date("2026-07-19T16:00:00-03:00");
const PARTIDO_END = new Date("2026-07-19T18:30:00-03:00"); // fin estimado / arranque post-partido
const HORAS_CIERRE_POST_PARTIDO = 24; // la votación cierra del todo X hs después del post-partido
const CIERRE_VOTACION = new Date(
  PARTIDO_END.getTime() + HORAS_CIERRE_POST_PARTIDO * 60 * 60 * 1000
);

// ----------------------------------------------------------------------------
// 2) ESCALA DE EMOCIONES — fija, no editable por el usuario final
// ----------------------------------------------------------------------------

const EMOTIONS = [
  { id: "indiferencia", label: "Indiferencia", emoji: "😐", color: "#9E9E9E", value: 1 },
  { id: "nervios", label: "Nervios", emoji: "😬", color: "#FFC107", value: 2 },
  { id: "ilusion", label: "Ilusión", emoji: "🙂", color: "#4FC3F7", value: 3 },
  { id: "alegria", label: "Alegría", emoji: "😃", color: "#66BB6A", value: 4 },
  { id: "euforia", label: "Euforia", emoji: "🤩", color: "#FF9800", value: 5 },
  { id: "algarabia", label: "Algarabía total", emoji: "🎉", color: "#E53935", value: 6 },
];

const MOMENT_INFO = {
  previa: { badge: "🕐 Previa", cls: "is-previa", text: "Todavía falta para el partido." },
  en_vivo: { badge: "🔴 EN VIVO", cls: "is-live", text: "¡El partido se está jugando ahora!" },
  post_partido: { badge: "🏆 Post-partido", cls: "is-post", text: "El partido ya terminó." },
};

// ----------------------------------------------------------------------------
// 3) FIREBASE INIT
// ----------------------------------------------------------------------------

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const votosRef = collection(db, "votos");

// ----------------------------------------------------------------------------
// 4) ESTADO DEL MOMENTO (calculado según la hora real del dispositivo)
// ----------------------------------------------------------------------------

function computeStatus(now) {
  if (now < PREVIA_START) {
    return { active: null, defaultView: "previa", reason: "before" };
  }
  if (now < PARTIDO_START) {
    return { active: "previa", defaultView: "previa", reason: "ok" };
  }
  if (now < PARTIDO_END) {
    return { active: "en_vivo", defaultView: "en_vivo", reason: "ok" };
  }
  if (now < CIERRE_VOTACION) {
    return { active: "post_partido", defaultView: "post_partido", reason: "ok" };
  }
  return { active: null, defaultView: "post_partido", reason: "closed" };
}

let currentStatus = computeStatus(new Date());
let viewMoment = currentStatus.defaultView;
let userPinnedTab = false;
let unsubscribe = null;

// ----------------------------------------------------------------------------
// 5) DOM refs
// ----------------------------------------------------------------------------

const momentBadge = document.getElementById("momentBadge");
const momentText = document.getElementById("momentText");
const momentTabs = document.getElementById("momentTabs");
const gaugeSvg = document.getElementById("gaugeSvg");
const gaugeEmoji = document.getElementById("gaugeEmoji");
const gaugeLabel = document.getElementById("gaugeLabel");
const gaugeValue = document.getElementById("gaugeValue");
const totalVotesEl = document.getElementById("totalVotes");
const barsContainer = document.getElementById("barsContainer");
const voteGrid = document.getElementById("voteGrid");
const voteClosedMsg = document.getElementById("voteClosedMsg");
const voteTitle = document.getElementById("voteTitle");
const toggleTableBtn = document.getElementById("toggleTableBtn");
const dataTable = document.getElementById("dataTable");
const dataTableBody = document.getElementById("dataTableBody");
const submitVoteBtn = document.getElementById("submitVoteBtn");

// ----------------------------------------------------------------------------
// 6) Gauge (SVG semicircular) — construcción estática de bandas de color
// ----------------------------------------------------------------------------

const GAUGE_CX = 160;
const GAUGE_CY = 170;
const GAUGE_R_OUTER = 130;
const GAUGE_R_INNER = 96;

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function segmentPath(startAngle, endAngle) {
  const p1 = polar(GAUGE_CX, GAUGE_CY, GAUGE_R_OUTER, startAngle);
  const p2 = polar(GAUGE_CX, GAUGE_CY, GAUGE_R_OUTER, endAngle);
  const p3 = polar(GAUGE_CX, GAUGE_CY, GAUGE_R_INNER, endAngle);
  const p4 = polar(GAUGE_CX, GAUGE_CY, GAUGE_R_INNER, startAngle);
  const largeArc = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${GAUGE_R_OUTER} ${GAUGE_R_OUTER} 0 ${largeArc} 0 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${GAUGE_R_INNER} ${GAUGE_R_INNER} 0 ${largeArc} 1 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

function buildGaugeStatic() {
  const ns = "http://www.w3.org/2000/svg";
  const segCount = EMOTIONS.length;
  const segSpan = 180 / segCount;

  // Gradiente lineal que une el espectro de colores de las emociones
  const defs = document.createElementNS(ns, "defs");
  const grad = document.createElementNS(ns, "linearGradient");
  grad.setAttribute("id", "gaugeGrad");
  grad.setAttribute("x1", "0%");
  grad.setAttribute("y1", "0%");
  grad.setAttribute("x2", "100%");
  grad.setAttribute("y2", "0%");

  EMOTIONS.forEach((emo, i) => {
    const stop = document.createElementNS(ns, "stop");
    stop.setAttribute("offset", `${(i / (EMOTIONS.length - 1)) * 100}%`);
    stop.setAttribute("stop-color", emo.color);
    grad.appendChild(stop);
  });
  defs.appendChild(grad);
  gaugeSvg.appendChild(defs);

  // Segmentos de fondo con baja opacidad como escala de referencia
  EMOTIONS.forEach((emo, i) => {
    const startAngle = 180 - i * segSpan;
    const endAngle = 180 - (i + 1) * segSpan;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", segmentPath(startAngle, endAngle));
    path.setAttribute("fill", emo.color);
    path.setAttribute("opacity", "0.18");
    gaugeSvg.appendChild(path);
  });

  // Arco dinámico activo relleno con el gradiente
  const activeFill = document.createElementNS(ns, "path");
  activeFill.setAttribute("id", "gaugeActiveFill");
  activeFill.setAttribute("class", "gauge-active-fill");
  activeFill.setAttribute("fill", "url(#gaugeGrad)");
  activeFill.setAttribute("opacity", "0.95");
  gaugeSvg.appendChild(activeFill);

  // marcas de escala (ticks) con emoji en los extremos
  EMOTIONS.forEach((emo, i) => {
    const angle = 180 - (i + 0.5) * segSpan;
    const p = polar(GAUGE_CX, GAUGE_CY, GAUGE_R_OUTER + 14, angle);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", p.x);
    text.setAttribute("y", p.y);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-size", "13");
    text.textContent = emo.emoji;
    gaugeSvg.appendChild(text);
  });

  // base de la aguja (pivote)
  const needleGroup = document.createElementNS(ns, "g");
  needleGroup.setAttribute("id", "needleGroup");
  needleGroup.setAttribute("class", "gauge-needle");

  const needleLine = document.createElementNS(ns, "line");
  needleLine.setAttribute("id", "needleLine");
  needleLine.setAttribute("x1", GAUGE_CX);
  needleLine.setAttribute("y1", GAUGE_CY);
  needleLine.setAttribute("x2", GAUGE_CX);
  needleLine.setAttribute("y2", GAUGE_CY - (GAUGE_R_INNER - 6));
  needleLine.setAttribute("stroke", "var(--ink, #14181f)");
  needleLine.setAttribute("stroke-width", "4");
  needleLine.setAttribute("stroke-linecap", "round");
  needleGroup.appendChild(needleLine);

  gaugeSvg.appendChild(needleGroup);

  const pivotOuter = document.createElementNS(ns, "circle");
  pivotOuter.setAttribute("cx", GAUGE_CX);
  pivotOuter.setAttribute("cy", GAUGE_CY);
  pivotOuter.setAttribute("r", 10);
  pivotOuter.setAttribute("fill", "#ffffff");
  pivotOuter.setAttribute("stroke", "var(--ink, #14181f)");
  pivotOuter.setAttribute("stroke-width", "3");
  gaugeSvg.appendChild(pivotOuter);
}

function setGaugeValue(avgValue) {
  const needleGroup = document.getElementById("needleGroup");
  const activeFill = document.getElementById("gaugeActiveFill");
  if (!needleGroup) return;

  // avgValue en [1,6] -> t en [0,1] -> ángulo 180 (min) a 0 (max)
  const clamped = Math.min(6, Math.max(1, avgValue));
  const t = (clamped - 1) / 5;
  const angle = 180 - t * 180;
  
  // el <line> apunta hacia arriba (90°) por defecto -> rotamos relativo a 90°
  const rotation = 90 - angle;
  needleGroup.setAttribute("transform", `rotate(${rotation} ${GAUGE_CX} ${GAUGE_CY})`);

  // Actualiza el arco dinámico activo
  if (activeFill) {
    if (clamped > 1) {
      activeFill.setAttribute("d", segmentPath(180, angle));
      activeFill.setAttribute("display", "");
    } else {
      activeFill.setAttribute("display", "none");
    }
  }
}

function closestEmotion(avgValue) {
  let best = EMOTIONS[0];
  let bestDiff = Infinity;
  for (const e of EMOTIONS) {
    const diff = Math.abs(e.value - avgValue);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = e;
    }
  }
  return best;
}

// ----------------------------------------------------------------------------
// 7) Render: banner de momento activo
// ----------------------------------------------------------------------------

function renderMomentBanner(status) {
  if (!momentBadge || !momentText) return;
  if (status.reason === "before") {
    momentBadge.textContent = "🕐 Todavía no arrancó";
    momentBadge.className = "moment-badge is-closed";
    momentText.textContent = `La votación de la previa habilita el ${formatArg(PREVIA_START)}.`;
  } else if (status.reason === "closed") {
    momentBadge.textContent = "✅ Votación cerrada";
    momentBadge.className = "moment-badge is-closed";
    momentText.textContent = "Gracias por participar. Podés ver cómo se sintió la comunidad en cada momento.";
  } else {
    const info = MOMENT_INFO[status.active];
    momentBadge.textContent = info.badge;
    momentBadge.className = `moment-badge ${info.cls}`;
    momentText.textContent = info.text;
  }
}

function formatArg(date) {
  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ----------------------------------------------------------------------------
// 8) Render: tabs de momentos
// ----------------------------------------------------------------------------

function renderTabs() {
  momentTabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.moment === viewMoment);
  });
}

momentTabs.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".tab-btn");
  if (!btn) return;
  userPinnedTab = true;
  viewMoment = btn.dataset.moment;
  renderTabs();
  subscribeToMoment(viewMoment);
});

// ----------------------------------------------------------------------------
// 9) Render: tarjetas de votación
// ----------------------------------------------------------------------------

let selectedEmotion = null;

function buildVoteGrid() {
  voteGrid.innerHTML = "";
  EMOTIONS.forEach((emo) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vote-card";
    btn.style.setProperty("--accent", emo.color);
    btn.dataset.emotionId = emo.id;
    btn.innerHTML = `
      <span class="vc-check">✅</span>
      <span class="vc-emoji">${emo.emoji}</span>
      <span class="vc-label">${emo.label}</span>
    `;
    btn.addEventListener("click", () => {
      // Si ya votó, no permitir selección
      if (currentStatus.active && sessionStorage.getItem("voted_" + currentStatus.active) === "true") {
        return;
      }
      
      // Quitar selección previa de todos los botones
      voteGrid.querySelectorAll(".vote-card").forEach((b) => {
        b.classList.remove("is-selected");
      });
      
      // Seleccionar este botón
      btn.classList.add("is-selected");
      selectedEmotion = emo;
      
      // Habilitar botón de envío
      if (submitVoteBtn) {
        submitVoteBtn.disabled = false;
      }
    });
    voteGrid.appendChild(btn);
  });
}

function updateVoteAvailability(status) {
  const isActive = Boolean(status.active);
  const hasVoted = isActive && sessionStorage.getItem("voted_" + status.active) === "true";
  
  voteGrid.querySelectorAll(".vote-card").forEach((btn) => {
    btn.disabled = !isActive || hasVoted;
    btn.classList.remove("is-selected");
  });
  
  selectedEmotion = null;
  
  if (submitVoteBtn) {
    submitVoteBtn.disabled = true;
    submitVoteBtn.hidden = !isActive || hasVoted;
  }
  
  voteClosedMsg.hidden = isActive && !hasVoted;
  if (!isActive) {
    voteClosedMsg.textContent =
      status.reason === "before"
        ? "La votación todavía no está habilitada. ¡Volvé pronto!"
        : "La votación ya cerró. ¡Gracias por participar!";
    voteTitle.textContent = "Votación no disponible";
  } else if (hasVoted) {
    voteClosedMsg.textContent = "Ya emitiste tu voto para este momento del partido. ¡Gracias por participar!";
    voteTitle.textContent = "Voto registrado";
  } else {
    voteClosedMsg.hidden = true;
    voteTitle.textContent = "¿Vos cómo te sentís?";
  }
}

async function handleSendVote() {
  if (!currentStatus.active || !selectedEmotion) return;
  
  const emo = selectedEmotion;
  const selectedBtn = voteGrid.querySelector(`.vote-card[data-emotion-id="${emo.id}"]`);
  
  if (submitVoteBtn) {
    submitVoteBtn.disabled = true;
  }
  if (selectedBtn) {
    selectedBtn.classList.add("is-voting");
  }
  
  if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR_API_KEY") {
    // Modo demostración: simula la escritura localmente
    setTimeout(() => {
      window.votosDemo.push({
        emotion_id: emo.id,
        value: emo.value,
        moment: currentStatus.active,
        timestamp: new Date(),
      });
      
      // Guardar en la sesión que ya votó
      sessionStorage.setItem("voted_" + currentStatus.active, "true");
      
      renderResults(window.votosDemo.filter((v) => v.moment === viewMoment));
      
      if (selectedBtn) {
        selectedBtn.classList.remove("is-voting");
        selectedBtn.classList.add("is-confirmed");
      }
      
      setTimeout(() => {
        if (selectedBtn) selectedBtn.classList.remove("is-confirmed");
        updateVoteAvailability(currentStatus);
      }, 600);

      // si el usuario no fijó una pestaña manualmente, seguimos mostrando
      // el momento activo (donde acaba de votar)
      if (!userPinnedTab && viewMoment !== currentStatus.active) {
        viewMoment = currentStatus.active;
        renderTabs();
        subscribeToMoment(viewMoment);
      }
    }, 450);
    return;
  }

  try {
    await addDoc(votosRef, {
      emotion_id: emo.id,
      value: emo.value,
      moment: currentStatus.active,
      timestamp: serverTimestamp(),
    });
    
    // Guardar en la sesión que ya votó
    sessionStorage.setItem("voted_" + currentStatus.active, "true");
    
    if (selectedBtn) {
      selectedBtn.classList.remove("is-voting");
      selectedBtn.classList.add("is-confirmed");
    }
    
    setTimeout(() => {
      if (selectedBtn) selectedBtn.classList.remove("is-confirmed");
      updateVoteAvailability(currentStatus);
    }, 600);

    // si el usuario no fijó una pestaña manualmente, seguimos mostrando
    // el momento activo (donde acaba de votar)
    if (!userPinnedTab && viewMoment !== currentStatus.active) {
      viewMoment = currentStatus.active;
      renderTabs();
      subscribeToMoment(viewMoment);
    }
  } catch (err) {
    if (selectedBtn) {
      selectedBtn.classList.remove("is-voting");
    }
    if (submitVoteBtn) {
      submitVoteBtn.disabled = false;
    }
    console.error("Error al votar:", err);
    alert("No se pudo registrar el voto. Revisá tu conexión e intentá de nuevo.");
  }
}

if (submitVoteBtn) {
  submitVoteBtn.addEventListener("click", handleSendVote);
}

// ----------------------------------------------------------------------------
// 10) Render: barras de desglose + tabla accesible + gauge, con datos en vivo
// ----------------------------------------------------------------------------

function renderResults(votes) {
  const counts = {};
  EMOTIONS.forEach((e) => (counts[e.id] = 0));
  let total = 0;
  let sumValues = 0;

  votes.forEach((v) => {
    if (counts[v.emotion_id] !== undefined) {
      counts[v.emotion_id]++;
      total++;
      sumValues += v.value;
    }
  });

  const avg = total > 0 ? sumValues / total : null;

  // gauge
  if (avg !== null) {
    setGaugeValue(avg);
    const near = closestEmotion(avg);
    gaugeEmoji.textContent = near.emoji;
    gaugeLabel.textContent = near.label;
    gaugeValue.textContent = `Promedio: ${avg.toFixed(1)} / 6`;
  } else {
    setGaugeValue(1);
    gaugeEmoji.textContent = "😐";
    gaugeLabel.textContent = "Sin votos todavía";
    gaugeValue.textContent = "—";
  }
  totalVotesEl.textContent = `${total} voto${total === 1 ? "" : "s"} en este momento`;

  // barras
  barsContainer.innerHTML = "";
  dataTableBody.innerHTML = "";
  EMOTIONS.forEach((emo) => {
    const c = counts[emo.id];
    const pct = total > 0 ? (c / total) * 100 : 0;

    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-emoji">${emo.emoji}</span>
      <span class="bar-track">
        <span class="bar-fill" style="width:${pct.toFixed(1)}%; background:${emo.color};"></span>
      </span>
      <span class="bar-meta">
        <span class="bar-pct">${pct.toFixed(0)}%</span>
        <span class="bar-count">${c} voto${c === 1 ? "" : "s"}</span>
      </span>
    `;
    barsContainer.appendChild(row);

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${emo.emoji} ${emo.label}</td><td>${c}</td><td>${pct.toFixed(1)}%</td>`;
    dataTableBody.appendChild(tr);
  });
}

// ----------------------------------------------------------------------------
// 11) Suscripción en tiempo real a Firestore, filtrada por momento
// ----------------------------------------------------------------------------

function subscribeToMoment(momentId) {
  if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR_API_KEY") {
    if (window.votosDemo) {
      renderResults(window.votosDemo.filter((v) => v.moment === momentId));
    }
    return;
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  const q = query(votosRef, where("moment", "==", momentId));
  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const votes = snapshot.docs.map((d) => d.data());
      renderResults(votes);
    },
    (err) => {
      console.error("Error al leer votos:", err);
      totalVotesEl.textContent = "No se pudieron cargar los votos.";
    }
  );
}

// ----------------------------------------------------------------------------
// 12) Reloj: recalcula el momento activo periódicamente
// ----------------------------------------------------------------------------

function tick() {
  currentStatus = computeStatus(new Date());
  renderMomentBanner(currentStatus);
  updateVoteAvailability(currentStatus);

  if (!userPinnedTab && viewMoment !== currentStatus.defaultView) {
    viewMoment = currentStatus.defaultView;
    renderTabs();
    subscribeToMoment(viewMoment);
  }
}

// ----------------------------------------------------------------------------
// 13) Toggle tabla accesible
// ----------------------------------------------------------------------------

toggleTableBtn.addEventListener("click", () => {
  const isHidden = dataTable.hidden;
  dataTable.hidden = !isHidden;
  toggleTableBtn.textContent = isHidden ? "Ocultar tabla" : "Ver como tabla (accesible)";
});

// ----------------------------------------------------------------------------
// 14) Init
// ----------------------------------------------------------------------------

function init() {
  buildGaugeStatic();
  buildVoteGrid();
  renderTabs();
  tick();

  if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR_API_KEY") {
    console.warn("Firebase no configurado. Iniciando en modo demostración con datos de prueba.");
    
    // Banner de advertencia discreto pero visible y elegante
    const demoBanner = document.createElement("div");
    demoBanner.style.cssText = `
      background: linear-gradient(90deg, #fff3cd 0%, #ffeeba 100%);
      color: #856404;
      text-align: center;
      padding: 12px 16px;
      font-size: 0.88rem;
      font-weight: 600;
      border-bottom: 1px solid #ffeeba;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
    `;
    demoBanner.innerHTML = `
      <span>⚠️</span>
      <span><strong>Modo Demostración activo:</strong> Firebase no está configurado. Editá <code>firebase-config.js</code> para conectar tu proyecto real. ¡Podés votar y probar las funciones localmente!</span>
    `;
    document.body.insertBefore(demoBanner, document.body.firstChild);

    // Inicializar base de datos de prueba local
    window.votosDemo = [
      // Previa
      { emotion_id: "indiferencia", value: 1, moment: "previa" },
      { emotion_id: "nervios", value: 2, moment: "previa" },
      { emotion_id: "ilusion", value: 3, moment: "previa" },
      { emotion_id: "alegria", value: 4, moment: "previa" },
      { emotion_id: "euforia", value: 5, moment: "previa" },
      
      // En vivo
      { emotion_id: "nervios", value: 2, moment: "en_vivo" },
      { emotion_id: "ilusion", value: 3, moment: "en_vivo" },
      { emotion_id: "alegria", value: 4, moment: "en_vivo" },
      { emotion_id: "euforia", value: 5, moment: "en_vivo" },
      { emotion_id: "algarabia", value: 6, moment: "en_vivo" },
      { emotion_id: "algarabia", value: 6, moment: "en_vivo" },

      // Post partido
      { emotion_id: "algarabia", value: 6, moment: "post_partido" },
      { emotion_id: "algarabia", value: 6, moment: "post_partido" },
      { emotion_id: "euforia", value: 5, moment: "post_partido" },
    ];

    renderResults(window.votosDemo.filter((v) => v.moment === viewMoment));
  } else {
    subscribeToMoment(viewMoment);
  }

  setInterval(tick, 20000);
}

init();
