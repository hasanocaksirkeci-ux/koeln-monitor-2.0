import app from '../server.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Running Köln Live-Monitor Endpoints Verification...');
  console.log('====================================================\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  async function test(name, url, options = {}, validator = null) {
    try {
      const res = await fetch(`${baseUrl}${url}`, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (validator) validator(data);
      console.log(`[PASS] ${name} (${url})`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name} (${url}): ${e.message}`);
      failed++;
    }
  }

  await test('Health Check', '/api/health', {}, (d) => {
    if (d.status !== 'ok') throw new Error('Status not ok');
  });

  await test('Lines & Tracks', '/api/lines', {}, (d) => {
    if (!Array.isArray(d.lines) || d.lines.length === 0) throw new Error('No lines');
    if (!Array.isArray(d.stations) || d.stations.length === 0) throw new Error('No stations');
  });

  await test('Live Radar Vehicles', '/api/radar', {}, (d) => {
    if (!Array.isArray(d.vehicles)) throw new Error('Vehicles not array');
  });

  await test('Live Departures (Florastr.)', '/api/departures?stopId=900000304', {}, (d) => {
    if (!Array.isArray(d.departures)) throw new Error('Departures not array');
  });

  await test('Emergencies (Polizei & Feuerwehr)', '/api/emergencies', {}, (d) => {
    if (!Array.isArray(d.emergencies)) throw new Error('Emergencies not array');
  });

  await test('KVB Rad / Nextbike', '/api/bikes', {}, (d) => {
    if (!Array.isArray(d.stations)) throw new Error('Bike stations not array');
  });

  await test('Network Analytics', '/api/analytics', {}, (d) => {
    if (typeof d.punctualityScore !== 'number') throw new Error('Missing punctualityScore');
  });

  await test('KVB Disruptions & SEV', '/api/disruptions', {}, (d) => {
    if (!d.lines) throw new Error('Missing lines disruptions');
  });

  await test('Cologne Widgets', '/api/widgets', {}, (d) => {
    if (!d.pegel || !d.weather) throw new Error('Missing pegel or weather widget');
  });

  await test('AI Query (Route: Florastr. to Neumarkt)', '/api/ai/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'wie komme ich von der Florastr. zum Neumarkt' })
  }, (d) => {
    if (!d.answer) throw new Error('Missing answer');
    if (!d.mapAction || d.mapAction.type !== 'route') throw new Error('Map action is not route');
    if (!d.mapAction.waypoints || d.mapAction.waypoints.length < 2) throw new Error('Missing curved waypoints');
  });

  server.close();

  console.log('\n====================================================');
  console.log(`📊 Summary: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runTests();
