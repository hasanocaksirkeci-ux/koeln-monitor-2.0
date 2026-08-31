/**
 * Automated Test Suite for Köln Live-Monitor City-Platform
 * Tests all 10 REST API Endpoints & Data Invariants
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Köln Live-Monitor Automated Test Suite...');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function testEndpoint(name, url, validator) {
    total++;
    process.stdout.write(`[Test ${total}] ${name} (${url})... `);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`❌ FAILED (HTTP ${res.status})`);
        return false;
      }
      const data = await res.json();
      const validationError = await validator(data);
      if (validationError) {
        console.log(`❌ FAILED: ${validationError}`);
        return false;
      }
      console.log(`✅ PASSED`);
      passed++;
      return true;
    } catch (err) {
      console.log(`❌ FAILED (Exception: ${err.message})`);
      return false;
    }
  }

  // 1. Health
  await testEndpoint('Health Check', `${BASE_URL}/api/health`, data => {
    if (data.status !== 'ok') return 'status is not ok';
  });

  // 2. Lines & Stations
  await testEndpoint('Lines & Verified Stations', `${BASE_URL}/api/lines`, data => {
    if (!data.lines || data.lines.length < 10) return `Expected at least 10 lines, got ${data.lines?.length}`;
    if (!data.stations || data.stations.length < 100) return `Expected at least 100 stations, got ${data.stations?.length}`;
    const florastr = data.stations.find(s => s.id === '900000304');
    if (!florastr) return 'Florastr. (900000304) not found in stations';
    if (!florastr.lines.includes('12') || !florastr.lines.includes('15')) return 'Florastr. missing line 12/15';
  });

  // 3. Live Radar
  await testEndpoint('Live Radar (~300 vehicles)', `${BASE_URL}/api/radar`, data => {
    if (!data.vehicles || data.vehicles.length < 50) return `Expected 50+ vehicles, got ${data.vehicles?.length}`;
    const sample = data.vehicles[0];
    if (!sample.tripId || !sample.line || !sample.lat || !sample.lng) return 'Sample vehicle missing essential fields';
  });

  // 4. Live Departures (Florastr.)
  await testEndpoint('Live Departures Florastr.', `${BASE_URL}/api/departures?stopId=900000304`, data => {
    if (!data.departures || data.departures.length === 0) return 'Expected departures, got 0';
    const lines = data.departures.map(d => d.line);
    const has3or4 = lines.includes('3') || lines.includes('4');
    if (has3or4) return 'ERROR: Florastr. must NOT have line 3 or 4!';
    const has12or15 = lines.includes('12') || lines.includes('15') || lines.includes('147');
    if (!has12or15) return 'Florastr. missing expected lines 12/15/147';
  });

  // 5. Polizei & Feuerwehr Emergencies (Blaulicht)
  await testEndpoint('Polizei & Feuerwehr Emergencies Feed', `${BASE_URL}/api/emergencies`, data => {
    if (!data.emergencies || data.emergencies.length === 0) return 'Expected emergencies, got 0';
    const sample = data.emergencies[0];
    if (!sample.title || !sample.category || !sample.district || !sample.lat || !sample.lng) {
      return 'Sample emergency missing title, category, district or coordinates';
    }
  });

  // 6. KVB Rad / Nextbike Live
  await testEndpoint('KVB Rad / Nextbike Live Feed', `${BASE_URL}/api/bikes`, data => {
    if (!data.stations || data.stations.length < 50) return `Expected 50+ bike stations, got ${data.stations?.length}`;
    if (!data.totalAvailableBikes || data.totalAvailableBikes < 100) return 'Expected 100+ available bikes';
  });

  // 7. Network Analytics & Punctuality
  await testEndpoint('Network Analytics & Punctuality Score', `${BASE_URL}/api/analytics`, data => {
    if (data.punctualityScore === undefined || data.punctualityScore < 0) return 'Invalid punctuality score';
    if (!data.linePerformance || data.linePerformance.length < 5) return 'Missing line performance breakdown';
  });

  // 8. Saved Routes (SQLite)
  await testEndpoint('Saved Routes from SQLite', `${BASE_URL}/api/saved-routes`, data => {
    if (!Array.isArray(data.routes)) return 'routes is not an array';
  });

  // 9. KVB Disruptions
  await testEndpoint('KVB Betriebslage & Disruptions', `${BASE_URL}/api/disruptions`, data => {
    if (!data.lines || data.lines.length < 10) return `Expected 10+ lines status, got ${data.lines?.length}`;
  });

  // 10. City Widgets (Pegel, Parking, Weather)
  await testEndpoint('Cologne City Widgets', `${BASE_URL}/api/widgets`, data => {
    if (!data.pegel || (!data.pegel.value && !data.pegel.valueCm && data.pegel.status !== 'error')) return 'Pegel data missing or invalid';
    if (!data.parking || (!data.parking.garages && data.parking.status !== 'error')) return 'Parking data missing';
    if (!data.weather || (data.weather.temp === undefined && data.weather.status !== 'error')) return 'Weather data missing';
  });

  // 11. TomTom Live Traffic (Config & Incidents)
  await testEndpoint('TomTom Live Traffic Config & Incidents', `${BASE_URL}/api/traffic/incidents`, data => {
    if (data.count === undefined || !Array.isArray(data.incidents)) return 'Incidents payload invalid';
  });

  // 12. Köln AI City Concierge
  await testEndpoint('Köln AI City Concierge (/api/ai/query)', `${BASE_URL}/api/health`, async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Wie ist der Rheinpegel in Köln?' })
      });
      if (!res.ok) return `AI HTTP ${res.status}`;
      const data = await res.json();
      if (!data.answer || !data.success) return 'Invalid AI response structure';
      return null;
    } catch (e) {
      return e.message;
    }
  });

  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL BACKEND & PERSISTENCE TESTS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME TESTS FAILED!');
    process.exit(1);
  }
}

runTests();
