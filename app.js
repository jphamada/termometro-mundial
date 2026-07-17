// ============================================================================
// Termómetro de la Final — lógica de la app (Firebase v9+ modular)
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ----------------------------------------------------------------------------
// 1) ESCALA DE EMOCIONES — fija, no editable por el usuario final
// ----------------------------------------------------------------------------

const EMOTIONS = [
  { id: "indiferencia", label: "Indiferencia", emoji: "😐", color: "#9E9E9E", value: 1 },
  { id: "nervios", label: "Nervios", emoji: "😬", color: "#FFC107", value: 2 },
  { id: "ilusion", label: "Ilusión", emoji: "🙂", color: "#4FC3F7", value: 3 },
  { id: "alegria", label: "Alegría", emoji: "😃", color: "#66BB6A", value: 4 },
  { id: "euforia", label: "Euforia", emoji: "🤩", color: "#FF9800", value: 5 },
  { id: "algarabia", label: "Algarabía total", emoji: "🎉", color: "#E53935", value: 6 },
];

// ----------------------------------------------------------------------------
// 2) FIREBASE INIT
// ----------------------------------------------------------------------------

let FIREBASE_CONFIG = { apiKey: "REEMPLAZAR_API_KEY" };
try {
  const configResponse = await fetch("/api/config");
  if (configResponse.ok) {
    FIREBASE_CONFIG = await configResponse.json();
  }
} catch (err) {
  console.warn("No se pudo obtener /api/config, utilizando modo demostración local.");
}

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const votosRef = collection(db, "votos");
let unsubscribe = null;

// ----------------------------------------------------------------------------
// 3) DOM refs
// ----------------------------------------------------------------------------

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
// 4) Gauge (SVG semicircular) — construcción estática de bandas de color
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

  const clamped = Math.min(6, Math.max(1, avgValue));
  const t = (clamped - 1) / 5;
  const angle = 180 - t * 180;
  
  const rotation = 90 - angle;
  needleGroup.setAttribute("transform", `rotate(${rotation} ${GAUGE_CX} ${GAUGE_CY})`);

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
// 5) Render: tarjetas de votación
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
      if (sessionStorage.getItem("voted_general") === "true") {
        return;
      }
      
      voteGrid.querySelectorAll(".vote-card").forEach((b) => {
        b.classList.remove("is-selected");
      });
      
      btn.classList.add("is-selected");
      selectedEmotion = emo;
      
      if (submitVoteBtn) {
        submitVoteBtn.disabled = false;
      }
    });
    voteGrid.appendChild(btn);
  });
}

function updateVoteAvailability() {
  const hasVoted = sessionStorage.getItem("voted_general") === "true";
  
  voteGrid.querySelectorAll(".vote-card").forEach((btn) => {
    btn.disabled = hasVoted;
    btn.classList.remove("is-selected");
  });
  
  selectedEmotion = null;
  
  if (submitVoteBtn) {
    submitVoteBtn.disabled = true;
    submitVoteBtn.hidden = hasVoted;
  }
  
  voteClosedMsg.hidden = !hasVoted;
  if (hasVoted) {
    voteClosedMsg.textContent = "Ya emitiste tu voto. ¡Gracias por participar!";
    voteTitle.textContent = "Voto registrado";
  } else {
    voteClosedMsg.hidden = true;
    voteTitle.textContent = "¿Qué emoción sentís para la final del Mundial?";
  }
}

async function handleSendVote() {
  if (!selectedEmotion) return;
  
  const emo = selectedEmotion;
  const selectedBtn = voteGrid.querySelector(`.vote-card[data-emotion-id="${emo.id}"]`);
  
  if (submitVoteBtn) {
    submitVoteBtn.disabled = true;
  }
  if (selectedBtn) {
    selectedBtn.classList.add("is-voting");
  }
  
  if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR_API_KEY") {
    setTimeout(() => {
      window.votosDemo.push({
        emotion_id: emo.id,
        value: emo.value,
        moment: "general",
        timestamp: new Date(),
      });
      
      sessionStorage.setItem("voted_general", "true");
      renderResults(window.votosDemo);
      
      if (selectedBtn) {
        selectedBtn.classList.remove("is-voting");
        selectedBtn.classList.add("is-confirmed");
      }
      
      setTimeout(() => {
        if (selectedBtn) selectedBtn.classList.remove("is-confirmed");
        updateVoteAvailability();
      }, 600);
    }, 450);
    return;
  }

  try {
    await addDoc(votosRef, {
      emotion_id: emo.id,
      value: emo.value,
      moment: "general",
      timestamp: serverTimestamp(),
    });
    
    sessionStorage.setItem("voted_general", "true");
    
    if (selectedBtn) {
      selectedBtn.classList.remove("is-voting");
      selectedBtn.classList.add("is-confirmed");
    }
    
    setTimeout(() => {
      if (selectedBtn) selectedBtn.classList.remove("is-confirmed");
      updateVoteAvailability();
    }, 600);
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
// 6) Render: barras de desglose + tabla accesible + gauge, con datos en vivo
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
  totalVotesEl.textContent = `${total} voto${total === 1 ? "" : "s"} en total`;

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
// 7) Suscripción en tiempo real a Firestore (todas las instancias)
// ----------------------------------------------------------------------------

function subscribeToVotes() {
  if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR_API_KEY") {
    if (window.votosDemo) {
      renderResults(window.votosDemo);
    }
    return;
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  unsubscribe = onSnapshot(
    votosRef,
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
// 8) Toggle tabla accesible
// ----------------------------------------------------------------------------

toggleTableBtn.addEventListener("click", () => {
  const isHidden = dataTable.hidden;
  dataTable.hidden = !isHidden;
  toggleTableBtn.textContent = isHidden ? "Ocultar tabla" : "Ver como tabla (accesible)";
});

// ----------------------------------------------------------------------------
// 9) Init
// ----------------------------------------------------------------------------

function init() {
  buildGaugeStatic();
  buildVoteGrid();
  updateVoteAvailability();

  if (FIREBASE_CONFIG.apiKey === "REEMPLAZAR_API_KEY") {
    console.warn("Firebase no configurado. Iniciando en modo demostración con datos de prueba.");
    
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

    window.votosDemo = [
      { emotion_id: "indiferencia", value: 1, moment: "general" },
      { emotion_id: "nervios", value: 2, moment: "general" },
      { emotion_id: "ilusion", value: 3, moment: "general" },
      { emotion_id: "alegria", value: 4, moment: "general" },
      { emotion_id: "euforia", value: 5, moment: "general" },
      { emotion_id: "algarabia", value: 6, moment: "general" },
    ];

    renderResults(window.votosDemo);
  } else {
    subscribeToVotes();
  }
}

init();
