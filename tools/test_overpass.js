async function testOverpass() {
  const query = `[out:json][timeout:30];
(
  relation["route"="tram"](50.85,6.80,51.05,7.10);
  relation["route"="subway"](50.85,6.80,51.05,7.10);
  relation["route"="train"]["ref"~"^S"](50.85,6.80,51.05,7.10);
);
out tags;`;

  console.log('Fetching Overpass API relations for Cologne transit...');
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'KoelnMonitor/2.0 (OpenStreetMap Transit Importer; contact@koeln-live.de)',
      'Accept': 'application/json, */*'
    }
  });

  console.log('Response status:', res.status, res.statusText);
  const text = await res.text();
  if (!res.ok) {
    console.error('Error body:', text.slice(0, 400));
    return;
  }
  const json = JSON.parse(text);
  console.log(`\n✅ Overpass returned ${json.elements.length} official transit route relations in Cologne!\n`);
  
  const grouped = {};
  for (const el of json.elements) {
    const ref = el.tags.ref || el.tags.name || 'Other';
    if (!grouped[ref]) grouped[ref] = [];
    grouped[ref].push(el);
  }

  for (const [line, rels] of Object.entries(grouped).slice(0, 20)) {
    console.log(`- Linie ${line} (${rels.length} Richtungen/Varianten):`);
    rels.forEach(r => console.log(`    ↳ ID ${r.id}: ${r.tags.name || (r.tags.from + ' -> ' + r.tags.to)}`));
  }
}

testOverpass().catch(console.error);
