const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = 3000;

// KORRIGIERT: Der Pfad zur Manifest-Datei wurde an die neue Struktur angepasst.
const setsManifestPath = path.join(__dirname, 'data', 'sets.json'); 
const dbPath = path.join(__dirname, 'data', 'items_database.json');
const imagesBasePaths = [
    // path.join(__dirname, 'data', 'images'),
    path.join(__dirname, 'data', 'wörter', 'images'),
    path.join(__dirname, 'data', 'sätze', 'images')
];
const soundsBasePaths = [
    path.join(__dirname, 'data', 'sounds'),
    path.join(__dirname, 'data', 'wörter', 'sounds'),
    path.join(__dirname, 'data', 'sätze', 'sounds')
];


app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/api/get-all-data', async (req, res) => {
    try {
        // Mode auslesen: 'woerter' oder 'saetze'
        const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
        let dbPathMode, setsManifestPathMode;
        if (mode === 'woerter') {
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets.json');
        } else {
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets_saetze.json');
        }

        const dbContent = await fs.readFile(dbPathMode, 'utf8');
        const database = JSON.parse(dbContent);

        const manifestContent = await fs.readFile(setsManifestPathMode, 'utf8');
        const manifest = JSON.parse(manifestContent);

        const flatSets = {};
        
        const findAndLoadSets = async (node, nameParts = [], topCategory = '') => {
            for (const key in node) {
                const child = node[key];
                if (!child || typeof child !== 'object') continue;
                const currentTopCategory = (node === manifest) ? child.displayName : topCategory;
                if (child.path) {
                    const finalDisplayName = [...nameParts, child.displayName].join(' ');
                    try {
                        const setContent = await fs.readFile(path.join(__dirname, child.path), 'utf8');
                        flatSets[child.path] = {
                            displayName: finalDisplayName,
                            topCategory: currentTopCategory,
                            items: JSON.parse(setContent)
                        };
                    } catch (e) {
                        console.warn(`Warnung: Set-Datei ${child.path} nicht gefunden.`);
                        flatSets[child.path] = { displayName: finalDisplayName, topCategory: currentTopCategory, items: [] };
                    }
                } else {
                    const newNameParts = (child.displayName && child.displayName.length <= 5)
                        ? [...nameParts, child.displayName]
                        : nameParts;
                    await findAndLoadSets(child, newNameParts, currentTopCategory);
                }
            }
        };

        await findAndLoadSets(manifest);
        res.json({ database, manifest, flatSets });
    } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        res.status(500).json({ message: "Konnte die Daten nicht laden." });
    }
});

// GEÄNDERT: Der Scan-Endpunkt liefert jetzt auch den Ordnernamen mit
app.get('/api/scan-for-new-files', async (req, res) => {
    try {
        // Mode auslesen: 'woerter' oder 'saetze'
        const mode = req.query.mode === 'saetze' ? 'saetze' : 'woerter';
        let dbPathMode;
        let imagesBasePathsMode;
        let soundsBasePathsMode;
        if (mode === 'woerter') {
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            imagesBasePathsMode = [path.join(__dirname, 'data', 'wörter', 'images')];
            soundsBasePathsMode = [path.join(__dirname, 'data', 'wörter', 'sounds')];
        } else {
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            imagesBasePathsMode = [path.join(__dirname, 'data', 'sätze', 'images')];
            soundsBasePathsMode = [path.join(__dirname, 'data', 'sätze', 'sounds')];
        }
        const dbContent = await fs.readFile(dbPathMode, 'utf8');
        const database = JSON.parse(dbContent);
        const existingIds = new Set(Object.keys(database));

        const getAllFiles = async (dirPath, fileList = []) => {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    await getAllFiles(filePath, fileList);
                } else {
                    if (path.basename(file).startsWith('.')) continue;
                    fileList.push(filePath);
                }
            }
            return fileList;
        };

        let imageFiles = [];
        let soundFiles = [];
        for (const imgPath of imagesBasePathsMode) {
            try {
                imageFiles = imageFiles.concat(await getAllFiles(imgPath));
            } catch (e) {}
        }
        for (const sndPath of soundsBasePathsMode) {
            try {
                soundFiles = soundFiles.concat(await getAllFiles(sndPath));
            } catch (e) {}
        }

        const foundAssets = {};

        // Hilfsfunktion: Generiere eine ID aus dem Dateinamen
        const makeId = (filename) => filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();

        // Bestimme Basis-Pfade für Sätze oder Wörter
        const isSaetze = mode === 'saetze';
        const imageBase = isSaetze ? 'data/sätze/images/' : 'data/wörter/images/';
        const soundBase = isSaetze ? 'data/sätze/sounds/' : 'data/wörter/sounds/';

        // Bilddateien zuordnen
        for (const file of imageFiles) {
            const base = path.parse(file).name;
            const id = makeId(base);
            if (!foundAssets[id]) foundAssets[id] = {};
            let relPath = path.relative(__dirname, file).replace(/\\/g, '/');
            // Pfad ggf. anpassen
            if (!relPath.startsWith(imageBase)) {
                const parts = relPath.split('/');
                const idx = parts.indexOf(isSaetze ? 'sätze' : 'wörter');
                if (idx >= 0) relPath = parts.slice(idx).join('/');
                relPath = 'data/' + relPath;
            }
            foundAssets[id].image = relPath;
        }
        // Sounddateien zuordnen
        for (const file of soundFiles) {
            const base = path.parse(file).name;
            const id = makeId(base);
            if (!foundAssets[id]) foundAssets[id] = {};
            let relPath = path.relative(__dirname, file).replace(/\\/g, '/');
            if (!relPath.startsWith(soundBase)) {
                const parts = relPath.split('/');
                const idx = parts.indexOf(isSaetze ? 'sätze' : 'wörter');
                if (idx >= 0) relPath = parts.slice(idx).join('/');
                relPath = 'data/' + relPath;
            }
            foundAssets[id].sound = relPath;
        }

        // Ordner zuordnen (optional, z.B. Reime)
        for (const file of imageFiles.concat(soundFiles)) {
            const base = path.parse(file).name;
            const id = makeId(base);
            const folder = path.basename(path.dirname(file)).toLowerCase();
            if (!foundAssets[id].folder) foundAssets[id].folder = folder;
        }

        // Neue Items generieren
        const newItems = {};
        for (const id in foundAssets) {
            const hasNormalId = existingIds.has(id);
            const hasPrefixedId = existingIds.has(`item_${id}`);
            if (!hasNormalId && !hasPrefixedId) {
                newItems[id] = {
                    name: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    image: foundAssets[id].image || '',
                    sound: foundAssets[id].sound || '',
                    folder: foundAssets[id].folder || ''
                };
            }
        }

        console.log(`${Object.keys(newItems).length} neue Items gefunden.`);
        res.json({ newItems });

    } catch (error) {
        console.error("Fehler beim Scannen der Dateien:", error);
        res.status(500).json({ message: "Fehler beim Scannen der Asset-Ordner." });
    }
});


app.post('/api/save-all-data', async (req, res) => {
    const { database, manifest } = req.body;
    try {
        // Mode auslesen: 'woerter' oder 'saetze'
        const mode = (manifest && manifest.displayName && manifest.displayName.toLowerCase().includes('satz')) ? 'saetze' : 'woerter';
        let dbPathMode, setsManifestPathMode;
        if (mode === 'woerter') {
            dbPathMode = path.join(__dirname, 'data', 'items_database.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets.json');
        } else {
            dbPathMode = path.join(__dirname, 'data', 'items_database_saetze.json');
            setsManifestPathMode = path.join(__dirname, 'data', 'sets_saetze.json');
        }
        await fs.writeFile(dbPathMode, JSON.stringify(database, null, 2));
        const manifestToSave = JSON.parse(JSON.stringify(manifest));

        const saveSetContent = async (node) => {
            for (const key in node) {
                const child = node[key];
                if (child && child.path && Array.isArray(child.items)) {
                    await fs.writeFile(path.join(__dirname, child.path), JSON.stringify(child.items, null, 2));
                    delete child.items;
                }
                if (typeof child === 'object' && child !== null) {
                     await saveSetContent(child);
                }
            }
        };
        
        await saveSetContent(manifestToSave);
        await fs.writeFile(setsManifestPathMode, JSON.stringify(manifestToSave, null, 2));

        console.log("Daten erfolgreich gespeichert!");
        res.json({ message: 'Alle Daten erfolgreich aktualisiert!' });
    } catch (error) {
        console.error("Fehler beim Speichern der Daten:", error);
        res.status(500).json({ message: "Fehler beim Speichern der Dateien." });
    }
});

app.post('/api/sort-unsorted-images', async (req, res) => {
    const unsortedDir = path.join(__dirname, 'data', 'wörter', 'images', 'images_unsortiert');
    const baseDir = path.join(__dirname, 'data', 'wörter', 'images');
    try {
        const files = await fs.readdir(unsortedDir);
        const moved = [];
        for (const file of files) {
            if (file.startsWith('.')) continue; // skip hidden/system files
            const first = file.charAt(0).toLowerCase();
            const targetDir = path.join(baseDir, first);
            const sourcePath = path.join(unsortedDir, file);
            const targetPath = path.join(targetDir, file);
            // Zielordner anlegen, falls nicht vorhanden
            try { await fs.mkdir(targetDir, { recursive: true }); } catch {}
            // Nur verschieben, wenn Datei im Zielordner nicht existiert
            try {
                await fs.access(targetPath);
                // Datei existiert schon, überspringen
                continue;
            } catch {
                await fs.rename(sourcePath, targetPath);
                moved.push(file);
            }
        }
        res.json({ moved });
    } catch (error) {
        console.error('Fehler beim Einsortieren der Bilder:', error);
        res.status(500).json({ message: 'Fehler beim Einsortieren der Bilder.' });
    }
});

app.post('/api/sort-unsorted-sounds', async (req, res) => {
    const unsortedDir = path.join(__dirname, 'data', 'wörter', 'sounds', 'sounds_unsortiert');
    const baseDir = path.join(__dirname, 'data', 'wörter', 'sounds');
    try {
        const files = await fs.readdir(unsortedDir);
        const moved = [];
        for (const file of files) {
            if (file.startsWith('.')) continue; // skip hidden/system files
            const first = file.charAt(0).toLowerCase();
            const targetDir = path.join(baseDir, first);
            const sourcePath = path.join(unsortedDir, file);
            const targetPath = path.join(targetDir, file);
            // Zielordner anlegen, falls nicht vorhanden
            try { await fs.mkdir(targetDir, { recursive: true }); } catch {}
            // Nur verschieben, wenn Datei im Zielordner nicht existiert
            try {
                await fs.access(targetPath);
                // Datei existiert schon, überspringen
                continue;
            } catch {
                await fs.rename(sourcePath, targetPath);
                moved.push(file);
            }
        }
        res.json({ moved });
    } catch (error) {
        console.error('Fehler beim Einsortieren der Sounds:', error);
        res.status(500).json({ message: 'Fehler beim Einsortieren der Sounds.' });
    }
});