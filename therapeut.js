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
  const linkOutput = document.getElementById('link-output');

  let flatSetsByMode = { woerter: {}, saetze: {} };
  let manifestByMode = { woerter: null, saetze: null };

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
    const mode = modeSelect.value || 'quiz';
    const material = materialSelect.value || 'woerter';
    const setPath = setSelect.value || '';
    const patient = (patientInput.value||'').trim();
    if(!setPath) return '';

    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('material', material);
    params.set('set', setPath);
    params.set('autostart','1');
    params.set('uiLock','1');
    if(patient) params.set('patient', patient);

    // Ziel ist index.html im selben Verzeichnis
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/therapeut\.html$/,'index.html');
    url.search = '?' + params.toString();
    url.hash = '';
    return url.toString();
  }

  function updateButtons(){
    const valid = !!setSelect.value;
    btnGenerate.disabled = !valid;
    btnCopy.disabled = !linkOutput.value;
    btnMail.disabled = !linkOutput.value;
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

  loadMode(materialSelect.value);
})();
