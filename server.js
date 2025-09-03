const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = 3000;

const setsManifestPath = path.join(__dirname, 'sets.json');
const dbPath = path.join(__dirname, 'data', 'items_database.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/api/get-all-data', async (req, res) => {
    try {
        const dbContent = await fs.readFile(dbPath, 'utf8');
        const database = JSON.parse(dbContent);

        const manifestContent = await fs.readFile(setsManifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        const flatSets = {};
        
        // NEUE, ROBUSTERE LOGIK ZUM FINDEN UND BENENNEN DER SETS
        const findAndLoadSets = async (node, nameParts = [], topCategory = '') => {
            for (const key in node) {
                const child = node[key];
                if (!child || typeof child !== 'object') continue;

                // Bestimme die Top-Level-Kategorie (Artikulation, Wortschatz, etc.)
                const currentTopCategory = (node === manifest) ? child.displayName : topCategory;

                if (child.path) { // Wir haben ein Set gefunden
                    // Baue den Namen aus den relevanten Teilen zusammen
                    // (z.B. ['Sch', 'Initial'] -> "Sch Initial")
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
                } else { // Wir haben eine Gruppe/Kategorie, tauche tiefer ein
                    // Heuristik: Kurze Namen wie "Sch", "R" sind Teil des Namens.
                    // Lange Namen wie "Positionen" oder "Laute" werden übersprungen.
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

// Der Endpunkt zum Speichern muss nicht geändert werden
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