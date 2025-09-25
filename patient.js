(function(){
  const $ = (sel)=>document.querySelector(sel);
  const modeEl = $('#meta-mode');
  const materialEl = $('#meta-material');
  const setsEl = $('#meta-sets');
  const listContainer = $('#list-container');
  const consentEl = $('#consent');
  const btnStart = $('#btn-start');
  const errEl = $('#error');
  const btnAudio = $('#btn-audio-test');
  const audio = $('#test-audio');

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
    modeEl.textContent = isValidMode(mode) ? mode : '–';
    materialEl.textContent = isValidMaterial(material) ? (material === 'woerter' ? 'Wörter' : 'Sätze') : '–';
    if (sets.length){
      setsEl.textContent = sets.length === 1 ? sets[0] : `${sets.length} Listen`;
    } else {
      setsEl.textContent = '–';
    }
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
    for (const { id, name } of names){
      const li = document.createElement('li');
      li.className = 'set-row';
      const span = document.createElement('span');
      span.className = 'set-name';
      span.textContent = name;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small';
      btn.textContent = 'Diese Liste starten';
      btn.addEventListener('click', ()=>{
        if (btnStart.disabled) return; // respektiere Consent
        const to = buildPlayerUrl(id);
        location.href = to;
      });
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    }
    frag.appendChild(ul);
    listContainer.appendChild(frag);
  }

  // Init
  fillMeta();
  const vErr = validateParams();
  if (vErr){
    showError(vErr + ' Bitte fordere ggf. einen neuen Link an.');
    btnStart.disabled = true;
  }

  consentEl.addEventListener('change', ()=>{
    btnStart.disabled = !consentEl.checked || !!vErr;
  });

  btnStart.addEventListener('click', ()=>{
    if (btnStart.disabled) return;
    // Weiterleitung zum Spieler – Telemetrie startet dort
    const to = buildPlayerUrl();
    location.href = to;
  });

  btnAudio?.addEventListener('click', async ()=>{
    try{
      audio?.play();
    }catch{}
  });
  // Nach dem Rendern der Meta: Listenbereich füllen
  renderListButtons();
})();
