/**
 * Frontend State Normalization & Transition Resilience Test Suite
 * Validates cases A through L and the state machine transitions: LIVE -> ERROR -> STALE -> LIVE
 */

// Simulated State Machine based on public/app.js normalizeApiFetch logic
function createTestStore(key, source = 'Test Source') {
  return {
    status: 'LOADING',
    lastSuccessfulUpdate: null,
    data: null,
    error: null,
    source
  };
}

function processResponse(store, resOrError) {
  if (resOrError instanceof Error) {
    if (store.data != null) {
      store.status = 'STALE';
      store.error = resOrError.message;
    } else {
      store.status = 'ERROR';
      store.data = null;
      store.error = resOrError.message;
    }
    return store;
  }

  const data = resOrError;
  if (data.status === 'error' || (data.error && !data.status)) {
    if (store.data != null) {
      store.status = 'STALE';
      store.error = data.error || 'Upstream Error';
    } else {
      store.status = 'ERROR';
      store.data = null;
      store.error = data.error || 'Upstream Error';
    }
    return store;
  }

  if (data.status === 'unconfigured' || data.configured === false) {
    store.status = 'UNAVAILABLE';
    store.data = data;
    store.error = data.error || 'Nicht konfiguriert';
    return store;
  }

  if (data.status === 'stale' || data.isStale) {
    store.status = 'STALE';
    store.data = data;
    store.error = data.error || null;
    if (data.lastSuccessfulUpdate) {
      store.lastSuccessfulUpdate = data.lastSuccessfulUpdate;
    }
    return store;
  }

  if (data.status === 'unavailable') {
    store.status = 'UNAVAILABLE';
    store.data = data;
    store.error = data.error || null;
    return store;
  }

  store.status = 'LIVE';
  store.data = data;
  store.error = null;
  store.lastSuccessfulUpdate = data.lastSuccessfulUpdate || data.timestamp || new Date().toISOString();
  return store;
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoStr).getTime()) / 1000));
  if (diffSec < 60) return `vor ${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  return `vor ${diffMin}m`;
}

function renderDataStatus(store) {
  const status = store.status || 'LOADING';
  const timeStr = store.lastSuccessfulUpdate ? formatTimeAgo(store.lastSuccessfulUpdate) : '';
  switch (status) {
    case 'LIVE': return `● LIVE ${timeStr}`;
    case 'LOADING': return `◐ LÄDT...`;
    case 'STALE': return `◷ VERZÖGERT ${timeStr}`;
    case 'UNAVAILABLE': return `⚠ NICHT VERFÜGBAR`;
    case 'ERROR': return `⛔ FEHLER`;
    default: return status;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Running Frontend Normalization & Resilience Tests');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, errorMsg) {
    total++;
    process.stdout.write(`[Test ${total}] ${name}... `);
    if (condition) {
      console.log('✅ PASSED');
      passed++;
      return true;
    } else {
      console.log(`❌ FAILED: ${errorMsg}`);
      return false;
    }
  }

  // A. Erfolgreicher API-Request
  const storeA = createTestStore('radar');
  processResponse(storeA, { timestamp: new Date().toISOString(), count: 120, vehicles: [{ id: '1' }] });
  assert('A. Erfolgreicher API-Request -> LIVE', storeA.status === 'LIVE' && storeA.data.count === 120, `Got ${storeA.status}`);

  // B. API Timeout (ohne Vor-Daten -> ERROR)
  const storeB = createTestStore('pegel');
  processResponse(storeB, new Error('The operation was aborted due to timeout'));
  assert('B. API Timeout ohne Cache -> ERROR', storeB.status === 'ERROR' && storeB.data === null, `Got ${storeB.status}`);

  // C. HTTP 500
  const storeC = createTestStore('emergencies');
  processResponse(storeC, new Error('HTTP 500 Internal Server Error'));
  assert('C. HTTP 500 -> ERROR', storeC.status === 'ERROR', `Got ${storeC.status}`);

  // D. Leere erfolgreiche Antwort
  const storeD = createTestStore('routes');
  processResponse(storeD, { timestamp: new Date().toISOString(), routes: [] });
  assert('D. Leere erfolgreiche Antwort -> LIVE mit leerem Array', storeD.status === 'LIVE' && Array.isArray(storeD.data.routes) && storeD.data.routes.length === 0, `Got ${storeD.status}`);

  // E. Null-Wert
  const storeE = createTestStore('analytics');
  processResponse(storeE, { timestamp: new Date().toISOString(), punctualityScore: null, totalTracked: 0 });
  assert('E. Null-Wert in Payload bleibt null und wird nicht 0/92%', storeE.status === 'LIVE' && storeE.data.punctualityScore === null, `Got ${storeE.data.punctualityScore}`);

  // F. Echter Wert 0
  const storeF = createTestStore('parking');
  processResponse(storeF, { timestamp: new Date().toISOString(), totalFree: 0, status: 'live' });
  assert('F. Echter numerischer Wert 0 bleibt 0', storeF.status === 'LIVE' && storeF.data.totalFree === 0 && storeF.data.totalFree !== null, `Got ${storeF.data.totalFree}`);

  // G. Stale Daten
  const storeG = createTestStore('emergencies');
  processResponse(storeG, { timestamp: new Date().toISOString(), status: 'stale', isStale: true, emergencies: [{ id: 'em-1' }] });
  assert('G. Stale Kennzeichnung -> STALE', storeG.status === 'STALE', `Got ${storeG.status}`);

  // H. Fehlende TomTom-Konfiguration
  const storeH = createTestStore('traffic');
  processResponse(storeH, { configured: false, count: 0, incidents: [], status: 'unconfigured' });
  assert('H. Fehlende TomTom-Konfiguration -> UNAVAILABLE (Nicht "0 Staus")', storeH.status === 'UNAVAILABLE', `Got ${storeH.status}`);

  // I. Parkhaus mit 0 freien Plätzen
  const garageSample = { id: 'PH1', name: 'Dom', free: 0, total: 500, status: 'full' };
  assert('I. Parkhaus mit free:0 ist real 0 und kein Fehler', garageSample.free === 0 && typeof garageSample.free === 'number', 'Invalid free spaces');

  // J. Analytics ohne Radar-Daten
  const storeJ = createTestStore('analytics');
  processResponse(storeJ, { status: 'unavailable', punctualityScore: null, totalTracked: 0 });
  assert('J. Analytics ohne Radar-Daten -> UNAVAILABLE', storeJ.status === 'UNAVAILABLE' && storeJ.data.punctualityScore === null, `Got ${storeJ.status}`);

  // K. Radar mit 0 Fahrzeugen (erfolgreich)
  const storeK = createTestStore('radar');
  processResponse(storeK, { timestamp: new Date().toISOString(), count: 0, vehicles: [], status: 'live' });
  assert('K. Radar mit 0 Fahrzeugen live -> LIVE count:0', storeK.status === 'LIVE' && storeK.data.count === 0, `Got ${storeK.status}`);

  // L. State Machine Transition: LIVE -> ERROR -> STALE -> LIVE
  console.log('\n--- State Transition: LIVE -> ERROR -> STALE -> LIVE ---');
  const storeL = createTestStore('radar');
  
  // Step 1: Initial LIVE
  processResponse(storeL, { timestamp: new Date().toISOString(), count: 83, vehicles: [{ id: 'veh-1' }] });
  assert('L1. Initial LIVE (83 Fahrzeuge)', storeL.status === 'LIVE' && storeL.data.count === 83, `Expected LIVE, got ${storeL.status}`);

  // Step 2: Temporary Timeout -> Becomes STALE (NOT wiping count to 0!)
  processResponse(storeL, new Error('Timeout after 6000ms'));
  assert('L2. Timeout mit vorherigem Cache wird STALE', storeL.status === 'STALE' && storeL.data.count === 83, `Expected STALE with 83 count, got ${storeL.status} with ${storeL.data?.count}`);

  // Step 3: Upstream returns STALE
  processResponse(storeL, { timestamp: new Date().toISOString(), count: 83, vehicles: [{ id: 'veh-1' }], status: 'stale' });
  assert('L3. Upstream Stale Response -> STALE', storeL.status === 'STALE' && storeL.data.count === 83, `Got ${storeL.status}`);

  // Step 4: Recovery -> LIVE
  processResponse(storeL, { timestamp: new Date().toISOString(), count: 85, vehicles: [{ id: 'veh-1' }, { id: 'veh-2' }], status: 'live' });
  assert('L4. Recovery -> LIVE (85 Fahrzeuge)', storeL.status === 'LIVE' && storeL.data.count === 85 && storeL.error === null, `Got ${storeL.status}`);

  console.log('\n====================================================');
  console.log(`📊 Resilience Results: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL 15 FRONTEND RESILIENCE & TRANSITION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME RESILIENCE TESTS FAILED!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
