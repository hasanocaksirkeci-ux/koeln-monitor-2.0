import { saveEmergencies, getEmergenciesFromDB } from './db.js';

const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral-nemo:hybrid80-de';

/**
 * High-Precision Geo-Dictionary for Cologne & surrounding POL-K area (Leverkusen & Highways)
 * Priority: Specific Street/Hotspot > District/Veedel > Region
 */
const SPECIFIC_LOCATIONS = [
  // Specific Streets & Hotspots in Cologne
  { pattern: /\b(kalker\s+hauptstr(aße|b)?|kalk\s+hauptstr)/i, lat: 50.9385, lng: 7.0060, name: 'Kalk (Kalker Hauptstr.)' },
  { pattern: /\bansbacher\s+str/i, lat: 50.9355, lng: 7.0130, name: 'Vingst (Ansbacher Str.)' },
  { pattern: /\bpf(ä|ae)lzisch(er|en)?\s+ring/i, lat: 50.9570, lng: 7.0010, name: 'Mülheim (Pfälzischer Ring)' },
  { pattern: /\bberliner\s+str/i, lat: 50.9700, lng: 7.0200, name: 'Mülheim (Berliner Str.)' },
  { pattern: /\bclevischer\s+ring/i, lat: 50.9680, lng: 7.0120, name: 'Mülheim (Clevischer Ring)' },
  { pattern: /\bbergisch\s+gladbacher\s+str/i, lat: 50.9650, lng: 7.0350, name: 'Holweide (Bergisch Gladbacher Str.)' },
  { pattern: /\bvenloer\s+str/i, lat: 50.9500, lng: 6.9180, name: 'Ehrenfeld (Venloer Str.)' },
  { pattern: /\baachener\s+str/i, lat: 50.9360, lng: 6.9120, name: 'Lindenthal (Aachener Str.)' },
  { pattern: /\bneusser\s+str/i, lat: 50.9620, lng: 6.9530, name: 'Nippes (Neusser Str.)' },
  { pattern: /\bbonner\s+str/i, lat: 50.9080, lng: 6.9620, name: 'Bayenthal (Bonner Str.)' },
  { pattern: /\bseverinstr/i, lat: 50.9280, lng: 6.9580, name: 'Altstadt-Süd (Severinstr.)' },
  { pattern: /\bbreite\s+str/i, lat: 50.9380, lng: 6.9500, name: 'Innenstadt (Breite Str.)' },
  { pattern: /\b(schildergasse|hohe\s+str)/i, lat: 50.9360, lng: 6.9540, name: 'Innenstadt (Fußgängerzone)' },
  { pattern: /\bz(ü|ue)lpicher\s+(str|platz)/i, lat: 50.9295, lng: 6.9365, name: 'Neustadt-Süd (Zülpicher Str.)' },
  { pattern: /\bluxemburger\s+str/i, lat: 50.9190, lng: 6.9270, name: 'Sülz (Luxemburger Str.)' },
  { pattern: /\b(hohenzollernring|kaiser-wilhelm-ring|habsburgerring|salierring|sachsenring|ubierring|k(ö|oe)lner\s+ringe?)\b/i, lat: 50.9390, lng: 6.9400, name: 'Innenstadt (Kölner Ringe)' },
  { pattern: /\bwiener\s+platz\b/i, lat: 50.9630, lng: 7.0070, name: 'Mülheim (Wiener Platz)' },
  { pattern: /\bebertplatz\b/i, lat: 50.9506, lng: 6.9589, name: 'Ebertplatz' },
  { pattern: /\bneumarkt\b/i, lat: 50.9356, lng: 6.9483, name: 'Neumarkt' },
  { pattern: /\bheumarkt\b/i, lat: 50.9357, lng: 6.9592, name: 'Heumarkt' },
  { pattern: /\brudolfplatz\b/i, lat: 50.9362, lng: 6.9390, name: 'Rudolfplatz' },
  { pattern: /\bfriesenplatz\b/i, lat: 50.9405, lng: 6.9399, name: 'Friesenplatz' },
  { pattern: /\bbarbarossaplatz\b/i, lat: 50.9288, lng: 6.9423, name: 'Barbarossaplatz' },
  { pattern: /\bchlodwigplatz\b/i, lat: 50.9211, lng: 6.9596, name: 'Chlodwigplatz' },
  { pattern: /\bhansaring\b/i, lat: 50.9487, lng: 6.9516, name: 'Hansaring' },
  { pattern: /\b(hauptbahnhof|breslauer\s+platz|bahnhofsvorplatz|dom\/hbf)\b/i, lat: 50.9430, lng: 6.9590, name: 'Köln Hbf / Dom' },
  { pattern: /\bflughafen(\s+k(ö|oe)ln\/bonn)?\b/i, lat: 50.8659, lng: 7.1427, name: 'Flughafen Köln/Bonn' },
  { pattern: /\blanxess\s+arena\b/i, lat: 50.9380, lng: 6.9830, name: 'Deutz (Lanxess Arena)' },
  { pattern: /\b(rheinenergie\s*stadion|m(ü|ue)ngersdorfer\s+stadion)\b/i, lat: 50.9333, lng: 6.8750, name: 'Müngersdorf (Stadion)' },
  { pattern: /\bf(ü|ue)hlinger\s+see\b/i, lat: 51.0200, lng: 6.9200, name: 'Fühlingen (Fühlinger See)' },
  { pattern: /\brheinauhafen\b/i, lat: 50.9260, lng: 6.9660, name: 'Altstadt-Süd (Rheinauhafen)' },
  { pattern: /\bpoller\s+wiesen\b/i, lat: 50.9180, lng: 6.9850, name: 'Poll (Poller Wiesen)' },
  { pattern: /\bmediapark\b/i, lat: 50.9470, lng: 6.9430, name: 'Neustadt-Nord (Mediapark)' },

  // Bridges
  { pattern: /\b(zoobr(ü|ue)cke|b\s*55a?)\b/i, lat: 50.9520, lng: 6.9850, name: 'Zoobrücke (B55a)' },
  { pattern: /\b(severinsbr(ü|ue)cke)\b/i, lat: 50.9312, lng: 6.9690, name: 'Severinsbrücke' },
  { pattern: /\b(deutzer\s+br(ü|ue)cke)\b/i, lat: 50.9351, lng: 6.9680, name: 'Deutzer Brücke' },
  { pattern: /\b(m(ü|ue)lheimer\s+br(ü|ue)cke)\b/i, lat: 50.9705, lng: 6.9880, name: 'Mülheimer Brücke' },
  { pattern: /\b(rodenkirchener\s+br(ü|ue)cke)\b/i, lat: 50.8980, lng: 6.9980, name: 'Rodenkirchener Brücke' },

  // Leverkusen Hotspots (Covered by Polizei Köln / POL-K)
  { pattern: /\b(schlebusch|m(ü|ue)lheimer\s+str(aße)?\s+in\s+leverkusen)\b/i, lat: 51.0340, lng: 7.0480, name: 'Leverkusen-Schlebusch' },
  { pattern: /\bopladen\b/i, lat: 51.0660, lng: 7.0040, name: 'Leverkusen-Opladen' },
  { pattern: /\bwiesdorf\b/i, lat: 51.0300, lng: 6.9850, name: 'Leverkusen-Wiesdorf' },
  { pattern: /\bk(ü|ue)ppersteg\b/i, lat: 51.0450, lng: 6.9950, name: 'Leverkusen-Küppersteg' },
  { pattern: /\brheindorf\b/i, lat: 51.0500, lng: 6.9550, name: 'Leverkusen-Rheindorf' },
  { pattern: /\bhitdorf\b/i, lat: 51.0600, lng: 6.9200, name: 'Leverkusen-Hitdorf' },
  { pattern: /\bmanfort\b/i, lat: 51.0280, lng: 7.0150, name: 'Leverkusen-Manfort' },
  { pattern: /\bleverkusen\b/i, lat: 51.0320, lng: 6.9880, name: 'Leverkusen' },

  // Surrounding Towns in Police Area
  { pattern: /\b(burscheid|burscheider)\b/i, lat: 51.0800, lng: 7.1200, name: 'Burscheid' },
  { pattern: /\b(bergisch\s+gladbach|gladbacher|bensberg|refrath)\b/i, lat: 50.9900, lng: 7.1300, name: 'Bergisch Gladbach' },
  { pattern: /\b(d(ü|ue)ren|d(ü|ue)rener)\b/i, lat: 50.8000, lng: 6.4800, name: 'Düren' },
  { pattern: /\b(j(ü|ue)lich|j(ü|ue)licher)\b/i, lat: 50.9200, lng: 6.3600, name: 'Jülich' },
  { pattern: /\b(kerpen|sindorf|horrem)\b/i, lat: 50.8700, lng: 6.6900, name: 'Kerpen' },
  { pattern: /\b(h(ü|ue)rth|efferen|herm(ü|ue)lheim)\b/i, lat: 50.8800, lng: 6.8700, name: 'Hürth' },
  { pattern: /\b(frechen|frechener)\b/i, lat: 50.9100, lng: 6.8100, name: 'Frechen' },
  { pattern: /\b(pulheim|pulheimer|stommeln)\b/i, lat: 50.9950, lng: 6.8050, name: 'Pulheim' },
  { pattern: /\b(dormagen|dormagener)\b/i, lat: 51.0950, lng: 6.8350, name: 'Dormagen' },
  { pattern: /\b(troisdorf|siegburg)\b/i, lat: 50.8150, lng: 7.1550, name: 'Troisdorf / Rhein-Sieg' },
  { pattern: /\b(wesseling|wesselinger)\b/i, lat: 50.8250, lng: 6.9800, name: 'Wesseling' },
  { pattern: /\b(br(ü|ue)hl|br(ü|ue)hler)\b/i, lat: 50.8300, lng: 6.9000, name: 'Brühl' },
  { pattern: /\b(erftstadt|liblar|lechenich)\b/i, lat: 50.8100, lng: 6.8200, name: 'Erftstadt' },
  { pattern: /\b(bergheim|bedburg)\b/i, lat: 50.9600, lng: 6.6400, name: 'Bergheim' },

  // Highways & Motorways (Polizei Autobahnstationen Köln & Umgebung)
  { pattern: /\b(autobahn\s+a\s*44|bundesautobahn\s+44|\ba\s*44\b)/i, lat: 50.9150, lng: 6.3800, name: 'Autobahn A44' },
  { pattern: /\b(autobahn\s+a\s*4|bundesautobahn\s+4|\ba\s*4\b)/i, lat: 50.9050, lng: 6.9700, name: 'Autobahn A4' },
  { pattern: /\b(autobahn\s+a\s*3|heumarer\s+dreieck|\ba\s*3\b)/i, lat: 50.9400, lng: 7.0600, name: 'Autobahn A3' },
  { pattern: /\b(autobahn\s+a\s*1|kreuz\s+k(ö|oe)ln-nord|kreuz\s+k(ö|oe)ln-west|\ba\s*1\b)/i, lat: 50.9700, lng: 6.8500, name: 'Autobahn A1' },
  { pattern: /\b(autobahn\s+a\s*57|\ba\s*57\b)/i, lat: 50.9650, lng: 6.9200, name: 'Autobahn A57' },
  { pattern: /\b(autobahn\s+a\s*59|\ba\s*59\b)/i, lat: 50.8800, lng: 7.0800, name: 'Autobahn A59' },
  { pattern: /\b(autobahn\s+a\s*559|\ba\s*559\b)/i, lat: 50.9100, lng: 7.0200, name: 'Autobahn A559' },
  { pattern: /\b(autobahn\s+a\s*555|\ba\s*555\b)/i, lat: 50.8800, lng: 6.9700, name: 'Autobahn A555' },
  { pattern: /\b(autobahn\s+a\s*553|\ba\s*553\b)/i, lat: 50.8200, lng: 6.8800, name: 'Autobahn A553' },
  { pattern: /\b(autobahn\s+a\s*61|\ba\s*61\b)/i, lat: 50.8500, lng: 6.6800, name: 'Autobahn A61' },
  { pattern: /\b(autobahn\s+a\s*542|\ba\s*542\b)/i, lat: 51.1000, lng: 6.9300, name: 'Autobahn A542' },
  { pattern: /\b(autobahn\s+a\s*565|\ba\s*565\b)/i, lat: 50.7200, lng: 7.0700, name: 'Autobahn A565' }
];

/**
 * Complete Dictionary of all 86 Cologne Veedel (Districts) with German Adjectival / Stem Regex
 */
const VEEDEL_DICT = [
  { pattern: /\b(kalk|kalker|kalks)\b/i, lat: 50.9380, lng: 7.0020, name: 'Kalk' },
  { pattern: /\b(vingst|vingster)\b/i, lat: 50.9350, lng: 7.0120, name: 'Vingst' },
  { pattern: /\b(ehrenfeld|ehrenfelder)\b/i, lat: 50.9500, lng: 6.9180, name: 'Ehrenfeld' },
  { pattern: /\b(neuehrenfeld|neuehrenfelder)\b/i, lat: 50.9560, lng: 6.9240, name: 'Neuehrenfeld' },
  { pattern: /\b(m(ü|ue)lheim|m(ü|ue)lheimer)\b/i, lat: 50.9630, lng: 7.0060, name: 'Mülheim' },
  { pattern: /\b(nippes|nippeser)\b/i, lat: 50.9640, lng: 6.9530, name: 'Nippes' },
  { pattern: /\b(deutz|deutzer)\b/i, lat: 50.9390, lng: 6.9780, name: 'Deutz' },
  { pattern: /\b(porz|porzer)\b/i, lat: 50.8850, lng: 7.0590, name: 'Porz' },
  { pattern: /\b(chorweiler|chorweiler)\b/i, lat: 51.0210, lng: 6.8980, name: 'Chorweiler' },
  { pattern: /\b(s(ü|ue)lz|s(ü|ue)lzer)\b/i, lat: 50.9200, lng: 6.9250, name: 'Sülz' },
  { pattern: /\b(lindenthal|lindenthaler)\b/i, lat: 50.9300, lng: 6.9150, name: 'Lindenthal' },
  { pattern: /\b(braunsfeld|braunsfelder)\b/i, lat: 50.9370, lng: 6.9080, name: 'Braunsfeld' },
  { pattern: /\b(zollstock|zollstocker)\b/i, lat: 50.9080, lng: 6.9380, name: 'Zollstock' },
  { pattern: /\b(klettenberg|klettenberger)\b/i, lat: 50.9100, lng: 6.9200, name: 'Klettenberg' },
  { pattern: /\b(bayenthal|bayenthaler)\b/i, lat: 50.9120, lng: 6.9750, name: 'Bayenthal' },
  { pattern: /\b(marienburg|marienburger)\b/i, lat: 50.9000, lng: 6.9780, name: 'Marienburg' },
  { pattern: /\b(raderberg|raderberger)\b/i, lat: 50.9080, lng: 6.9550, name: 'Raderberg' },
  { pattern: /\b(raderthal|raderthaler)\b/i, lat: 50.8980, lng: 6.9500, name: 'Raderthal' },
  { pattern: /\b(rodenkirchen|rodenkirchener)\b/i, lat: 50.8910, lng: 6.9900, name: 'Rodenkirchen' },
  { pattern: /\b(s(ü|ue)rth|s(ü|ue)rther)\b/i, lat: 50.8650, lng: 7.0050, name: 'Sürth' },
  { pattern: /\b(wei(ß|ss)|wei(ß|ss)er)\b/i, lat: 50.8750, lng: 7.0100, name: 'Weiß' },
  { pattern: /\b(godorf|godorfer)\b/i, lat: 50.8500, lng: 6.9800, name: 'Godorf' },
  { pattern: /\b(rondorf|rondorfer)\b/i, lat: 50.8750, lng: 6.9600, name: 'Rondorf' },
  { pattern: /\b(hahnwald)\b/i, lat: 50.8650, lng: 6.9800, name: 'Hahnwald' },
  { pattern: /\b(immendorf)\b/i, lat: 50.8500, lng: 6.9550, name: 'Immendorf' },
  { pattern: /\b(meschenich)\b/i, lat: 50.8600, lng: 6.9350, name: 'Meschenich' },
  { pattern: /\b(m(ü|ue)ngersdorf|m(ü|ue)ngersdorfer)\b/i, lat: 50.9380, lng: 6.8800, name: 'Müngersdorf' },
  { pattern: /\b(junkersdorf|junkersdorfer)\b/i, lat: 50.9380, lng: 6.8680, name: 'Junkersdorf' },
  { pattern: /\b(weiden|weidener)\b/i, lat: 50.9410, lng: 6.8150, name: 'Weiden' },
  { pattern: /\b(l(ö|oe)venich|l(ö|oe)venicher)\b/i, lat: 50.9450, lng: 6.8300, name: 'Lövenich' },
  { pattern: /\b(widdersdorf|widdersdorfer)\b/i, lat: 50.9650, lng: 6.8400, name: 'Widdersdorf' },
  { pattern: /\b(bickendorf|bickendorfer)\b/i, lat: 50.9600, lng: 6.9000, name: 'Bickendorf' },
  { pattern: /\b(vogelsang)\b/i, lat: 50.9550, lng: 6.8850, name: 'Vogelsang' },
  { pattern: /\b(bocklem(ü|ue)nd)\b/i, lat: 50.9680, lng: 6.8700, name: 'Bocklemünd' },
  { pattern: /\b(ossendorf|ossendorfer)\b/i, lat: 50.9750, lng: 6.8950, name: 'Ossendorf' },
  { pattern: /\b(mauenheim|mauenheimer)\b/i, lat: 50.9720, lng: 6.9450, name: 'Mauenheim' },
  { pattern: /\b(riehl|riehler)\b/i, lat: 50.9600, lng: 6.9750, name: 'Riehl' },
  { pattern: /\b(niehl|niehler)\b/i, lat: 50.9800, lng: 6.9600, name: 'Niehl' },
  { pattern: /\b(weidenpesch|weidenpescher)\b/i, lat: 50.9780, lng: 6.9450, name: 'Weidenpesch' },
  { pattern: /\b(longerich|longericher)\b/i, lat: 50.9850, lng: 6.9200, name: 'Longerich' },
  { pattern: /\b(bilderst(ö|oe)ckchen)\b/i, lat: 50.9700, lng: 6.9350, name: 'Bilderstöckchen' },
  { pattern: /\b(merkenich)\b/i, lat: 51.0250, lng: 6.9600, name: 'Merkenich' },
  { pattern: /\b(f(ü|ue)hlingen|f(ü|ue)hlinger)\b/i, lat: 51.0250, lng: 6.9200, name: 'Fühlingen' },
  { pattern: /\b(seeberg)\b/i, lat: 51.0150, lng: 6.9150, name: 'Seeberg' },
  { pattern: /\b(heimersdorf)\b/i, lat: 51.0100, lng: 6.8950, name: 'Heimersdorf' },
  { pattern: /\b(lindweiler)\b/i, lat: 51.0000, lng: 6.8850, name: 'Lindweiler' },
  { pattern: /\b(pesch|pescher)\b/i, lat: 50.9950, lng: 6.8750, name: 'Pesch' },
  { pattern: /\b(esch|auweiler)\b/i, lat: 51.0150, lng: 6.8600, name: 'Esch/Auweiler' },
  { pattern: /\b(volkhoven|weiler)\b/i, lat: 51.0150, lng: 6.8850, name: 'Volkhoven/Weiler' },
  { pattern: /\b(blumenberg)\b/i, lat: 51.0350, lng: 6.8950, name: 'Blumenberg' },
  { pattern: /\b(roggendorf|thenhoven)\b/i, lat: 51.0400, lng: 6.8650, name: 'Roggendorf/Thenhoven' },
  { pattern: /\b(worringen|worringer)\b/i, lat: 51.0500, lng: 6.8650, name: 'Worringen' },
  { pattern: /\b(poll|poller)\b/i, lat: 50.9150, lng: 6.9900, name: 'Poll' },
  { pattern: /\b(westhoven)\b/i, lat: 50.9000, lng: 7.0150, name: 'Westhoven' },
  { pattern: /\b(ensen|ensener)\b/i, lat: 50.8950, lng: 7.0300, name: 'Ensen' },
  { pattern: /\b(gremberghoven)\b/i, lat: 50.9000, lng: 7.0500, name: 'Gremberghoven' },
  { pattern: /\b(eil|eiler)\b/i, lat: 50.8850, lng: 7.0750, name: 'Eil' },
  { pattern: /\b(urbach|urbacher)\b/i, lat: 50.8750, lng: 7.0750, name: 'Urbach' },
  { pattern: /\b(elsdorf)\b/i, lat: 50.8650, lng: 7.0700, name: 'Elsdorf' },
  { pattern: /\b(grengel)\b/i, lat: 50.8650, lng: 7.0900, name: 'Grengel' },
  { pattern: /\b(wahnheide)\b/i, lat: 50.8550, lng: 7.0950, name: 'Wahnheide' },
  { pattern: /\b(wahn|wahner)\b/i, lat: 50.8550, lng: 7.0750, name: 'Wahn' },
  { pattern: /\b(lind|linder)\b/i, lat: 50.8450, lng: 7.0900, name: 'Lind' },
  { pattern: /\b(libur)\b/i, lat: 50.8350, lng: 7.0700, name: 'Libur' },
  { pattern: /\b(z(ü|ue)ndorf|z(ü|ue)ndorfer)\b/i, lat: 50.8700, lng: 7.0350, name: 'Zündorf' },
  { pattern: /\b(langel|langeler)\b/i, lat: 50.8500, lng: 7.0250, name: 'Langel' },
  { pattern: /\b(finkenberg)\b/i, lat: 50.8900, lng: 7.0600, name: 'Finkenberg' },
  { pattern: /\b(humboldt|gremberg)\b/i, lat: 50.9250, lng: 7.0000, name: 'Humboldt/Gremberg' },
  { pattern: /\b(h(ö|oe)henberg|h(ö|oe)henberger)\b/i, lat: 50.9420, lng: 7.0250, name: 'Höhenberg' },
  { pattern: /\b(ostheim|ostheimer)\b/i, lat: 50.9330, lng: 7.0380, name: 'Ostheim' },
  { pattern: /\b(merheim|merheimer)\b/i, lat: 50.9450, lng: 7.0450, name: 'Merheim' },
  { pattern: /\b(br(ü|ue)ck|br(ü|ue)cker)\b/i, lat: 50.9450, lng: 7.0850, name: 'Brück' },
  { pattern: /\b(rath\/heumar|rath|heumar)\b/i, lat: 50.9150, lng: 7.0750, name: 'Rath/Heumar' },
  { pattern: /\b(neubr(ü|ue)ck)\b/i, lat: 50.9300, lng: 7.0650, name: 'Neubrück' },
  { pattern: /\b(buchforst|buchforster)\b/i, lat: 50.9520, lng: 6.9980, name: 'Buchforst' },
  { pattern: /\b(buchheim|buchheimer)\b/i, lat: 50.9600, lng: 7.0180, name: 'Buchheim' },
  { pattern: /\b(holweide|holweider)\b/i, lat: 50.9700, lng: 7.0500, name: 'Holweide' },
  { pattern: /\b(dellbr(ü|ue)ck|dellbr(ü|ue)cker)\b/i, lat: 50.9780, lng: 7.0750, name: 'Dellbrück' },
  { pattern: /\b(h(ö|oe)henhaus|h(ö|oe)henhauser)\b/i, lat: 50.9800, lng: 7.0350, name: 'Höhenhaus' },
  { pattern: /\b(d(ü|ue)nnwald|d(ü|ue)nnwalder)\b/i, lat: 51.0050, lng: 7.0300, name: 'Dünnwald' },
  { pattern: /\b(stammheim|stammheimer)\b/i, lat: 50.9900, lng: 6.9950, name: 'Stammheim' },
  { pattern: /\b(flittard|flittarder)\b/i, lat: 51.0100, lng: 6.9800, name: 'Flittard' },
  { pattern: /\b(altstadt|altstadt-nord|altstadt-s(ü|ue)d)\b/i, lat: 50.9390, lng: 6.9600, name: 'Altstadt' },
  { pattern: /\b(neustadt|neustadt-nord|neustadt-s(ü|ue)d)\b/i, lat: 50.9320, lng: 6.9420, name: 'Neustadt' },
  { pattern: /\b(innenstadt)\b/i, lat: 50.9380, lng: 6.9580, name: 'Innenstadt' }
];

let emergenciesCache = {
  data: null,
  timestamp: 0
};

const CACHE_TTL_MS = 60 * 1000; // 60s

/**
 * Intelligent Multi-Stage District & Location Resolver
 */
export function detectDistrict(title, description = '') {
  const combined = `${title} ${description}`;

  // Stage 1: Check Specific Streets and Hotspots first
  for (const loc of SPECIFIC_LOCATIONS) {
    if (loc.pattern.test(combined)) {
      return { lat: loc.lat, lng: loc.lng, name: loc.name };
    }
  }

  // Stage 2: Check all 86 Veedel with inflection stems
  for (const veedel of VEEDEL_DICT) {
    if (veedel.pattern.test(combined)) {
      return { lat: veedel.lat, lng: veedel.lng, name: veedel.name };
    }
  }

  // Stage 3: Strict Anti-Dom Fallback
  // If no street, highway, or Veedel could be identified, do NOT plot a fake pin on Cologne Dom.
  return {
    lat: null,
    lng: null,
    name: 'Region Köln'
  };
}

/**
 * AI Entity Extractor for complex unmapped police reports using Gemini Flash
 */
export async function extractLocationViaAI(title, description) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const prompt = `Analysiere folgende Kölner Polizeimeldung und extrahiere den genauen Ort (Veedel, Straße, Autobahn oder Nachbarstadt im Kölner Raum).
Titel: ${title}
Text: ${description.slice(0, 350)}

Antworte STRENG als JSON-Objekt mit folgendem Format:
{"locationName": "z.B. Kalk / A44 / Leverkusen-Opladen / Venloer Str.", "isExact": true|false}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
      }),
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.locationName) {
          const reResult = detectDistrict(parsed.locationName, '');
          if (reResult.lat && reResult.lng) {
            return reResult;
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking fallback
  }
  return null;
}

function detectCategory(title, description) {
  const fullText = (title + ' ' + description).toLowerCase();
  if (fullText.includes('brand') || fullText.includes('feuer') || fullText.includes('rauch') || fullText.includes('feuerwehr') || fullText.includes('lösch')) {
    return 'fire';
  }
  if (fullText.includes('verkehrsunfall') || fullText.includes('zusammenstoß') || fullText.includes('unfall') || fullText.includes('kollision') || fullText.includes('sperrung')) {
    return 'accident';
  }
  if (fullText.includes('schüsse') || fullText.includes('tötung') || fullText.includes('mord') || fullText.includes('messer') || fullText.includes('sek') || fullText.includes('evakuierung')) {
    return 'critical';
  }
  return 'police';
}

function formatTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'gerade eben';
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  const diffDays = Math.floor(diffHours / 24);
  return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
}

export async function fetchCologneEmergencies() {
  const now = Date.now();
  if (emergenciesCache.data && (now - emergenciesCache.timestamp) < CACHE_TTL_MS) {
    return emergenciesCache.data;
  }

  try {
    const res = await fetch('https://www.presseportal.de/rss/dienststelle_12415.rss2', {
      headers: { 'User-Agent': 'KoelnLiveMonitor/2.0' }
    });

    if (!res.ok) {
      throw new Error(`Presseportal HTTP ${res.status}`);
    }

    const xml = await res.text();
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

    const emergencies = [];

    for (const it of itemMatches) {
      const rawTitle = (it.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.replace('<![CDATA[', '').replace(']]>', '').trim() || '';
      const link = (it.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]?.trim() || '';
      const guid = (it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1]?.trim() || link;
      const pubDate = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1]?.trim() || new Date().toISOString();
      const rawDesc = (it.match(/<description>([\s\S]*?)<\/description>/i) || [])[1]?.replace('<![CDATA[', '').replace(']]>', '').replace(/<[^>]+>/g, '').trim() || '';

      // Clean title prefix (e.g. POL-K: 260826-1-K)
      const cleanTitle = rawTitle.replace(/^POL-[A-Z]+:\s*\d+-[0-9A-Z\/]+-?\s*/i, '').trim();

      // Multi-stage location detection
      let districtInfo = detectDistrict(rawTitle, rawDesc);
      if (!districtInfo.lat) {
        const aiInfo = await extractLocationViaAI(rawTitle, rawDesc);
        if (aiInfo && aiInfo.lat) {
          districtInfo = aiInfo;
        }
      }
      const category = detectCategory(rawTitle, rawDesc);
      const isCritical = category === 'critical' || rawTitle.includes('Schüsse') || rawTitle.includes('Zeugen');

      const id = guid.split('/').pop() || `pol-${Date.parse(pubDate)}-${Math.floor(Math.random()*1000)}`;

      emergencies.push({
        id,
        source: 'Polizei Köln',
        category,
        title: cleanTitle || rawTitle,
        district: districtInfo.name,
        lat: districtInfo.lat,
        lng: districtInfo.lng,
        hasExactCoordinates: !!districtInfo.lat,
        pubDate: new Date(pubDate).toISOString(),
        timeAgo: formatTimeAgo(pubDate),
        description: rawDesc,
        link,
        isCritical
      });
    }

    // Save to SQLite
    if (emergencies.length > 0) {
      saveEmergencies(emergencies);
    }

    // Get combined from DB to also have historical items
    const allFromDB = getEmergenciesFromDB({ limit: 40 });
    const payload = {
      timestamp: new Date().toISOString(),
      count: allFromDB.length,
      emergencies: allFromDB.map(e => ({
        ...e,
        timeAgo: formatTimeAgo(e.pubDate)
      }))
    };

    emergenciesCache = {
      data: payload,
      timestamp: now
    };

    return payload;
  } catch (err) {
    console.error('Error fetching live emergencies:', err.message);
    // Fallback to SQLite DB
    const fallbackDB = getEmergenciesFromDB({ limit: 30 });
    return {
      timestamp: new Date().toISOString(),
      count: fallbackDB.length,
      emergencies: fallbackDB.map(e => ({
        ...e,
        timeAgo: formatTimeAgo(e.pubDate)
      })),
      isFallback: true
    };
  }
}

export default {
  fetchCologneEmergencies,
  detectDistrict
};
