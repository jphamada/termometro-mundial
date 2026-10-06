// ============================================================================
// TERMÓMETRO DEL 10 — LÓGICA DE LA APLICACIÓN
// Despedida de Lionel Messi: Argentina vs Benin · Martes 6 de Octubre
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { FIREBASE_CONFIG as STATIC_CONFIG } from "./firebase-config.js";

// ----------------------------------------------------------------------------
// 1) ESCALA DE EMOCIONES PARA LA DESPEDIDA DEL CAPITÁN
// ----------------------------------------------------------------------------

export const EMOTIONS = [
  {
    id: "tristeza_infinita",
    label: "Tristeza infinita",
    quote: "No quiero que llegue el pitazo final",
    emoji: "😢",
    color: "#64748B",
    value: 1,
  },
  {
    id: "nostalgia_lagrimas",
    label: "Nostalgia con lágrimas",
    quote: "Recordando cada gambeta inolvidable",
    emoji: "🥺",
    color: "#38BDF8",
    value: 2,
  },
  {
    id: "piel_gallina",
    label: "Piel de gallina",
    quote: "La emoción viva a flor de piel",
    emoji: "🥶",
    color: "#2DD4BF",
    value: 3,
  },
  {
    id: "gratitud_eterna",
    label: "Gratitud eterna",
    quote: "Gracias de por vida, Capitán",
    emoji: "🐐",
    color: "#FBBF24",
    value: 4,
  },
  {
    id: "ganas_brindis",
    label: "Ganas de hacer un brindis",
    quote: "Por tu magia y tus hazañas, ¡salud!",
    emoji: "🥂",
    color: "#FB923C",
    value: 5,
  },
  {
    id: "alegria_incontenible",
    label: "Alegría incontenible",
    quote: "Festejando la vida y gloria del 10",
    emoji: "🎉",
    color: "#F43F5E",
    value: 6,
  },
];

// ----------------------------------------------------------------------------
// 2) DETECCIÓN Y CONEXIÓN INTELIGENTE DE BASE DE DATOS
// ----------------------------------------------------------------------------

function isValidFirebaseConfig(cfg) {
  return Boolean(
    cfg &&
      cfg.apiKey &&
      !cfg.apiKey.includes("REEMPLAZAR") &&
      cfg.apiKey.length > 10 &&
      cfg.projectId &&
      !cfg.projectId.includes("REEMPLAZAR")
  );
}

let activeFirebaseConfig = null;
let db = null;
let votosRef = null;
let unsubscribeVotes = null;
let isDemoMode = false;

// ----------------------------------------------------------------------------
// 3) REFERENCIAS AL DOM
// ----------------------------------------------------------------------------

const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");

const totalVotesEl = document.getElementById("totalVotes");

const voteGrid = document.getElementById("voteGrid");
const voteTitle = document.getElementById("voteTitle");
const voteClosedMsg = document.getElementById("voteClosedMsg");
const tributeInputBox = document.getElementById("tributeInputBox");
const tributeMessageInput = document.getElementById("tributeMessage");
const charCount = document.getElementById("charCount");
const submitVoteBtn = document.getElementById("submitVoteBtn");

const barsContainer = document.getElementById("barsContainer");
const tributesFeed = document.getElementById("tributesFeed");

const toggleTableBtn = document.getElementById("toggleTableBtn");
const dataTable = document.getElementById("dataTable");
const dataTableBody = document.getElementById("dataTableBody");

let selectedEmotion = null;

// ----------------------------------------------------------------------------
// 4) CONFETI Y CELEBRACIÓN ALBICELASTE (CANVAS)
// ----------------------------------------------------------------------------

const confettiCanvas = document.getElementById("confettiCanvas");
let confettiCtx = confettiCanvas ? confettiCanvas.getContext("2d") : null;
let confettiParticles = [];
let confettiAnimationId = null;

function resizeConfetti() {
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeConfetti);
resizeConfetti();

function triggerAlbicelesteConfetti() {
  if (!confettiCanvas || !confettiCtx) return;
  
  const colors = ["#75AADB", "#FFFFFF", "#F6B40E", "#E8F3FA", "#0A192F"];
  confettiParticles = [];
  
  const count = 120;
  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 200,
      y: window.innerHeight * 0.6,
      vx: (Math.random() - 0.5) * 16,
      vy: -(Math.random() * 14 + 10),
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 12,
      opacity: 1,
      gravity: 0.38,
    });
  }

  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);

  function loop() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let active = false;

    confettiParticles.forEach((p) => {
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.rotation += p.vRotation;
      if (p.y > window.innerHeight * 0.7) {
        p.opacity -= 0.015;
      }

      if (p.opacity > 0 && p.y < confettiCanvas.height + 20) {
        active = true;
        confettiCtx.save();
        confettiCtx.globalAlpha = Math.max(0, p.opacity);
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate((p.rotation * Math.PI) / 180);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        confettiCtx.restore();
      }
    });

    if (active) {
      confettiAnimationId = requestAnimationFrame(loop);
    } else {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  confettiAnimationId = requestAnimationFrame(loop);
}

// ----------------------------------------------------------------------------
// 5) INTERACCIÓN DE VOTACIÓN Y TARJETAS
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// 6) INTERACCIÓN DE VOTACIÓN Y TARJETAS
// ----------------------------------------------------------------------------

function buildVoteGrid() {
  if (!voteGrid) return;
  voteGrid.innerHTML = "";

  EMOTIONS.forEach((emo) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vote-card";
    btn.style.setProperty("--accent-color", emo.color);
    btn.dataset.emotionId = emo.id;
    btn.setAttribute("aria-label", `${emo.label}: ${emo.quote}`);

    btn.innerHTML = `
      <span class="vc-check">★</span>
      <span class="vc-emoji">${emo.emoji}</span>
      <span class="vc-label">${emo.label}</span>
      <span class="vc-quote">${emo.quote}</span>
    `;

    btn.addEventListener("click", () => {
      if (localStorage.getItem("voted_messi_despedida") === "true") return;

      voteGrid.querySelectorAll(".vote-card").forEach((b) => {
        b.classList.remove("is-selected");
      });

      btn.classList.add("is-selected");
      selectedEmotion = emo;

      if (submitVoteBtn) {
        submitVoteBtn.disabled = false;
        submitVoteBtn.innerHTML = `
          <span class="btn-icon">${emo.emoji}</span>
          <span class="btn-text">Confirmar Homenaje (${emo.label})</span>
        `;
      }
    });

    voteGrid.appendChild(btn);
  });
}

function updateVoteAvailability() {
  const hasVoted = localStorage.getItem("voted_messi_despedida") === "true";

  if (voteGrid) {
    voteGrid.querySelectorAll(".vote-card").forEach((btn) => {
      btn.disabled = hasVoted;
      btn.classList.remove("is-selected");
    });
  }

  selectedEmotion = null;

  if (submitVoteBtn) {
    submitVoteBtn.disabled = true;
    submitVoteBtn.style.display = hasVoted ? "none" : "flex";
    submitVoteBtn.innerHTML = `
      <span class="btn-icon">💙</span>
      <span class="btn-text">Registrar Mi Emoción</span>
    `;
  }

  if (tributeInputBox) {
    tributeInputBox.style.display = hasVoted ? "none" : "block";
  }

  if (voteClosedMsg) {
    voteClosedMsg.style.display = hasVoted ? "flex" : "none";
  }

  if (voteTitle) {
    voteTitle.textContent = hasVoted
      ? "¡Homenaje registrado para el 10!"
      : "¿Qué emoción te genera la despedida de Leo?";
  }
}

// Contador de caracteres para el mensaje opcional
if (tributeMessageInput && charCount) {
  tributeMessageInput.addEventListener("input", (e) => {
    charCount.textContent = `${e.target.value.length}/120`;
  });
}

// Envío del voto
async function handleSendVote() {
  if (!selectedEmotion) return;

  const emo = selectedEmotion;
  const rawMessage = tributeMessageInput ? tributeMessageInput.value.trim() : "";
  const message = rawMessage.slice(0, 120);

  if (submitVoteBtn) {
    submitVoteBtn.disabled = true;
    submitVoteBtn.innerHTML = `<span>Enviando al Monumental... ⚽</span>`;
  }

  // Si está en modo demostración local
  if (isDemoMode || !votosRef) {
    const demoVote = {
      emotion_id: emo.id,
      value: emo.value,
      message: message || null,
      timestamp: new Date().toISOString(),
    };

    window.votosLocales.push(demoVote);
    saveLocalVotesToStorage(window.votosLocales);

    localStorage.setItem("voted_messi_despedida", "true");
    triggerAlbicelesteConfetti();
    renderAllData(window.votosLocales);

    setTimeout(() => {
      updateVoteAvailability();
    }, 400);
    return;
  }

  // Envío a Firestore real
  try {
    await addDoc(votosRef, {
      emotion_id: emo.id,
      value: emo.value,
      message: message || null,
      timestamp: serverTimestamp(),
    });

    localStorage.setItem("voted_messi_despedida", "true");
    triggerAlbicelesteConfetti();

    setTimeout(() => {
      updateVoteAvailability();
    }, 400);
  } catch (err) {
    console.error("Error al registrar voto en Firebase:", err);
    alert("Hubo un inconveniente al conectar con Firebase. Guardaremos tu voto de forma local.");
    
    // Fallback a local
    const fallbackVote = {
      emotion_id: emo.id,
      value: emo.value,
      message: message || null,
      timestamp: new Date().toISOString(),
    };
    window.votosLocales.push(fallbackVote);
    saveLocalVotesToStorage(window.votosLocales);
    localStorage.setItem("voted_messi_despedida", "true");
    triggerAlbicelesteConfetti();
    renderAllData(window.votosLocales);
    updateVoteAvailability();
  }
}

if (submitVoteBtn) {
  submitVoteBtn.addEventListener("click", handleSendVote);
}

// ----------------------------------------------------------------------------
// 7) RENDERIZADO: GAUGE + BARRAS + MURO DE TRIBUTOS + TABLA
// ----------------------------------------------------------------------------

function renderAllData(votes) {
  const counts = {};
  EMOTIONS.forEach((e) => (counts[e.id] = 0));
  let total = 0;
  let sumValues = 0;
  const tributes = [];

  votes.forEach((v) => {
    if (counts[v.emotion_id] !== undefined) {
      counts[v.emotion_id]++;
      total++;
      sumValues += v.value || 1;
    }
    if (v.message && typeof v.message === "string" && v.message.trim().length > 0) {
      tributes.push({
        emotion_id: v.emotion_id,
        message: v.message.trim(),
        timestamp: v.timestamp,
      });
    }
  });

  // Total de votos y conteo

  if (totalVotesEl) {
    totalVotesEl.textContent = `${total} homenaje${total === 1 ? "" : "s"} registrado${total === 1 ? "" : "s"}`;
  }

  const totalVotesHeader = document.getElementById("totalVotesHeader");
  if (totalVotesHeader) {
    totalVotesHeader.textContent = total;
  }

  // Barras de progreso
  if (barsContainer) {
    barsContainer.innerHTML = "";
    EMOTIONS.forEach((emo) => {
      const c = counts[emo.id];
      const pct = total > 0 ? (c / total) * 100 : 0;

      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <span class="bar-emoji">${emo.emoji}</span>
        <div class="bar-track-wrap">
          <div class="bar-info-top">
            <span>${emo.label}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${pct.toFixed(1)}%; background: ${emo.color}; color: ${emo.color};"></div>
          </div>
        </div>
        <div class="bar-meta">
          <span class="bar-pct">${pct.toFixed(0)}%</span>
          <span class="bar-count">${c} voto${c === 1 ? "" : "s"}</span>
        </div>
      `;
      barsContainer.appendChild(row);
    });
  }

  // Tabla accesible
  if (dataTableBody) {
    dataTableBody.innerHTML = "";
    EMOTIONS.forEach((emo) => {
      const c = counts[emo.id];
      const pct = total > 0 ? (c / total) * 100 : 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${emo.emoji} <strong>${emo.label}</strong></td>
        <td>${c}</td>
        <td>${pct.toFixed(1)}%</td>
      `;
      dataTableBody.appendChild(tr);
    });
  }

  // Muro de Mensajes al 10
  renderTributesFeed(tributes);
}

function renderTributesFeed(tributes) {
  if (!tributesFeed) return;
  tributesFeed.innerHTML = "";

  if (tributes.length === 0) {
    tributesFeed.innerHTML = `
      <div class="tribute-empty-state">
        <span>✍️ Sé el primero en dejarle un mensaje o agradecimiento a Messi para el partido.</span>
      </div>
    `;
    return;
  }

  // Ordenar los más recientes primero
  const reversed = [...tributes].reverse();

  reversed.slice(0, 25).forEach((t) => {
    const emo = EMOTIONS.find((e) => e.id === t.emotion_id) || EMOTIONS[3];
    const item = document.createElement("div");
    item.className = "tribute-card-item";
    item.style.setProperty("--tag-color", emo.color);

    item.innerHTML = `
      <div class="tribute-card-top">
        <span class="tribute-author-tag" style="color: ${emo.color}">
          <span>${emo.emoji}</span>
          <span>${emo.label}</span>
        </span>
        <span class="tribute-time">Homenaje</span>
      </div>
      <p class="tribute-card-text">"${escapeHtml(t.message)}"</p>
    `;
    tributesFeed.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ----------------------------------------------------------------------------
// 8) ALMACENAMIENTO Y DEMO LOCAL FALLBACK
// ----------------------------------------------------------------------------

function getInitialDemoVotes() {
  const saved = localStorage.getItem("termometro_votos_messi_data");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }

  return [
    { emotion_id: "gratitud_eterna", value: 4, message: "Gracias infinitas Leo por Qatar 2022 y por hacernos tan felices toda la vida.", timestamp: "2026-10-06T08:15:00" },
    { emotion_id: "tristeza_infinita", value: 1, message: "No quiero que termine nunca este partido. Se va el más grande de la historia.", timestamp: "2026-10-06T08:45:00" },
    { emotion_id: "alegria_incontenible", value: 6, message: "Eternamente en el Olimpo del fútbol mundial. El 10 supremo.", timestamp: "2026-10-06T09:00:00" },
    { emotion_id: "piel_gallina", value: 3, message: "Llorando en la tribuna del Monumental antes de que empiece. Gracias Leo.", timestamp: "2026-10-06T09:10:00" },
    { emotion_id: "ganas_brindis", value: 5, message: "¡Brindando por todo lo que nos diste, salud Capitán!", timestamp: "2026-10-06T09:18:00" },
    { emotion_id: "nostalgia_lagrimas", value: 2, message: "Un golazo más de tiro libre para el recuerdo por favor capitán.", timestamp: "2026-10-06T09:22:00" },
  ];
}

function saveLocalVotesToStorage(votes) {
  try {
    localStorage.setItem("termometro_votos_messi_data", JSON.stringify(votes));
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// 9) TOGGLE TABLA ACCESIBLE
// ----------------------------------------------------------------------------

if (toggleTableBtn && dataTable) {
  toggleTableBtn.addEventListener("click", () => {
    const isHidden = dataTable.hidden;
    dataTable.hidden = !isHidden;
    toggleTableBtn.innerHTML = isHidden
      ? "<span>▲ Ocultar tabla de datos</span>"
      : "<span>📊 Ver tabla de datos accesible</span>";
  });
}

// ----------------------------------------------------------------------------
// 10) INICIALIZACIÓN
// ----------------------------------------------------------------------------

async function resolveFirebaseConfig() {
  // 1) Revisar si el archivo local firebase-config.js tiene credenciales reales
  if (isValidFirebaseConfig(STATIC_CONFIG)) {
    return STATIC_CONFIG;
  }

  // 2) Revisar si el endpoint /api/config de Vercel tiene credenciales con timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/config", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const remoteConfig = await res.json();
      if (isValidFirebaseConfig(remoteConfig)) {
        return remoteConfig;
      }
    }
  } catch (err) {
    // Normal en entorno estático o sin Vercel dev
  }

  return null;
}

async function init() {
  buildVoteGrid();
  updateVoteAvailability();

  // 1) Render inmediato con datos almacenados o demo para evitar que la interfaz quede en blanco
  window.votosLocales = getInitialDemoVotes();
  renderAllData(window.votosLocales);

  activeFirebaseConfig = await resolveFirebaseConfig();

  if (activeFirebaseConfig) {
    // 2) Carga inmediata por REST para respuesta instantánea (<300ms)
    try {
      const restUrl = `https://firestore.googleapis.com/v1/projects/${activeFirebaseConfig.projectId}/databases/(default)/documents/votos_messi`;
      fetch(restUrl)
        .then((r) => r.json())
        .then((data) => {
          if (data && Array.isArray(data.documents) && data.documents.length > 0) {
            const parsedVotes = data.documents.map((d) => {
              const f = d.fields || {};
              return {
                emotion_id: f.emotion_id?.stringValue || "",
                value: parseInt(f.value?.integerValue || "1", 10),
                message: f.message?.stringValue || null,
                timestamp: f.timestamp?.timestampValue || null,
              };
            });
            renderAllData(parsedVotes);
          }
        })
        .catch(() => {});
    } catch (e) {}

    // 3) Suscripción en tiempo real nativa de Firebase SDK
    try {
      const fbApp = initializeApp(activeFirebaseConfig);
      db = getFirestore(fbApp);
      votosRef = collection(db, "votos_messi");

      unsubscribeVotes = onSnapshot(
        votosRef,
        (snapshot) => {
          const votes = snapshot.docs.map((doc) => doc.data());
          if (votes.length > 0) {
            renderAllData(votes);
          }
        },
        (err) => {
          console.warn("Permisos o error en Firestore en tiempo real:", err);
        }
      );

      if (statusIndicator && statusText) {
        statusIndicator.className = "status-indicator is-online";
        statusText.innerHTML = `<strong>En vivo con Firebase:</strong> Sincronización en tiempo real activa`;
      }
    } catch (e) {
      console.warn("Fallo al inicializar Firebase SDK:", e);
    }
  } else {
    activateDemoMode("Modo Demostración Activo · Votos y animaciones operativas localmente");
  }
}

function activateDemoMode(message) {
  isDemoMode = true;
  window.votosLocales = getInitialDemoVotes();
  renderAllData(window.votosLocales);

  if (statusIndicator && statusText) {
    statusIndicator.className = "status-indicator is-demo";
    statusText.innerHTML = `<strong>Modo Simulación:</strong> ${message}`;
  }
}

init();

// Manejo del botón compartir interactivo
const shareBtn = document.getElementById("shareBtn");
if (shareBtn) {
  shareBtn.addEventListener("click", async () => {
    const shareData = {
      title: "Termómetro del 10 — Despedida de Lionel Messi",
      text: "¡Elegí tu emoción y dejale un mensaje al Capitán en su despedida en el Monumental!",
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Usuario canceló compartir
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const originalHtml = shareBtn.innerHTML;
        shareBtn.innerHTML = `
          <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        setTimeout(() => {
          shareBtn.innerHTML = originalHtml;
        }, 1800);
      } catch (e) {
// ----------------------------------------------------------------------------
// 11) DETECCIÓN DE MODO EMBEBIDO (IFRAME) Y COMUNICACIÓN RESPONSIVE
// ----------------------------------------------------------------------------

function initResponsiveEmbed() {
  const isEmbedded = window.self !== window.top;
  if (isEmbedded) {
    document.body.classList.add("is-embedded");
  }

  function reportHeight() {
    const mainEl = document.querySelector("main");
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      mainEl ? mainEl.offsetHeight : 0
    );

    try {
      window.parent.postMessage(
        {
          type: "resize-termometro",
          height: height,
          origin: window.location.href,
        },
        "*"
      );
    } catch (e) {}
  }

  window.addEventListener("load", reportHeight);
  window.addEventListener("resize", reportHeight);

  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      reportHeight();
    });
    resizeObserver.observe(document.body);
  }

  // Reportar altura inicial y tras breve delay para carga de fuentes e imágenes
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 1200);
}

initResponsiveEmbed();

