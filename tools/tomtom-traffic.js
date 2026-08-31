/**
 * Layer 3: TomTom Live Traffic Integration (Flow & Incidents)
 * Real-time traffic congestion, highway incidents, bridge status for Cologne
 */

function getTomTomKey() {
  return (process.env.TOMTOM_API_KEY || 'aKtg58nDLybJblRnP0vff8Q81XaggPEM').trim();
}

// Bounding box for Greater Cologne (South-West to North-East)
const COLOGNE_BBOX = '6.75,50.82,7.18,51.08'; // minLon,minLat,maxLon,maxLat

/**
 * Returns whether a TomTom API key is configured
 */
export function isTomTomConfigured() {
  const key = getTomTomKey();
  return Boolean(key && key !== '');
}

/**
 * Get TomTom Tile URL template for Leaflet
 */
export function getTomTomTrafficConfig() {
  const key = getTomTomKey();
  const configured = Boolean(key && key !== '');
  return {
    configured,
    flowTileUrl: configured 
      ? `https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${key}&thickness=10`
      : null,
    incidentsTileUrl: configured
      ? `https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${key}`
      : null,
    attribution: '&copy; TomTom Traffic'
  };
}

/**
 * Fetch real-time traffic incidents in Cologne
 */
export async function fetchTomTomIncidents() {
  if (!isTomTomConfigured()) {
    // If no key is set yet, return structured sample Cologne traffic incidents
    return {
      timestamp: new Date().toISOString(),
      source: 'tomtom-demo',
      configured: false,
      count: 3,
      incidents: [
        {
          id: 'tt-demo-1',
          type: 'Jam',
          roadNumber: 'A4 / Rodenkirchener Brücke',
          description: 'Zähfließender Verkehr / Stau Richtung Aachen (ca. +12 Min. Verzögerung)',
          delaySeconds: 720,
          lengthMeters: 3400,
          magnitudeOfDelay: 2,
          lat: 50.8985,
          lng: 6.9942,
          category: 'jam'
        },
        {
          id: 'tt-demo-2',
          type: 'RoadWork',
          roadNumber: 'Innere Kanalstraße',
          description: 'Baustelle und verengte Fahrstreifen zwischen Venloer Str. und Subbelrather Str.',
          delaySeconds: 300,
          lengthMeters: 850,
          magnitudeOfDelay: 1,
          lat: 50.9492,
          lng: 6.9328,
          category: 'roadwork'
        },
        {
          id: 'tt-demo-3',
          type: 'Jam',
          roadNumber: 'Deutzer Brücke / Heumarkt',
          description: 'Erhöhtes Verkehrsaufkommen stadteinwärts',
          delaySeconds: 240,
          lengthMeters: 620,
          magnitudeOfDelay: 1,
          lat: 50.9358,
          lng: 6.9632,
          category: 'jam'
        }
      ]
    };
  }

  try {
    const key = getTomTomKey();
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${COLOGNE_BBOX}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length,delay,roadNumbers}}}&language=de-DE&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,14&timeValidityFilter=present&key=${key}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      throw new Error(`TomTom API responded with status ${response.status}`);
    }

    const data = await response.json();
    const rawIncidents = data.incidents || [];

    const mapped = rawIncidents.map((inc, index) => {
      const props = inc.properties || {};
      const geom = inc.geometry || {};
      let lat = 50.9380;
      let lng = 6.9580;

      // Extract coordinates
      if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        lng = geom.coordinates[0];
        lat = geom.coordinates[1];
      } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
        lng = geom.coordinates[0][0];
        lat = geom.coordinates[0][1];
      }

      const eventDesc = (props.events && props.events[0]) ? props.events[0].description : 'Verkehrsstörung';
      const roads = (props.roadNumbers && props.roadNumbers.length > 0) ? props.roadNumbers.join(', ') : 'Köln';

      return {
        id: `tt-${index}-${props.iconCategory || 0}`,
        type: inc.type || 'Incident',
        roadNumber: roads,
        from: props.from || '',
        to: props.to || '',
        description: `${roads}: ${eventDesc}${props.from ? ` (${props.from} ➔ ${props.to || ''})` : ''}`,
        delaySeconds: props.delay || 0,
        lengthMeters: props.length || 0,
        magnitudeOfDelay: props.magnitudeOfDelay || 0,
        lat,
        lng,
        category: (props.iconCategory === 6 || props.iconCategory === 7) ? 'jam' : 'roadwork'
      };
    });

    return {
      timestamp: new Date().toISOString(),
      source: 'tomtom-live',
      configured: true,
      count: mapped.length,
      incidents: mapped
    };
  } catch (err) {
    console.error('Error fetching TomTom incidents:', err.message);
    return {
      timestamp: new Date().toISOString(),
      source: 'tomtom-error',
      configured: true,
      count: 0,
      incidents: [],
      error: err.message
    };
  }
}
