// UI wiring: Strava link → GPX import → 3D fly-over → video export.
import { parseStravaLink } from './src/strava.js';
import { parseTrackFile } from './src/track-parser.js';
import { pointAt } from './src/geo.js';
import { THEMES, DEFAULT_THEME } from './src/map-styles.js';
import { formatDistance, formatDuration, formatElevation } from './src/format.js';
import { FlyoverPlayer } from './src/player.js';
import { VideoRecorder, videoFileName } from './src/video.js';

const $ = (id) => document.getElementById(id);
const ui = {
  panel: $('panel'),
  collapse: $('collapse'),
  linkForm: $('link-form'),
  linkInput: $('link-input'),
  linkResult: $('link-result'),
  fileInput: $('file-input'),
  demoBtn: $('demo-btn'),
  themes: $('themes'),
  duration: $('duration'),
  playBtn: $('play-btn'),
  recordBtn: $('record-btn'),
  status: $('status'),
  hud: $('hud'),
  hudTitle: $('hud-title'),
  hudDistance: $('hud-distance'),
  hudEle: $('hud-ele'),
  hudTime: $('hud-time'),
  hudGain: $('hud-gain'),
  scrubber: $('scrubber'),
};

let title = '';
let hudValues = null;
let recorder = null;

const player = new FlyoverPlayer($('map'), { onFrame: updateHud, onStateChange: updateControls });
player.map.on('render', () => recorder?.capture());

// --- Step 1: Strava link ---------------------------------------------------

ui.linkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const link = parseStravaLink(ui.linkInput.value);
  const box = ui.linkResult;
  box.hidden = false;
  box.classList.toggle('error', !link);
  if (!link) {
    box.textContent = "Ce n'est pas un lien d'activité Strava. Exemple : https://www.strava.com/activities/1234567890";
    return;
  }
  if (link.kind === 'short') {
    box.innerHTML = `Lien de partage mobile détecté. <a href="${link.pageUrl}" target="_blank" rel="noopener">Ouvre-le</a>, puis colle ici l'adresse <code>strava.com/activities/…</code> affichée.`;
    return;
  }
  const what = link.kind === 'route' ? 'cet itinéraire' : 'cette activité';
  box.innerHTML = `
    Strava réserve les traces GPS à leur propriétaire : récupère le fichier en un clic.
    <ol>
      <li><a href="${link.exportUrl}" target="_blank" rel="noopener">Télécharger le GPX de ${what}</a> (connecté à Strava)</li>
      <li>Dépose le fichier téléchargé juste en dessous.</li>
    </ol>`;
});

// --- Step 2: file import -----------------------------------------------------

ui.fileInput.addEventListener('change', () => ui.fileInput.files[0] && loadFile(ui.fileInput.files[0]));
ui.demoBtn.addEventListener('click', () => loadDemo().catch(showError));

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) document.body.classList.remove('dragging');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

async function loadFile(file) {
  try {
    await loadTrack(await file.text(), file.name.replace(/\.(gpx|tcx)$/i, ''));
  } catch (err) {
    showError(err);
  }
}

async function loadDemo() {
  const res = await fetch('./demo/chamonix-lac-blanc.gpx');
  if (!res.ok) throw new Error('Impossible de charger la démo.');
  await loadTrack(await res.text(), 'Démo');
}

async function loadTrack(text, fallbackName) {
  if (recorder) return;
  setStatus('Analyse de la trace…');
  const parsed = parseTrackFile(text);
  title = parsed.name || fallbackName;
  const track = await player.load(parsed.points);
  ui.hud.hidden = false;
  ui.hudTitle.textContent = title;
  ui.hudGain.textContent = formatElevation(track.elevationGain);
  setStatus(`${formatDistance(track.total)} · D+ ${formatElevation(track.elevationGain)}` +
    (track.duration ? ` · ${formatDuration(track.duration)}` : '') + ' — prêt !');
  updateControls(player.state);
}

// --- Step 3: style & playback ------------------------------------------------

for (const [key, theme] of Object.entries(THEMES)) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.setAttribute('role', 'radio');
  chip.dataset.theme = key;
  chip.setAttribute('aria-checked', String(key === DEFAULT_THEME));
  chip.innerHTML = `<span aria-hidden="true">${theme.icon}</span>${theme.label}`;
  chip.addEventListener('click', () => selectTheme(key));
  ui.themes.append(chip);
}

function selectTheme(key) {
  player.setTheme(key);
  for (const chip of ui.themes.children) chip.setAttribute('aria-checked', String(chip.dataset.theme === key));
}

ui.duration.addEventListener('change', () => player.setDuration(Number(ui.duration.value)));

ui.playBtn.addEventListener('click', () => {
  if (player.state === 'playing' || player.state === 'intro') player.pause();
  else player.play();
});

ui.scrubber.addEventListener('input', () => player.seek(ui.scrubber.value / 1000));

ui.collapse.addEventListener('click', () => {
  const collapsed = ui.panel.classList.toggle('collapsed');
  ui.collapse.setAttribute('aria-expanded', String(!collapsed));
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('input, select, textarea, button')) return;
  e.preventDefault();
  ui.playBtn.click();
});

// --- Bonus: video export -----------------------------------------------------

ui.recordBtn.addEventListener('click', async () => {
  try {
    player.stop();
    recorder = new VideoRecorder(player.canvas, drawVideoOverlay);
    document.body.classList.add('recording');
    updateControls(player.state);
    setStatus('Enregistrement en cours… garde cet onglet visible.');
    recorder.start();
    await player.play();
    const blob = await recorder.stop();
    download(blob, videoFileName(title, recorder.mimeType));
    setStatus('Vidéo exportée ✔');
  } catch (err) {
    showError(err);
  } finally {
    recorder = null;
    document.body.classList.remove('recording');
    updateControls(player.state);
  }
});

function drawVideoOverlay(ctx, w, h) {
  if (!hudValues) return;
  const s = Math.min(w, h) / 1080;
  const pad = 48 * s;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18 * s;
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${46 * s}px system-ui, sans-serif`;
  ctx.fillText(title, pad, pad + 40 * s);
  const stats = [
    ['DISTANCE', hudValues.distance],
    ['ALTITUDE', hudValues.ele],
    ['TEMPS', hudValues.time],
  ];
  stats.forEach(([label, value], i) => {
    const x = pad + i * 300 * s;
    ctx.font = `600 ${22 * s}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(label, x, h - pad - 70 * s);
    ctx.font = `800 ${52 * s}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(value, x, h - pad - 18 * s);
  });
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(pad, h - pad, w - 2 * pad, 6 * s);
  ctx.fillStyle = '#fc4c02';
  ctx.fillRect(pad, h - pad, (w - 2 * pad) * hudValues.progress, 6 * s);
  ctx.font = `600 ${20 * s}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'right';
  ctx.fillText('3D Strava', w - pad, pad + 30 * s);
  ctx.restore();
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// --- HUD & state -------------------------------------------------------------

function updateHud({ progress, distance, track, t }) {
  const here = pointAt(track, distance);
  hudValues = {
    progress,
    distance: formatDistance(distance),
    ele: formatElevation(here.ele),
    time: here.time != null && track.startTime != null ? formatDuration(here.time - track.startTime) : '–',
  };
  ui.hudDistance.textContent = hudValues.distance;
  ui.hudEle.textContent = hudValues.ele;
  ui.hudTime.textContent = hudValues.time;
  if (document.activeElement !== ui.scrubber) ui.scrubber.value = String(Math.round(t * 1000));
}

function updateControls(state) {
  const loaded = Boolean(player.track);
  const running = state === 'playing' || state === 'intro';
  ui.playBtn.disabled = !loaded || Boolean(recorder);
  ui.recordBtn.disabled = !loaded || Boolean(recorder);
  ui.playBtn.textContent = running ? '⏸ Pause' : state === 'paused' ? '▶ Reprendre' : '▶ Lancer le survol';
}

function setStatus(text) {
  ui.status.textContent = text;
}

function showError(err) {
  console.error(err);
  setStatus(`⚠️ ${err.message ?? err}`);
}

// Land on the demo so the 3D map is never empty.
loadDemo().catch(showError);
