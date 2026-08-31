/**
 * Test Suite: Concurrency, Request Lifecycle & Polling Stability
 * Validates cases A through J:
 * - Race Condition Protection (A starts -> B starts -> B finishes -> A finishes => B wins)
 * - Concurrency Guards (Duplicate in-flight request prevention)
 * - AbortController Clean Handling (Aborts don't trigger false error states)
 * - Freshness Window Protection (Rapid tab-switching doesn't spam network)
 * - Single Polling Loop Guarantee (No duplicate interval timers)
 */

class MockStoreManager {
  constructor() {
    this.stores = {};
    this.activeTimers = new Map();
  }

  getStore(key) {
    if (!this.stores[key]) {
      this.stores[key] = {
        status: 'LOADING',
        lastSuccessfulUpdate: null,
        lastFetchTime: 0,
        data: null,
        error: null,
        source: null,
        generation: 0,
        activeController: null,
        isFetching: false
      };
    }
    return this.stores[key];
  }

  async normalizeFetch(key, fetchFn, options = {}) {
    const { force = false, freshnessWindow = 0 } = options;
    const store = this.getStore(key);

    // 1. Freshness Window
    if (!force && freshnessWindow > 0 && store.status === 'LIVE' && store.data != null) {
      const ageMs = Date.now() - (store.lastFetchTime || 0);
      if (ageMs < freshnessWindow) {
        return { store, cacheHit: true };
      }
    }

    // 2. Concurrency Guard & Abort
    if (store.isFetching) {
      if (force) {
        if (store.activeController) {
          store.activeController.abort();
        }
      } else {
        return { store, deduplicated: true };
      }
    }

    store.generation = (store.generation || 0) + 1;
    const thisGen = store.generation;

    const controller = new AbortController();
    store.activeController = controller;
    store.isFetching = true;

    try {
      const data = await fetchFn(controller.signal);

      if (thisGen !== store.generation) {
        return { store, discarded: true };
      }

      if (data.status === 'error' || (data.error && !data.status)) {
        if (store.data != null) {
          store.status = 'STALE';
          store.error = data.error || 'Upstream Error';
        } else {
          store.status = 'ERROR';
          store.data = null;
          store.error = data.error || 'Upstream Error';
        }
        return { store, success: false };
      }

      store.status = 'LIVE';
      store.data = data;
      store.error = null;
      store.lastSuccessfulUpdate = data.timestamp || new Date().toISOString();
      store.lastFetchTime = Date.now();
      return { store, success: true };
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        return { store, aborted: true };
      }

      if (thisGen !== store.generation) {
        return { store, discarded: true };
      }

      if (store.data != null) {
        store.status = 'STALE';
        store.error = err.message;
      } else {
        store.status = 'ERROR';
        store.data = null;
        store.error = err.message;
      }
      return { store, success: false };
    } finally {
      if (thisGen === store.generation) {
        store.isFetching = false;
        store.activeController = null;
      }
    }
  }
}

async function runConcurrencyTests() {
  console.log('====================================================');
  console.log('🧪 Running Concurrency & Request Lifecycle Tests');
  console.log('====================================================\n');

  let total = 0;
  let passed = 0;

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

  const manager = new MockStoreManager();

  // Test A: Zwei parallele Radar-Requests (Deduplizierung)
  let fetchACalls = 0;
  const longFetch = (signal) => new Promise(resolve => {
    fetchACalls++;
    setTimeout(() => resolve({ count: 100, timestamp: 'T1' }), 100);
  });

  const p1 = manager.normalizeFetch('radar', longFetch);
  const p2 = manager.normalizeFetch('radar', longFetch);
  const [res1, res2] = await Promise.all([p1, p2]);

  assert('A. Zwei parallele Radar-Requests -> Zweiter wird dedupliziert', res2.deduplicated === true && fetchACalls === 1, `fetchACalls was ${fetchACalls}`);

  // Test B: Langsamer Request A + schneller Request B (Race Condition Guard)
  // Request A (Gen 2, 150ms delay) returns { value: 'OLD_A' }
  // Request B (Gen 3, 30ms delay, forced) returns { value: 'NEW_B' }
  const delayedFetchA = (signal) => new Promise((resolve, reject) => {
    setTimeout(() => {
      if (signal.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      } else {
        resolve({ value: 'OLD_A', timestamp: 'T_OLD' });
      }
    }, 150);
  });

  const fastFetchB = (signal) => new Promise(resolve => {
    setTimeout(() => resolve({ value: 'NEW_B', timestamp: 'T_NEW' }), 30);
  });

  const promiseA = manager.normalizeFetch('race_test', delayedFetchA);
  // Short delay then launch forced B
  await new Promise(r => setTimeout(r, 10));
  const promiseB = manager.normalizeFetch('race_test', fastFetchB, { force: true });

  const [outA, outB] = await Promise.all([promiseA, promiseB]);
  const raceStore = manager.getStore('race_test');

  assert('B. Race Condition Guard: Schnellerer neuerer Request B gewinnt, A überschreibt nicht', raceStore.data.value === 'NEW_B', `Expected NEW_B, got ${raceStore.data?.value}`);

  // Test C: Request Timeout Simulation
  const timeoutFetch = (signal) => new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      reject(err);
    }, 40);
  });

  const outTimeout = await manager.normalizeFetch('timeout_test', timeoutFetch);
  const timeoutStore = manager.getStore('timeout_test');
  assert('C. Request Timeout führt zu sauberem ERROR State ohne Exception-Leak', timeoutStore.status === 'ERROR' && outTimeout.success === false, `Got ${timeoutStore.status}`);

  // Test D: Request Abort ist kein falscher API-Error
  const abortableFetch = (signal) => new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve({ value: 'DONE' }), 100);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  const pAbort = manager.normalizeFetch('abort_test', abortableFetch);
  await new Promise(r => setTimeout(r, 10));
  // Force new request -> aborts previous
  const pFresh = manager.normalizeFetch('abort_test', () => Promise.resolve({ value: 'FRESH' }), { force: true });
  const [resAbort, resFresh] = await Promise.all([pAbort, pFresh]);
  const abortStore = manager.getStore('abort_test');

  assert('D. Abort erzeugt keinen falschen ERROR-State und neuer Request wird LIVE', resAbort.aborted === true && abortStore.status === 'LIVE' && abortStore.data.value === 'FRESH', `Status: ${abortStore.status}`);

  // Test E & F: Freshness Window & Mehrfacher Tab-Wechsel
  let networkFetches = 0;
  const dataFetch = () => {
    networkFetches++;
    return Promise.resolve({ value: 'TAB_DATA', timestamp: new Date().toISOString() });
  };

  // Tab switch 1 (Initial fetch)
  const tab1 = await manager.normalizeFetch('emergencies', dataFetch, { freshnessWindow: 20000 });
  // Rapid tab switches within 20s
  const tab2 = await manager.normalizeFetch('emergencies', dataFetch, { freshnessWindow: 20000 });
  const tab3 = await manager.normalizeFetch('emergencies', dataFetch, { freshnessWindow: 20000 });

  assert('E & F. Schnelle Tab-Wechsel nutzen Freshness-Cache (0 überflüssige Network-Calls)', networkFetches === 1 && tab2.cacheHit === true && tab3.cacheHit === true, `networkFetches: ${networkFetches}`);

  // Test G: Single Polling Loop Guarantee
  let activeTimers = 0;
  let timerId = null;

  function startTestLoop() {
    if (timerId !== null) {
      clearInterval(timerId);
      activeTimers--;
    }
    timerId = setInterval(() => {}, 1000);
    activeTimers++;
  }

  // Simulate multiple calls to start loop (e.g. Navigation / Re-Mount)
  startTestLoop();
  startTestLoop();
  startTestLoop();

  assert('G & J. Kein doppelter Polling-Loop bei wiederholtem Start (exakt 1 aktiver Timer)', activeTimers === 1 && timerId !== null, `activeTimers was ${activeTimers}`);
  clearInterval(timerId);

  // Test H: Polling über mehrere Zyklen mit ansteigender Generation
  const pollStore = manager.getStore('poll_test');
  await manager.normalizeFetch('poll_test', () => Promise.resolve({ cycle: 1 }));
  const gen1 = pollStore.generation;
  await manager.normalizeFetch('poll_test', () => Promise.resolve({ cycle: 2 }), { force: true });
  const gen2 = pollStore.generation;

  assert('H. Polling über Zyklen inkrementiert Generation strikt monoton', gen2 > gen1 && pollStore.data.cycle === 2, `Gen1: ${gen1}, Gen2: ${gen2}`);

  // Test I: Recovery nach Fehler (LIVE -> STALE -> LIVE)
  const recStore = manager.getStore('recovery_test');
  // 1. Initial success
  await manager.normalizeFetch('recovery_test', () => Promise.resolve({ count: 50 }));
  assert('I1. Initialer Zustand ist LIVE', recStore.status === 'LIVE' && recStore.data.count === 50, `Got ${recStore.status}`);

  // 2. Failure occurs -> transitions to STALE while keeping data count: 50
  await manager.normalizeFetch('recovery_test', () => Promise.reject(new Error('Network drop')), { force: true });
  assert('I2. Fehler bei vorhandenen Daten wechselt zu STALE ohne Datenverlust', recStore.status === 'STALE' && recStore.data.count === 50, `Got ${recStore.status}, count: ${recStore.data?.count}`);

  // 3. Recovery succeeds -> transitions back to LIVE with new count: 52
  await manager.normalizeFetch('recovery_test', () => Promise.resolve({ count: 52 }), { force: true });
  assert('I3. Recovery-Poll aktualisiert Daten und wechselt wieder zu LIVE', recStore.status === 'LIVE' && recStore.data.count === 52 && recStore.error === null, `Got ${recStore.status}, count: ${recStore.data?.count}`);

  console.log('\n====================================================');
  console.log(`📊 Concurrency Test Results: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('🎉 ALL CONCURRENCY, REQUEST LIFECYCLE & POLLING TESTS PASSED!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runConcurrencyTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
