(function(){
  const $ = (sel)=>document.querySelector(sel);
  // Meta-Anzeige entfernt (Mode/Material/Listen)
  const listContainer = $('#list-container');
  const consentEl = $('#consent');
  const errEl = $('#error');
  const btnAudio = $('#btn-audio-test');
  const audio = $('#test-audio');
  // Menu elements
  const menuToggle = $('#menu-toggle');
  const menuPanel = $('#menu-panel');
  const menuClose = $('#menu-close');
  const menuDone = $('#menu-done');
  const consentHint = $('#consent-hint');
  const openConsentBtn = $('#open-consent');
  let lastFocusedBeforeMenu = null;

  const params = new URLSearchParams(location.search);
  const mode = (params.get('mode')||'').toLowerCase();
  const material = (params.get('material')||'').toLowerCase();
  const set = params.get('set')||''; // single
  const setsParam = params.get('sets')||''; // comma-separated
  const pid = params.get('pid')||''; // optional
  const aid = params.get('aid')||''; // optional
  const title = params.get('title')||''; // optional

  // Normalize sets
  const sets = [];
  if (set) sets.push(set);
  if (setsParam){
    for (const s of setsParam.split(',')){
      const v = String(s||'').trim();
      if (v) sets.push(v);
    }
  }

  const isValidMode = (x)=> x==='quiz' || x==='manual' || x==='auto';
  const isValidMaterial = (x)=> x==='woerter' || x==='saetze';

  function showError(msg){ errEl.textContent = msg; }

  function fillMeta(){
    const h = document.getElementById('title');
    if (title && h) h.textContent = title;
    if (!title && h) {
      const matTxt = material === 'woerter' ? 'Wörter' : (material === 'saetze' ? 'Sätze' : material || 'Material');
      const listLabel = sets.length ? (sets.length === 1 ? sets[0] : `${sets.length} Listen`) : '';
      h.textContent = listLabel ? `Übung – ${mode}/${matTxt}, ${listLabel}` : `Übung – ${mode}/${matTxt}`;
    }
    // Mode/Material/Listen werden nicht mehr separat angezeigt
  }

  function validateParams(){
    if (!isValidMode(mode)) return 'Ungültiger Modus im Link.';
    if (!isValidMaterial(material)) return 'Ungültiges Material im Link.';
    if (!sets.length) return 'Es wurde keine Liste übergeben.';
    // pid/aid sind optional, keine PII anzeigen
    return '';
  }

  function buildPlayerUrl(singleSet){
    const qp = new URLSearchParams();
    qp.set('mode', mode);
    qp.set('material', material);
    const useSets = Array.isArray(sets) && sets.length > 0 ? sets : [];
    if (singleSet) {
      qp.set('set', singleSet);
    } else if (useSets.length === 1) {
      qp.set('set', useSets[0]);
    } else {
      qp.set('sets', useSets.join(','));
    }
    qp.set('autostart','1');
    qp.set('uiLock','1');
    qp.set('returnTo','patient');
    try {
      const back = new URL(location.href);
      back.hash = ''; back.search = location.search; // preserve params
      qp.set('returnUrl', back.toString());
    } catch {}
    if (pid) qp.set('pid', pid);
    if (aid) qp.set('aid', aid);
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/patient\.html$/, 'index.html');
    url.search = '?' + qp.toString();
    url.hash = '';
    return url.toString();
  }

  async function fetchSetNames(listIds){
    try{
      if (!Array.isArray(listIds) || listIds.length === 0) return [];
      const qs = new URLSearchParams({ material, paths: listIds.join(',') });
      const res = await fetch('/api/sets/meta?'+qs.toString());
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const map = new Map();
      for (const it of items){ map.set(it.path, it.displayName || it.path); }
      return listIds.map(id => ({ id, name: map.get(id) || id }));
    }catch{ return listIds.map(id => ({ id, name: id })); }
  }

  async function renderListButtons(){
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (sets.length === 0) return;
    const names = await fetchSetNames(sets);
    const frag = document.createDocumentFragment();
    const ul = document.createElement('ul');
    ul.className = 'sets-list';
    names.forEach(({ id, name }, idx) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'set-button';
      // Textstruktur: Primär "Übung N" + Sekundär Set-Name (falls verfügbar)
      const title = document.createElement('span');
      title.className = 'set-button-title';
      title.textContent = `Übung ${idx + 1}`;
      const sub = document.createElement('span');
      sub.className = 'set-button-sub';
      if (name && name !== id) {
        sub.textContent = name;
      } else {
        sub.textContent = '';
        sub.hidden = true;
      }
      btn.appendChild(title);
      btn.appendChild(sub);
      btn.addEventListener('click', () => {
        if (!isConsentOk()) { updateConsentStateUI(); openMenu(); return; }
        const to = buildPlayerUrl(id);
        location.href = to;
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    frag.appendChild(ul);
    listContainer.appendChild(frag);
  }

  // Init
  fillMeta();
  const vErr = validateParams();
  if (vErr){
    showError(vErr + ' Bitte fordere ggf. einen neuen Link an.');
  }

  function isConsentOk(){ return !!consentEl?.checked && !vErr; }
  function updateConsentStateUI(){
    const ok = isConsentOk();
    if (consentHint){
      consentHint.hidden = ok;
    }
  }
  consentEl?.addEventListener('change', updateConsentStateUI);
  updateConsentStateUI();

  // Start-Button entfällt – Start erfolgt direkt über die Übungs-Buttons

  btnAudio?.addEventListener('click', async ()=>{
    try{
      audio?.play();
    }catch{}
  });
  // Nach dem Rendern der Meta: Listenbereich füllen
  renderListButtons();

  // Menu behavior
  function openMenu(){
    if (!menuPanel) return;
    lastFocusedBeforeMenu = document.activeElement;
    menuPanel.hidden = false;
    menuToggle?.setAttribute('aria-expanded','true');
    // focus first focusable in menu
    const first = menuPanel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus();
    document.addEventListener('keydown', onKeyDownTrap);
  }
  function closeMenu(){
    if (!menuPanel) return;
    menuPanel.hidden = true;
    menuToggle?.setAttribute('aria-expanded','false');
    document.removeEventListener('keydown', onKeyDownTrap);
    if (lastFocusedBeforeMenu && typeof lastFocusedBeforeMenu.focus === 'function'){
      lastFocusedBeforeMenu.focus();
    } else {
      menuToggle?.focus();
    }
  }
  function onKeyDownTrap(e){
    if (e.key === 'Escape'){ e.preventDefault(); closeMenu(); return; }
    if (e.key === 'Tab'){
      // simple focus trap
      const focusables = menuPanel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusables).filter(el=>!el.hasAttribute('disabled'));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length-1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }

  menuToggle?.addEventListener('click', openMenu);
  menuClose?.addEventListener('click', closeMenu);
  menuDone?.addEventListener('click', ()=>{ updateConsentStateUI(); closeMenu(); });
  openConsentBtn?.addEventListener('click', openMenu);
})();
