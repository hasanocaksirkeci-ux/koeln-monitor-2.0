async function testOverpass() {
  console.log('Querying OpenStreetMap Overpass API with proper User-Agent...');
  
  const query = `[out:json][timeout:25];
(
  relation["type"="route"]["route"~"light_rail|subway|tram"]["ref"="1"](50.8,6.8,51.1,7.2);
);
out body;
>;
out skel qt;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Trying endpoint: ${ep}...`);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'KoelnLiveMonitor/2.0 (OpenData Cologne Project)'
        },
        body: 'data=' + encodeURIComponent(query)
      });

      if (!res.ok) {
        console.log(`Endpoint ${ep} returned HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const relations = data.elements.filter(e => e.type === 'relation');
      const ways = data.elements.filter(e => e.type === 'way');
      const nodes = data.elements.filter(e => e.type === 'node');
      
      console.log(`✅ Success with ${ep}!`);
      console.log(`Found ${relations.length} relations, ${ways.length} track ways, ${nodes.length} exact geo nodes!`);
      relations.forEach(r => {
        console.log(`- Relation ${r.id}: from="${r.tags?.from}" to="${r.tags?.to}" name="${r.tags?.name}"`);
      });
      break;
    } catch (e) {
      console.log(`Error on ${ep}:`, e.message);
    }
  }
}

testOverpass();
