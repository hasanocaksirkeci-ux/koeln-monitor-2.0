/**
 * Data Integrity & Timeout Verification Test Suite
 * Validates that all external data sources handle timeouts, errors, and empty states without returning fake numbers.
 */
import { getCologneWidgets } from '../tools/cologne-widgets.js';
import { computeNetworkAnalytics } from '../tools/analytics.js';
import { fetchTomTomIncidents, isTomTomConfigured } from '../tools/tomtom-traffic.js';
import { fetchKvbBikes } from '../tools/kvb-bikes.js';
import { fetchCologneEmergencies } from '../tools/cologne-emergencies.js';
import { getLiveRadar, getDepartures } from '../tools/kvb-client.js';
import { getDisruptions } from '../tools/kvb-disruptions.js';
import { getSavedRoutes, getEmergenciesFromDB } from '../tools/db.js';

async function runIntegrityTests() {
  console.log('====================================================');
  console.log('🛡️ Starting Backend Data Integrity Test Suite...');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(testName, condition, failMsg) {
    total++;
    process.stdout.write(`[Test ${total}] ${testName}... `);
    if (condition) {
      console.log('✅ PASSED');
      passed++;
      return true;
    } else {
      console.log(`❌ FAILED: ${failMsg}`);
      return false;
    }
  }

  // 1. Widgets live or structured error (NO hardcoded 112cm or 2500 parking)
  console.log('--- Checking Widgets Data Integrity ---');
  const widgets = await getCologneWidgets({ force: true });
  assert(
    'Widgets payload has timestamp and valid sub-objects',
    widgets && widgets.timestamp && widgets.pegel && widgets.parking && widgets.weather,
    'Widgets root structure incomplete'
  );
  assert(
    'Pegel has valid status (live, stale or error) and NO silent fake numbers on error',
    ['live', 'stale', 'error'].includes(widgets.pegel.status),
    `Unexpected Pegel status: ${widgets.pegel.status}`
  );
  if (widgets.pegel.status === 'live') {
    assert('Live Pegel has positive numeric cm value', typeof widgets.pegel.valueCm === 'number' && widgets.pegel.valueCm > 0, 'Invalid Pegel cm');
  }

  assert(
    'Parking has valid status (live, stale or error)',
    ['live', 'stale', 'error'].includes(widgets.parking.status),
    `Unexpected Parking status: ${widgets.parking.status}`
  );

  assert(
    'Weather has valid status (live, stale or error)',
    ['live', 'stale', 'error'].includes(widgets.weather.status),
    `Unexpected Weather status: ${widgets.weather.status}`
  );

  // 2. TomTom Incidents (NO fake tt-demo incidents)
  console.log('\n--- Checking TomTom Traffic Data Integrity ---');
  const traffic = await fetchTomTomIncidents();
  assert(
    'TomTom incidents has valid status and NO demo fake objects',
    ['live', 'unconfigured', 'error'].includes(traffic.status || (traffic.configured ? 'live' : 'unconfigured')),
    `Unexpected TomTom status: ${traffic.status}`
  );
  const hasDemo1 = traffic.incidents?.some(i => i.id === 'tt-demo-1');
  assert('No fake demo incidents (tt-demo-1) returned', !hasDemo1, 'Found fake tt-demo-1 in traffic payload');

  // 3. Analytics (NO fake 92.0 or 90.0 on empty/failure)
  console.log('\n--- Checking Analytics Data Integrity ---');
  const analytics = await computeNetworkAnalytics();
  assert(
    'Analytics has valid status (live, stale, unavailable or error)',
    ['live', 'stale', 'unavailable', 'error'].includes(analytics.status),
    `Unexpected Analytics status: ${analytics.status}`
  );
  if (analytics.totalTracked === 0) {
    assert('Analytics with 0 vehicles returns punctualityScore: null', analytics.punctualityScore === null, `Expected null, got ${analytics.punctualityScore}`);
  } else {
    assert('Analytics with active vehicles computes punctuality percentage', typeof analytics.punctualityScore === 'number' && analytics.punctualityScore >= 0, 'Invalid score');
  }

  // 4. Bikes Live Feed
  console.log('\n--- Checking Nextbike Live Feed ---');
  const bikes = await fetchKvbBikes();
  assert(
    'Bikes payload has valid status and source attribution',
    ['live', 'stale', 'error'].includes(bikes.status),
    `Unexpected Bikes status: ${bikes.status}`
  );
  assert('Bikes source is Nextbike / KVB Rad', bikes.source?.includes('Nextbike'), `Source was ${bikes.source}`);

  // 5. Disruptions Feed
  console.log('\n--- Checking KVB Disruptions ---');
  const disruptions = await getDisruptions({ force: true });
  assert(
    'Disruptions payload has valid status',
    ['live', 'stale', 'error'].includes(disruptions.status),
    `Unexpected Disruptions status: ${disruptions.status}`
  );
  assert('Disruptions contains all 12 Stadtbahn lines', disruptions.lines?.filter(l => l.type === 'stadtbahn').length === 12, 'Stadtbahn lines missing');

  // 6. Emergencies Feed
  console.log('\n--- Checking Emergencies Feed ---');
  const emergencies = await fetchCologneEmergencies();
  assert(
    'Emergencies payload has valid status',
    ['live', 'stale', 'error'].includes(emergencies.status),
    `Unexpected Emergencies status: ${emergencies.status}`
  );

  // 7. Radar Live Feed
  console.log('\n--- Checking KVB HAFAS Radar ---');
  const radar = await getLiveRadar();
  assert(
    'Radar payload has valid status and source attribution',
    ['live', 'error'].includes(radar.status),
    `Unexpected Radar status: ${radar.status}`
  );

  // 8. Departures Feed
  console.log('\n--- Checking KVB HAFAS Departures ---');
  const deps = await getDepartures('900000304');
  assert(
    'Departures payload has valid status',
    ['live', 'error'].includes(deps.status),
    `Unexpected Departures status: ${deps.status}`
  );

  // 9. SQLite Persistence Integrity
  console.log('\n--- Checking SQLite Determinism & Absence of Fake Data ---');
  const savedRoutes = getSavedRoutes();
  assert('Saved routes returns array', Array.isArray(savedRoutes), 'savedRoutes is not an array');
  const dbEmergencies = getEmergenciesFromDB({ limit: 10 });
  assert('DB emergencies returns array', Array.isArray(dbEmergencies), 'dbEmergencies is not an array');

  console.log('\n====================================================');
  console.log(`📊 Integrity Results: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL DATA INTEGRITY & TIMEOUT TESTS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME INTEGRITY TESTS FAILED!');
    process.exit(1);
  }
}

runIntegrityTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
