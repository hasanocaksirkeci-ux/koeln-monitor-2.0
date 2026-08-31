import { getLiveRadar } from './kvb-client.js';
import { savePunctualitySnapshot, getPunctualityHistory } from './db.js';

let lastAnalyticsCache = {
  data: null,
  timestamp: 0
};

const ANALYTICS_CACHE_TTL = 30 * 1000; // 30s

export async function computeNetworkAnalytics() {
  const now = Date.now();
  if (lastAnalyticsCache.data && (now - lastAnalyticsCache.timestamp) < ANALYTICS_CACHE_TTL) {
    return lastAnalyticsCache.data;
  }

  const nowIso = new Date().toISOString();

  try {
    const radarData = await getLiveRadar();
    const vehicles = radarData.vehicles || [];

    if (vehicles.length === 0) {
      const prevData = lastAnalyticsCache.data;
      if (prevData && prevData.punctualityScore !== null) {
        return {
          ...prevData,
          status: 'stale',
          isStale: true,
          timestamp: nowIso,
          error: 'Aktuell keine aktiven Fahrzeuge auf dem Live-Radar erfasst'
        };
      }

      return {
        timestamp: nowIso,
        status: 'unavailable',
        punctualityScore: null,
        totalTracked: 0,
        onTimeCount: 0,
        delayedCount: 0,
        averageDelayMinutes: null,
        linePerformance: [],
        history: getPunctualityHistory(12),
        message: 'Keine aktiven Fahrzeuge erfasst'
      };
    }

    let onTimeCount = 0;
    let delayedCount = 0;
    let totalDelayMinutes = 0;

    const lineMap = {};

    for (const v of vehicles) {
      const delay = v.nextStop?.delayMinutes || 0;
      totalDelayMinutes += delay;

      if (delay <= 2) {
        onTimeCount++;
      } else {
        delayedCount++;
      }

      const line = v.line || 'Sonstige';
      if (!lineMap[line]) {
        lineMap[line] = {
          line,
          activeVehicles: 0,
          onTime: 0,
          delayed: 0,
          totalDelay: 0,
          product: v.product
        };
      }

      lineMap[line].activeVehicles++;
      lineMap[line].totalDelay += delay;
      if (delay <= 2) {
        lineMap[line].onTime++;
      } else {
        lineMap[line].delayed++;
      }
    }

    const totalTracked = vehicles.length;
    const punctualityScore = parseFloat(((onTimeCount / totalTracked) * 100).toFixed(1));
    const averageDelayMinutes = parseFloat((totalDelayMinutes / totalTracked).toFixed(1));

    const linePerformance = Object.values(lineMap)
      .map(lp => ({
        line: lp.line,
        product: lp.product,
        activeVehicles: lp.activeVehicles,
        punctuality: parseFloat(((lp.onTime / lp.activeVehicles) * 100).toFixed(1)),
        averageDelay: parseFloat((lp.totalDelay / lp.activeVehicles).toFixed(1))
      }))
      .sort((a, b) => {
        const numA = parseInt(a.line, 10) || 999;
        const numB = parseInt(b.line, 10) || 999;
        return numA - numB;
      });

    const snapshot = {
      timestamp: nowIso,
      status: 'live',
      lastSuccessfulUpdate: nowIso,
      punctualityScore,
      totalTracked,
      onTimeCount,
      delayedCount,
      averageDelayMinutes,
      linePerformance
    };

    // Save to SQLite
    savePunctualitySnapshot(snapshot);

    const history = getPunctualityHistory(12);

    const payload = {
      ...snapshot,
      history
    };

    lastAnalyticsCache = {
      data: payload,
      timestamp: now
    };

    return payload;
  } catch (err) {
    console.error('Error computing analytics:', err.message);
    if (lastAnalyticsCache.data) {
      return {
        ...lastAnalyticsCache.data,
        status: 'stale',
        isStale: true,
        error: err.message
      };
    }
    return {
      timestamp: nowIso,
      status: 'error',
      punctualityScore: null,
      totalTracked: 0,
      onTimeCount: 0,
      delayedCount: 0,
      averageDelayMinutes: null,
      linePerformance: [],
      history: getPunctualityHistory(12),
      error: err.message,
      lastSuccessfulUpdate: null
    };
  }
}

export default {
  computeNetworkAnalytics
};
