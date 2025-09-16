// Jest-Setup: Konsole im Testmodus zivilisieren
// Wir stutzen laute Logs (insbesondere Info-Logs) ein, lassen aber Fehler durch.

const isCI = process.env.CI === 'true' || process.env.CI === '1';

beforeAll(() => {
  // Im CI oder lokal: info/log schlucken, warn optional anzeigen
  const noop = () => {};
  jest.spyOn(console, 'log').mockImplementation(noop);
  jest.spyOn(console, 'info').mockImplementation(noop);
  // Warnungen nur im CI zeigen, lokal auch dämpfen
  if (!isCI) {
    jest.spyOn(console, 'warn').mockImplementation(noop);
  }
  // Fehler niemals schlucken
});

afterAll(() => {
  // Automatisch durch Jest wiederhergestellt, da spyOn gemockte Implementierungen nach Testlauf zurücksetzt
});
