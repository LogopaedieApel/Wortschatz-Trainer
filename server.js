const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = 3000;

// KORRIGIERT: Der Pfad zur Manifest-Datei wurde an die neue Struktur angepasst.
const setsManifestPath = path.join(__dirname, 'data', 'sets.json'); 
const dbPath = path.join(__dirname, 'data', 'items_database.json');
const imagesBasePaths = [
    path.join(__dirname, 'data', 'images'),
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
        const dbContent = await fs.readFile(dbPath, 'utf8');
        const database = JSON.parse(dbContent);

        const manifestContent = await fs.readFile(setsManifestPath, 'utf8');
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
        const dbContent = await fs.readFile(dbPath, 'utf8');
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
        for (const imgPath of imagesBasePaths) {
            try {
                imageFiles = imageFiles.concat(await getAllFiles(imgPath));
            } catch (e) {}
        }
        for (const sndPath of soundsBasePaths) {
            try {
                soundFiles = soundFiles.concat(await getAllFiles(sndPath));
            } catch (e) {}
        }

        const foundAssets = {}; 

        const processFiles = (files, type) => {
            for (const file of files) {
                const id = path.parse(file).name.toLowerCase();
                const folder = path.basename(path.dirname(file)).toLowerCase();
                
                if (!foundAssets[id]) foundAssets[id] = {};
                
                foundAssets[id][type] = path.relative(__dirname, file).replace(/\\/g, '/');
                if (!foundAssets[id].folder || type === 'image') {
                    foundAssets[id].folder = folder;
                }
            }
        };

        processFiles(imageFiles, 'image');
        processFiles(soundFiles, 'sound');

        const newItems = {};
        for (const id in foundAssets) {
            const hasNormalId = existingIds.has(id);
            const hasPrefixedId = existingIds.has(`item_${id}`);

            if (!hasNormalId && !hasPrefixedId) {
                newItems[id] = {
                    name: id.charAt(0).toUpperCase() + id.slice(1),
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
        await fs.writeFile(dbPath, JSON.stringify(database, null, 2));
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
        await fs.writeFile(setsManifestPath, JSON.stringify(manifestToSave, null, 2));

        console.log("Daten erfolgreich gespeichert!");
        res.json({ message: 'Alle Daten erfolgreich aktualisiert!' });
    } catch (error) {
        console.error("Fehler beim Speichern der Daten:", error);
        res.status(500).json({ message: "Fehler beim Speichern der Dateien." });
    }
});

app.listen(PORT, () => {
    console.log(`Editor-Server läuft! Öffne http://localhost:${PORT}/editor.html in deinem Browser.`);
});