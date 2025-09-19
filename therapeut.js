(function(){
  const materialSelect = document.getElementById('material-select');
  const setSelect = document.getElementById('set-select');
  const areaSelect = document.getElementById('area-select');
  const groupSelect = document.getElementById('group-select');
  const breadcrumbEl = document.getElementById('set-breadcrumb');
  const modeSelect = document.getElementById('mode-select');
  const patientInput = document.getElementById('patient-input');
  const btnGenerate = document.getElementById('btn-generate');
  const btnCopy = document.getElementById('btn-copy');
  const btnMail = document.getElementById('btn-mail');
  const btnGenerateAll = document.getElementById('btn-generate-all');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const btnMailAll = document.getElementById('btn-mail-all');
  const linkOutput = document.getElementById('link-output');
  const linksListEl = document.getElementById('links-list');
  const btnAddList = document.getElementById('btn-add-list');
  const btnAddExercise = document.getElementById('btn-add-exercise');
  const activeExerciseSetsEl = document.getElementById('active-exercise-sets');
  const exercisesListEl = document.getElementById('exercises-list');

  let flatSetsByMode = { woerter: {}, saetze: {} };
  let manifestByMode = { woerter: null, saetze: null };
  // --- Neues Datenmodell (MVP Multi-Übungen) ---
  const MAX_EXERCISES = 10;
  const MAX_LISTS_PER_EX = 10;
  let exercises = []; // [{ mode, material, sets: [{path, breadcrumb}], createdAt }]
  let activeExercise = null; // gleiches Shape wie in exercises
  let patientNameState = '';

  function resetActiveExercise(){
    activeExercise = {
      mode: (modeSelect && modeSelect.value) || 'quiz',
      material: (materialSelect && materialSelect.value) || 'woerter',
      sets: [],
      createdAt: Date.now()
    };
  }
  function canAddExercise(){ return exercises.length < MAX_EXERCISES; }
  function canAddList(){ return activeExercise && activeExercise.sets.length < MAX_LISTS_PER_EX; }
  function addListToActive({ path, breadcrumb }){
    if (!activeExercise) resetActiveExercise();
    if (!path) return { ok:false, reason:'missing_path' };
    if (!canAddList()) return { ok:false, reason:'limit_lists' };
    if (activeExercise.sets.some(s=>s.path===path)) return { ok:false, reason:'duplicate' };
    activeExercise.sets.push({ path, breadcrumb });
    return { ok:true };
  }
  function finalizeActiveExercise(){
    if (!activeExercise || activeExercise.sets.length === 0) return { ok:false, reason:'no_sets' };
    if (!canAddExercise()) return { ok:false, reason:'limit_exercises' };
    // Sync mode/material in case user changed selects
    activeExercise.mode = (modeSelect && modeSelect.value) || activeExercise.mode;
    activeExercise.material = (materialSelect && materialSelect.value) || activeExercise.material;
    exercises.push(activeExercise);
    resetActiveExercise();
    return { ok:true };
  }

  function renderActiveExerciseSets(){
    if (!activeExerciseSetsEl) return;
    if (!activeExercise || activeExercise.sets.length === 0){
      activeExerciseSetsEl.innerHTML = '';
      return;
    }
    const items = activeExercise.sets.map(s => `<li>${escapeHtml(s.breadcrumb || s.path)}</li>`).join('');
    activeExerciseSetsEl.innerHTML = `<div class="hint">Aktuelle Übung enthält:</div><ul class="list-inline">${items}</ul>`;
  }

  function renderExercises(){
    if (!exercisesListEl) return;
    if (exercises.length === 0){
      exercisesListEl.innerHTML = '<div class="hint">Noch keine Übungen hinzugefügt.</div>';
      return;
    }
    exercisesListEl.innerHTML = exercises.map((ex, idx) => {
      const setsHtml = ex.sets.map(s=>`<li>${escapeHtml(s.breadcrumb || s.path)}</li>`).join('');
      return `<div class="exercise-card">
        <div class="exercise-header">Übung ${idx+1} – ${escapeHtml(ex.mode)} / ${escapeHtml(ex.material)}</div>
        <ul class="list-inline">${setsHtml}</ul>
        <div class="exercise-actions">
          <button data-action="edit" data-index="${idx}" class="small">Bearbeiten</button>
          <button data-action="delete" data-index="${idx}" class="small danger">Löschen</button>
        </div>
      </div>`;
    }).join('');
  }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",
      ">":"&gt;","\"":"&quot;","'":"&#39;"}[s]));
  }

  function toAbsUrl(p){
    try{
      if(!p) return '';
      if(/^https?:\/\//i.test(p)) return p;
      const cleaned = String(p).replace(/^\/+/, '').replace(/\\+/g,'/');
      const basePath = (document.querySelector('base')?.href || window.location.pathname).replace(/\/[^\/]*$/, '');
      return basePath.replace(/\/$/, '') + '/' + cleaned;
    }catch{return p||''}
  }

  function populateAreas(manifest){
    // Top-Level Bereiche aus Manifest in areaSelect laden
    areaSelect.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Alle Bereiche';
    areaSelect.appendChild(def);
    areaSelect.disabled = false;
    const entries = Object.entries(manifest || {})
      .filter(([k,v]) => v && typeof v === 'object')
      .sort((a,b)=>{
        const la = (a[1].displayName || a[0] || '').toString();
        const lb = (b[1].displayName || b[0] || '').toString();
        return la.localeCompare(lb, 'de');
      });
    for(const [topKey, topNode] of entries){
      const opt = document.createElement('option');
      opt.value = topKey;
      opt.textContent = topNode.displayName || topKey;
      areaSelect.appendChild(opt);
    }
  }

  function collectSecondLevelGroups(manifest, topKey){
    const node = (manifest && manifest[topKey]) || null;
    const out = [];
    if (!node) return out;
    for(const key of Object.keys(node)){
      if (key === 'displayName' || key === 'unterkategorieName') continue;
      const child = node[key];
      if (!child || typeof child !== 'object') continue;
      // Kind kann entweder ein Blatt (mit path) sein oder weiterer Baum
      const display = child.displayName || key;
      out.push({ key, display });
    }
    // Sortiert nach Anzeigename
    out.sort((a,b)=> String(a.display).localeCompare(String(b.display), 'de'));
    return out;
  }

  function buildHierarchicalOptions(manifest, { onlyTopKey = '', onlyGroupKey = '' } = {}){
    // Baut <optgroup> für Top-Level und eingerückte Optionen für tiefere Ebenen
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Bitte wählen…';
    setSelect.innerHTML = '';
    setSelect.appendChild(defaultOpt);

    let safeEntries = Object.entries(manifest || {})
      .filter(([k,v]) => v && typeof v === 'object')
      .sort((a,b)=>{
        const la = (a[1].displayName || a[0] || '').toString();
        const lb = (b[1].displayName || b[0] || '').toString();
        return la.localeCompare(lb, 'de');
      });
    if (onlyTopKey) {
      safeEntries = safeEntries.filter(([k]) => k === onlyTopKey);
    }

    const collectLeaves = (node, ancestors = [], depth = 0, acc = []) => {
      const keys = Object.keys(node || {});
      keys.sort((a,b)=>{
        const va = node[a] && node[a].displayName ? node[a].displayName : a;
        const vb = node[b] && node[b].displayName ? node[b].displayName : b;
        return String(va).localeCompare(String(vb), 'de');
      });
      for(const key of keys){
        if (key === 'displayName' || key === 'unterkategorieName') continue;
        const child = node[key];
        if (!child || typeof child !== 'object') continue;
        if (child.path) {
          const name = child.displayName || key;
          acc.push({
            path: child.path,
            label: [...ancestors, name].join(' / '),
            name,
            depth
          });
        } else {
          const dn = child.displayName || key;
          collectLeaves(child, ancestors.concat(dn), depth + 1, acc);
        }
      }
      return acc;
    };

    const listImmediateSubgroups = (node) => {
      const names = [];
      for (const k of Object.keys(node||{})){
        if (k === 'displayName' || k === 'unterkategorieName') continue;
        const ch = node[k];
        if (!ch || typeof ch !== 'object') continue;
        if (!ch.path) {
          const nm = ch.displayName || k;
          if (!names.includes(nm)) names.push(nm);
        }
      }
      names.sort((a,b)=> String(a).localeCompare(String(b), 'de'));
      return names;
    };

    for(const [topKey, topNode] of safeEntries){
      const groupLabel = (topNode && topNode.displayName) ? topNode.displayName : topKey;
      const secondGroups = collectSecondLevelGroups(manifest, topKey);
      const groupFilter = onlyGroupKey ? secondGroups.filter(g=>g.key===onlyGroupKey) : secondGroups;
      // Wenn keine zweite Ebene vorhanden, ganzen Top-Baum rendern
      const renderNodes = groupFilter.length ? groupFilter : [{ key: '', display: '' }];
      for (const g of renderNodes){
        const og = document.createElement('optgroup');
        const subtree = g.key ? (topNode[g.key] || {}) : topNode;
        // Label-Logik: Wenn ein Bereich (onlyTopKey) aktiv ist, kürzeres Label w/ Unterkategorien, z.B. "S (initial, medial, final)"
        if (onlyTopKey && g.key) {
          const subs = listImmediateSubgroups(subtree);
          const suffix = subs.length ? ` (${subs.join(', ')})` : '';
          og.label = `${g.display}${suffix}`;
        } else {
          og.label = g.key ? `${groupLabel} — ${g.display}` : groupLabel;
        }
        const leaves = collectLeaves(subtree, [groupLabel, g.display].filter(Boolean), g.key ? 1 : 0, []);
        leaves.sort((a,b)=> a.label.localeCompare(b.label, 'de'));
        for(const leaf of leaves){
          const opt = document.createElement('option');
          opt.value = leaf.path;
          const indent = '\u00A0\u00A0'.repeat(Math.max(0, leaf.depth));
          const arrow = leaf.depth > 0 ? '› ' : '';
          opt.textContent = `${indent}${arrow}${leaf.name}`;
          og.appendChild(opt);
        }
        if (og.children.length > 0) setSelect.appendChild(og);
      }
    }
  }

  async function loadMode(mode){
    setSelect.innerHTML = '<option value="">Lade Sets…</option>';
    setSelect.disabled = true;
    try{
      const res = await fetch(`/api/get-all-data?mode=${mode}`);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      flatSetsByMode[mode] = data.flatSets || {};
      manifestByMode[mode] = data.manifest || null;

      // Versuche hierarchisch zu rendern; fallback auf flache Liste
      if (manifestByMode[mode]) {
        populateAreas(manifestByMode[mode]);
        // Group-Select zurücksetzen
        if (groupSelect){
          groupSelect.innerHTML = '<option value="">Alle Gruppen</option>';
          groupSelect.disabled = true;
        }
        buildHierarchicalOptions(manifestByMode[mode]);
      } else {
        const entries = Object.entries(flatSetsByMode[mode]);
        entries.sort((a,b)=> (a[1].displayName||'').localeCompare(b[1].displayName||'', 'de'));
        setSelect.innerHTML = '<option value="">Bitte wählen…</option>';
        for(const [path, meta] of entries){
          const opt = document.createElement('option');
          opt.value = path; opt.textContent = meta.displayName || path;
          setSelect.appendChild(opt);
        }
      }
      setSelect.disabled = false;
      btnGenerate.disabled = (setSelect.value==='');
    }catch(e){
      setSelect.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
  }

  function buildExerciseUrl(){
    // Rückwärtskompatibel: generiert den Link für die erste Übung oder aktuelle Auswahl
    const all = buildAllExerciseUrls();
    return all.length ? all[0].url : '';
  }

  function buildUrlFor(mode, material, paths, patient){
    if (!paths || paths.length === 0) return '';
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('material', material);
    if (paths.length === 1) params.set('set', paths[0]); else params.set('sets', paths.join(','));
    params.set('autostart','1'); params.set('uiLock','1'); if (patient) params.set('patient', patient);
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/therapeut\.html$/, 'index.html');
    url.search = '?' + params.toString(); url.hash = '';
    return url.toString();
  }

  function buildAllExerciseUrls(){
    const patient = (patientInput.value||'').trim();
    const list = [];
    // alle finalisierten Übungen
    exercises.forEach((ex, idx) => {
      const paths = ex.sets.map(s=>s.path);
      const url = buildUrlFor(ex.mode, ex.material, paths, patient);
      if (url) list.push({ index: idx+1, mode: ex.mode, material: ex.material, url });
    });
    // aktive Übung (wenn Sets vorhanden, aber noch nicht finalisiert)
    if (activeExercise && activeExercise.sets && activeExercise.sets.length){
      const paths = activeExercise.sets.map(s=>s.path);
      const url = buildUrlFor(activeExercise.mode, activeExercise.material, paths, patient);
      if (url) list.push({ index: exercises.length + 1, mode: activeExercise.mode, material: activeExercise.material, url, isActive: true });
    }
    return list;
  }

  function renderLinksList(){
    if (!linksListEl) return;
    const items = buildAllExerciseUrls();
    if (items.length === 0){
      linksListEl.innerHTML = '<div class="hint">Noch keine Übungen vorhanden.</div>';
      if (btnGenerateAll) btnGenerateAll.disabled = true;
      if (btnCopyAll) btnCopyAll.disabled = true;
      if (btnMailAll) btnMailAll.disabled = true;
      return;
    }
    const rows = items.map((it, i) => {
      const label = `Übung ${it.index} – ${escapeHtml(it.mode)} / ${escapeHtml(it.material)}${it.isActive?' (aktuell)':''}`;
      return `<div class="link-row">
        <span style="min-width:220px">${label}</span>
        <input type="text" readonly value="${escapeHtml(it.url)}" />
        <button data-action="copy-link" data-i="${i}" class="small">Kopieren</button>
        <button data-action="mail-link" data-i="${i}" class="small">E‑Mail</button>
      </div>`;
    }).join('');
    linksListEl.innerHTML = rows;
    if (btnGenerateAll) btnGenerateAll.disabled = false;
    if (btnCopyAll) btnCopyAll.disabled = false;
    if (btnMailAll) btnMailAll.disabled = false;
  }

  function updateButtons(){
    const valid = !!setSelect.value;
    btnGenerate.disabled = !valid;
    btnCopy.disabled = !linkOutput.value;
    btnMail.disabled = !linkOutput.value;
    // Multi-Links Buttons abhängig von vorhandenen Übungen
    const hasAny = (exercises.length>0) || (activeExercise && activeExercise.sets && activeExercise.sets.length>0);
    if (btnGenerateAll) btnGenerateAll.disabled = !hasAny;
    if (btnCopyAll) btnCopyAll.disabled = !hasAny;
    if (btnMailAll) btnMailAll.disabled = !hasAny;
  }

  materialSelect.addEventListener('change', ()=>{
    loadMode(materialSelect.value);
  });
  setSelect.addEventListener('change', updateButtons);
  areaSelect.addEventListener('change', () => {
    const mode = materialSelect.value;
    const manifest = manifestByMode[mode];
    const key = areaSelect.value;
    if (manifest) {
      // Buchstaben-/Gruppenliste füllen
      if (groupSelect){
        if (key){
          const groups = collectSecondLevelGroups(manifest, key);
          groupSelect.innerHTML = '<option value="">Alle Gruppen</option>';
          for (const g of groups){
            const opt = document.createElement('option');
            opt.value = g.key;
            opt.textContent = g.display;
            groupSelect.appendChild(opt);
          }
          groupSelect.disabled = groups.length === 0;
        } else {
          groupSelect.innerHTML = '<option value="">Alle Gruppen</option>';
          groupSelect.disabled = true;
        }
      }
      buildHierarchicalOptions(manifest, { onlyTopKey: key || '' });
    }
    breadcrumbEl.textContent = '';
  });

  if (groupSelect){
    groupSelect.addEventListener('change', () => {
      const mode = materialSelect.value;
      const manifest = manifestByMode[mode];
      const top = areaSelect.value || '';
      const grp = groupSelect.value || '';
      if (manifest) buildHierarchicalOptions(manifest, { onlyTopKey: top, onlyGroupKey: grp });
      breadcrumbEl.textContent = '';
    });
  }

  setSelect.addEventListener('change', () => {
    updateButtons();
    // Breadcrumb aktualisieren
    const selected = setSelect.value;
    const mode = materialSelect.value;
    const manifest = manifestByMode[mode];
    if (!selected || !manifest) { breadcrumbEl.textContent = ''; return; }
    // Suche den Pfad im Manifest
    const findPath = (node, trail=[]) => {
      for(const key of Object.keys(node||{})){
        if (key === 'displayName' || key === 'unterkategorieName') continue;
        const child = node[key];
        if (!child || typeof child !== 'object') continue;
        const dn = child.displayName || key;
        if (child.path === selected) return trail.concat(dn);
        const deeper = findPath(child, trail.concat(dn));
        if (deeper) return deeper;
      }
      return null;
    };
    const pathParts = findPath(manifest) || [];
    breadcrumbEl.textContent = pathParts.length ? pathParts.join(' / ') : '';
  });

  btnGenerate.addEventListener('click', ()=>{
    const url = buildExerciseUrl();
    linkOutput.value = url;
    updateButtons();
  });

  if (btnGenerateAll){
    btnGenerateAll.addEventListener('click', ()=>{
      renderLinksList();
      // setze das Einzelfeld für Bequemlichkeit auf den ersten Link
      const items = buildAllExerciseUrls();
      linkOutput.value = items.length ? items[0].url : '';
      updateButtons();
    });
  }

  btnCopy.addEventListener('click', async ()=>{
    if(!linkOutput.value) return;
    try{ await navigator.clipboard.writeText(linkOutput.value);}catch{}
  });

  btnMail.addEventListener('click', ()=>{
    if(!linkOutput.value) return;
    const subject = encodeURIComponent('Übung im Wortschatz‑Trainer');
    const body = encodeURIComponent(`Hier ist deine Übung:\n\n${linkOutput.value}\n\nViel Erfolg!`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });

  if (linksListEl){
    linksListEl.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const items = buildAllExerciseUrls();
      const idx = Number(btn.dataset.i);
      if (Number.isNaN(idx) || !items[idx]) return;
      const url = items[idx].url;
      const action = btn.dataset.action;
      if (action === 'copy-link'){
        try{ await navigator.clipboard.writeText(url);}catch{}
        return;
      }
      if (action === 'mail-link'){
        const subject = encodeURIComponent('Übung im Wortschatz‑Trainer');
        const body = encodeURIComponent(`Hier ist deine Übung:\n\n${url}\n\nViel Erfolg!`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      }
    });
  }

  if (btnCopyAll){
    btnCopyAll.addEventListener('click', async ()=>{
      const items = buildAllExerciseUrls();
      if (!items.length) return;
      const joined = items.map(it => `• Übung ${it.index} (${it.mode}/${it.material}):\n${it.url}`).join('\n\n');
      try{ await navigator.clipboard.writeText(joined); }catch{}
    });
  }

  if (btnMailAll){
    btnMailAll.addEventListener('click', ()=>{
      const items = buildAllExerciseUrls();
      if (!items.length) return;
      const subject = encodeURIComponent('Übungen im Wortschatz‑Trainer');
      const bodyText = items.map(it => `Übung ${it.index} (${it.mode}/${it.material}):\n${it.url}`).join('\n\n');
      const body = encodeURIComponent(`Hier sind deine Übungen:\n\n${bodyText}\n\nViel Erfolg!`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    });
  }

  if (btnAddList){
    btnAddList.addEventListener('click', ()=>{
      const setPath = setSelect.value || '';
      if (!setPath) return;
      // Breadcrumb ermitteln (falls vorhanden)
      const mode = materialSelect.value;
      const manifest = manifestByMode[mode];
      let breadcrumb = '';
      if (manifest){
        const findPath = (node, trail=[]) => {
          for(const key of Object.keys(node||{})){
            if (key === 'displayName' || key === 'unterkategorieName') continue;
            const child = node[key];
            if (!child || typeof child !== 'object') continue;
            const dn = child.displayName || key;
            if (child.path === setPath) return trail.concat(dn);
            const deeper = findPath(child, trail.concat(dn));
            if (deeper) return deeper;
          }
          return null;
        };
        const parts = findPath(manifest) || [];
        breadcrumb = parts.join(' / ');
      }
      if (!activeExercise) resetActiveExercise();
      activeExercise.mode = modeSelect.value || activeExercise.mode;
      activeExercise.material = materialSelect.value || activeExercise.material;
      const res = addListToActive({ path: setPath, breadcrumb });
      if (!res.ok){
        if (res.reason === 'duplicate') alert('Diese Liste ist bereits in der aktuellen Übung.');
        if (res.reason === 'limit_lists') alert('Maximal 10 Listen pro Übung.');
        return;
      }
      renderActiveExerciseSets();
      renderLinksList();
    });
  }

  if (btnAddExercise){
    btnAddExercise.addEventListener('click', ()=>{
      const r = finalizeActiveExercise();
      if (!r.ok){
        if (r.reason === 'no_sets') alert('Bitte mindestens eine Liste zur Übung hinzufügen.');
        if (r.reason === 'limit_exercises') alert('Maximal 10 Übungen insgesamt.');
        return;
      }
      renderActiveExerciseSets();
      renderExercises();
      renderLinksList();
    });
  }

  if (exercisesListEl){
    exercisesListEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      const action = btn.dataset.action;
      if (Number.isNaN(idx) || !exercises[idx]) return;
      if (action === 'delete'){
        exercises.splice(idx,1);
        renderExercises();
        return;
      }
      if (action === 'edit'){
        // Holen und in den Builder laden
        const ex = exercises.splice(idx,1)[0];
        modeSelect.value = ex.mode;
        materialSelect.value = ex.material;
        // Triggert Laden der Bereiche/Liste; sets werden nicht automatisch re-selektiert (MVP)
        loadMode(ex.material).then(()=>{
          resetActiveExercise();
          activeExercise.mode = ex.mode;
          activeExercise.material = ex.material;
          for (const s of ex.sets){ addListToActive(s); }
          renderActiveExerciseSets();
          renderExercises();
          renderLinksList();
        });
      }
    });
  }

  // Initial
  // Hinweis bei file:// Aufruf (CORS/Same-Origin-Problem)
  if (window.location.protocol === 'file:') {
    if (areaSelect) {
      areaSelect.innerHTML = '<option value="">Bitte über http öffnen…</option>';
      areaSelect.disabled = true;
    }
    if (setSelect) {
      setSelect.innerHTML = '<option value="">Server benötigt (http://localhost:3000)</option>';
      setSelect.disabled = true;
    }
    if (breadcrumbEl) {
      breadcrumbEl.textContent = 'Bitte starten Sie den Server und öffnen Sie die Seite über http: http://localhost:3000/therapeut.html';
    }
    btnGenerate.disabled = true;
    btnCopy.disabled = true;
    btnMail.disabled = true;
    return; // Kein Laden versuchen
  }

  resetActiveExercise();
  loadMode(materialSelect.value).then(()=>{
    renderExercises();
    renderActiveExerciseSets();
    renderLinksList();
  });
})();
