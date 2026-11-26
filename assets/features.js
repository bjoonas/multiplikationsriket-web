/* Local installation preferences, play statistics and achievement cards. */
const PUBLIC_GAME_URL = 'https://bjoonas.github.io/multiplikationsriket-web/';
const INSTALL_PREFERENCE = 'multiplikationsriket-install-v1';
const installedDisplay = matchMedia('(display-mode: standalone)');
let installPrompt;
let installNoticeShown = false;
let manualInstallReady = false;
let installedThisVisit = false;
let answerClock;

function isInstalled() {
  return installedThisVisit || navigator.standalone === true || installedDisplay.matches;
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function installPreference(value) {
  try {
    if (value) localStorage.setItem(INSTALL_PREFERENCE, value);
    return localStorage.getItem(INSTALL_PREFERENCE);
  } catch {
    return null;
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (typeof s !== 'undefined') maybeShowInstall();
});

window.addEventListener('appinstalled', () => {
  installedThisVisit = true;
  installPrompt = null;
  installPreference('installed');
  document.querySelector('#install-dialog')?.close();
  if (screen === 'settings') render();
});

installedDisplay.addEventListener('change', () => {
  if (isInstalled()) document.querySelector('#install-dialog')?.close();
  if (screen === 'settings') render();
});

function maybeShowInstall() {
  if (!installNoticeShown && !isInstalled() && (installPrompt || isIOS() || manualInstallReady) &&
      !installPreference() && screen === 'home' && !s.battle && !s.event &&
      !s.tableChallenge && !document.querySelector('dialog[open], #game-modal')) showInstall();
}

function showInstall() {
  if (isInstalled() || s.battle || s.pendingDefense || document.querySelector('dialog[open]')) return;
  installNoticeShown = true;
  const dialog = document.createElement('dialog');
  dialog.id = 'install-dialog';
  dialog.className = 'math-hint-dialog achievement-dialog';
  dialog.setAttribute('aria-labelledby', 'install-title');
  dialog.innerHTML = `
    <h2 id="install-title">Ta med riket på äventyr</h2>
    <p>Lägg spelet på hemskärmen så kan du öppna det som en app. När bilderna har laddats fungerar spelet även offline.</p>
    ${installPrompt ? '<button type="button" class="btn" id="install-now">Installera</button>' :
      isIOS() ? '<ol><li>Öppna sidan i Safari och tryck på Dela.</li><li>Välj Lägg till på hemskärmen.</li><li>Tryck på Lägg till.</li></ol>' :
        '<p>Öppna webbläsarens meny och välj Installera app eller Lägg till på hemskärmen om alternativet finns.</p>'}
    <form method="dialog" class="install-options">
      <label><input type="checkbox"${installPreference() === 'never' ? ' checked' : ''}> Visa inte igen</label>
      <button class="btn secondary">Kanske senare</button>
    </form>`;
  dialog.addEventListener('close', () => {
    if (!isInstalled() && installPreference() !== 'installed') {
      installPreference(dialog.querySelector('input').checked ? 'never' : 'later');
    }
    dialog.remove();
  }, { once: true });
  dialog.querySelector('#install-now')?.addEventListener('click', async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') installPreference('installed');
    } catch {
      // The browser may withdraw the offer before it is used.
    }
    if (dialog.open) dialog.close();
  }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
}

function newPerformance(kind, startedAt = Date.now()) {
  return { kind, world: s.world, startedAt, activeMs: 0, answeredMs: 0, timedAnswers: 0,
    correct: 0, wrong: 0, streak: 0, bestStreak: 0, xp: 0, gold: 0, tables: {} };
}

function challengePerformance(round) {
  return round.performance ??= {
    ...newPerformance('challenge', round.startedAt), correct: round.correct, wrong: round.wrong
  };
}

function ensureAdventurePerformance() {
  s.adventurePerformance ??= newPerformance('adventure');
  return s.adventurePerformance;
}

function activeAnswer() {
  if (document.hidden || document.querySelector('dialog[open]')) return null;
  if (s.tableChallenge && document.getElementById('challenge-fact')) {
    return [challengePerformance(s.tableChallenge), s.tableChallenge.queue[0]];
  }
  if (s.gearChallenge && document.getElementById('gear-question')) return [ensureAdventurePerformance(), s.gearChallenge.question];
  if (s.pendingDefense && document.getElementById('defense-modal')) return [ensureAdventurePerformance(), s.pendingDefense];
  if (screen === 'game' && !s.event && !busy && s.question && document.querySelector('.game-panel .controls')) {
    return [ensureAdventurePerformance(), s.question];
  }
  return null;
}

function checkpointAnswerClock(now = performance.now()) {
  if (!answerClock?.running) return;
  const elapsed = Math.max(0, now - answerClock.tick);
  answerClock.tick = now;
  answerClock.elapsed += elapsed;
  answerClock.record.activeMs += elapsed;
  answerClock.record.pendingAnswer = { key: answerClock.key, elapsed: answerClock.elapsed };
}

function syncAnswerClock() {
  checkpointAnswerClock();
  const next = activeAnswer();
  if (!next) {
    if (answerClock) answerClock.running = false;
    return;
  }
  const [record, question] = next;
  if (answerClock?.record !== record || answerClock.question !== question) {
    const key = [s.tableChallenge ? 'challenge' : s.gearChallenge ? 'gear' : s.pendingDefense ? 'defense' : 'game',
      question.a ?? question[0], question.b ?? question[1], record.correct + record.wrong].join(':');
    const elapsed = !answerClock && record.pendingAnswer?.key === key ? record.pendingAnswer.elapsed : 0;
    answerClock = { record, question, key, elapsed };
    record.pendingAnswer = { key, elapsed };
  }
  answerClock.tick = performance.now();
  answerClock.running = true;
}

function recordPerformanceAnswer(record, a, b, correct) {
  checkpointAnswerClock();
  if (answerClock?.record === record) {
    record.answeredMs += answerClock.elapsed;
    record.timedAnswers++;
    answerClock = null;
  }
  delete record.pendingAnswer;
  const table = record.tables[a] ??= { correct: 0, wrong: 0, solved: [] };
  if (correct) {
    record.correct++;
    table.correct++;
    if (!table.solved.includes(b)) table.solved.push(b);
    record.streak++;
    record.bestStreak = Math.max(record.bestStreak, record.streak);
  } else {
    record.wrong++;
    table.wrong++;
    record.streak = 0;
  }
}

function performanceAccuracy(record) {
  const attempts = record.correct + record.wrong;
  return attempts ? Math.round(100 * record.correct / attempts) : null;
}

function completePerformance(record, reason, boss = null) {
  if (!record) return null;
  checkpointAnswerClock();
  if (answerClock?.record === record) answerClock = null;
  delete record.pendingAnswer;
  record.endedAt = Date.now();
  record.reason = reason;
  record.boss = boss;
  record.accuracy = performanceAccuracy(record);
  record.averageMs = record.timedAnswers ? record.answeredMs / record.timedAnswers : null;
  record.personalBests = [];
  if (reason !== 'Avbruten') {
    for (const [table, facts] of Object.entries(record.tables)) {
      const solved = facts.solved.length;
      if (!solved) continue;
      const accuracy = performanceAccuracy(facts);
      const previous = s.performanceBest[table];
      if (!previous || solved > previous.solved || (solved === previous.solved && accuracy > previous.accuracy)) {
        s.performanceBest[table] = { solved, accuracy };
        record.personalBests.push(Number(table));
      }
    }
  }
  s.performanceLog.push(record);
  return record;
}

function finishAdventurePerformance(reason, boss) {
  completePerformance(s.adventurePerformance, reason, boss);
  s.adventurePerformance = null;
}

function earnGold(amount) {
  s.gold += amount;
  if (s.adventurePerformance) s.adventurePerformance.gold += amount;
}

function performanceTime(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function performanceSummary(record) {
  if (!record) return '';
  return `<dl class="achievement-stats">
    <div><dt>Rätt / fel</dt><dd>${escapeHtml(record.correct)} / ${escapeHtml(record.wrong)}</dd></div>
    <div><dt>Träffsäkerhet</dt><dd>${record.accuracy == null ? '–' : escapeHtml(record.accuracy) + ' %'}</dd></div>
    <div><dt>Aktiv svarstid</dt><dd>${performanceTime(record.activeMs)}</dd></div>
    <div><dt>Total tid</dt><dd>${performanceTime(record.endedAt - record.startedAt)}</dd></div>
    <div><dt>Snitt per svar</dt><dd>${record.averageMs == null ? '–' : (record.averageMs / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 1 }) + ' s'}</dd></div>
    <div><dt>Längsta svit</dt><dd>${escapeHtml(record.bestStreak)}</dd></div>
    <div><dt>Intjänat</dt><dd>${escapeHtml(record.xp)} XP · ${escapeHtml(record.gold)} guld</dd></div>
    ${record.boss ? `<div><dt>Besegrad boss</dt><dd>${escapeHtml(record.boss)}</dd></div>` : ''}
  </dl>`;
}

function performanceHistoryUI() {
  const best = Object.entries(s.performanceBest);
  const date = timestamp => new Date(timestamp).toLocaleString('sv-SE');
  return `<section class="challenge-section"><h3>Prestationsstatistik</h3>
    ${best.length ? '<h4>Personbästa per tabell</h4><ul>' + best.map(([table, record]) =>
      `<li>${escapeHtml(table)}:ans tabell · ${escapeHtml(record.solved)} olika rätt · ${escapeHtml(record.accuracy)} %</li>`).join('') + '</ul>' : ''}
    ${s.performanceLog.length ? '<details><summary>Omgångar och utmaningar</summary>' +
      s.performanceLog.slice().reverse().map((record, index) => `<details class="achievement-entry">
        <summary>${escapeHtml(WORLDS[record.world]?.name || 'Multiplikationsriket')} · ${record.kind === 'challenge' ? 'Utmaning' : escapeHtml(record.reason)}</summary>
        <p>${escapeHtml(date(record.startedAt))} – ${escapeHtml(date(record.endedAt))}</p>
        ${performanceSummary(record)}
        <button class="btn secondary small" data-action="share-history" data-performance-index="${s.performanceLog.length - index - 1}">Dela min prestation</button>
      </details>`).join('') + '</details>' : '<p>Statistik visas här efter din första omgång eller utmaning.</p>'}
  </section>`;
}

function achievementDetails(result) {
  const record = result.performance;
  const world = WORLDS[record?.world ?? s.world] || WORLDS[0];
  const tables = result.tables.length ? result.tables.join(', ') : String(world.n);
  const accuracy = record ? record.accuracy : performanceAccuracy(result);
  return { record, world, tables, accuracy,
    time: performanceTime(record ? record.activeMs : result.elapsed) };
}

function achievementText(result) {
  const { record, world, tables, accuracy, time } = achievementDetails(result);
  return `Multiplikationsriket · ${world.name}\nTabeller: ${tables}\n${result.correct} rätt · ${time} ${record ? 'aktiv svarstid' : 'total tid'} · ${accuracy == null ? '–' : accuracy + '%'} träffsäkerhet${record?.boss ? '\nBesegrad boss: ' + record.boss : ''}\n${PUBLIC_GAME_URL}`;
}

function loadCardImage(source) {
  const image = new Image();
  image.src = source;
  return image.decode().then(() => image, () => null);
}

async function achievementPNG(result) {
  const { record, world, tables, accuracy, time } = achievementDetails(result);
  const [background, hero] = await Promise.all([
    loadCardImage(BATTLE_ARENAS[world.n].layers.background),
    loadCardImage(HERO_IMAGE)
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#172922';
  ctx.fillRect(0, 0, 720, 900);
  if (background) {
    const scale = Math.max(720 / background.width, 900 / background.height);
    const width = background.width * scale, height = background.height * scale;
    ctx.drawImage(background, (720 - width) / 2, (900 - height) / 2, width, height);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, 900);
  shade.addColorStop(0, '#0a1519de');
  shade.addColorStop(.43, '#17292235');
  shade.addColorStop(.62, '#101e1aeb');
  shade.addColorStop(1, '#101e1a');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 720, 900);
  if (hero) ctx.drawImage(hero, 185, 160, 350, 350);
  ctx.strokeStyle = '#d1ac71';
  ctx.lineWidth = 3;
  ctx.strokeRect(21, 21, 678, 858);
  ctx.textAlign = 'center';
  function write(text, y, font, color = '#fff0ce') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, 360, y, 626);
  }
  write('Multiplikationsriket', 94, 'bold 48px Georgia');
  write(world.name, 146, 'bold 37px Georgia');
  write('GÅNGERTABELLER  ' + tables, 550, 'bold 23px system-ui', '#efd099');
  write(result.correct + ' rätt', 636, 'bold 66px Georgia');
  write(time + (record ? ' aktiv svarstid' : ' total tid'), 698, '27px system-ui');
  write((accuracy == null ? '–' : accuracy + ' %') + ' träffsäkerhet', 742, '27px system-ui');
  if (record?.boss) write('Besegrad boss: ' + record.boss, 786, 'bold 24px system-ui', '#efd099');
  write(PUBLIC_GAME_URL, 842, '20px system-ui', '#efd099');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function connectAchievementSharing(dialog, result) {
  const share = dialog.querySelector('[data-achievement-share]');
  const download = dialog.querySelector('[data-achievement-download]');
  const status = dialog.querySelector('[data-achievement-status]');
  const resultText = achievementText(result);
  let file;
  achievementPNG(result).then(blob => {
    if (!dialog.isConnected) return;
    if (!blob) throw new Error('PNG unavailable');
    file = new File([blob], 'multiplikationsriket-prestation.png', { type: 'image/png' });
    download.disabled = false;
    share.disabled = false;
  }).catch(() => { status.textContent = 'Bilden kunde inte skapas. Resultattexten går att kopiera.'; });
  share.onclick = async () => {
    if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Multiplikationsriket' });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    status.textContent = 'Spara bilden eller kopiera resultattexten för att dela.';
    download.focus();
  };
  download.onclick = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  dialog.querySelector('[data-achievement-copy]').onclick = async () => {
    try {
      await navigator.clipboard.writeText(resultText);
      status.textContent = 'Resultattexten är kopierad.';
    } catch {
      const field = dialog.querySelector('[data-achievement-text]');
      field.hidden = false;
      field.value = resultText;
      field.focus();
      field.select();
      status.textContent = 'Markera och kopiera resultattexten.';
    }
  };
}

const achievementShareButtons = `<div class="actions achievement-share">
  <button type="button" class="btn" data-achievement-share disabled>Dela min prestation</button>
  <button type="button" class="btn secondary" data-achievement-download disabled>Spara PNG</button>
  <button type="button" class="btn secondary" data-achievement-copy>Kopiera resultattext</button>
</div><p class="hint" data-achievement-status role="status"></p>
<textarea data-achievement-text aria-label="Resultattext" readonly hidden></textarea>`;

function showPerformanceShare(record) {
  if (!record || s.event || s.battle) return;
  const tables = Object.keys(record.tables);
  const dialog = challengeDialog('Dela min prestation', `
    ${performanceSummary(record)}${achievementShareButtons}
    <button type="button" class="btn secondary" data-achievement-close>Stäng</button>`);
  dialog.querySelector('[data-achievement-close]').onclick = dismissChallengeEvent;
  connectAchievementSharing(dialog, { correct: record.correct, tables, performance: record });
}

function initLocalFeatures() {
  const observer = new MutationObserver(() => {
    syncAnswerClock();
    maybeShowInstall();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('visibilitychange', () => {
    const wasRunning = answerClock?.running;
    syncAnswerClock();
    if (document.hidden && wasRunning) save();
  });
  window.addEventListener('pagehide', () => {
    if (!answerClock?.running) return;
    checkpointAnswerClock();
    answerClock.running = false;
    save();
  });
  window.addEventListener('pageshow', syncAnswerClock);
  syncAnswerClock();
  maybeShowInstall();
  setTimeout(() => {
    manualInstallReady = true;
    maybeShowInstall();
  }, 3000);
}
