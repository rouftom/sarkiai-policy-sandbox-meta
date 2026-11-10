import { createMap } from './dist/index.js';
import zlib from 'zlib';
const t0=performance.now();
const svg = createMap('world',{showTooltip:true});
const t1=performance.now();
console.log('generation ms', (t1-t0).toFixed(2));
console.log('svg bytes', svg.length, 'gzip', zlib.gzipSync(svg).length, 'brotli', zlib.brotliCompressSync(svg).length);
const nPaths=(svg.match(/<path/g)||[]).length; console.log('path elements', nPaths);
const ids=[...svg.matchAll(/id="([A-Z]{2})"/g)].map(m=>m[1]); const dup=ids.length-new Set(ids).size;
console.log('id attrs', ids.length, 'unique', new Set(ids).size, 'DUPLICATE ids', dup);
const titles=(svg.match(/<title>/g)||[]).length; console.log('<title> elements', titles);
const noTitle = createMap('world',{showTooltip:false}); console.log('without tooltip bytes', noTitle.length);
console.log('<style> blocks per call:', (svg.match(/<style>/g)||[]).length);
const a=createMap('world').match(/state-map-\d+/)[0], b=createMap('world').match(/state-map-\d+/)[0]; console.log('class per call changes:', a, '->', b);
console.log('has tabindex/role/aria?', /tabindex|role=|aria-/.test(svg));
console.log('has viewBox:', /viewBox="[^"]+"/.exec(svg)[0], '| fixed width/height attrs:', /height="[^"]+"\s+width="[^"]+"/.test(svg.replace(/\s+/g,' ')));
// Special chars in names
import W from './dist/maps/World.js';
const odd=W.countries.filter(c=>/[&<>"']/.test(c.name)).map(c=>c.name); console.log('names with special chars', odd);
// UN members missing check
const UN=`AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW`.split(/\s+/);
const have=new Set(W.countries.map(c=>c.code));
console.log('UN list size', UN.length, 'missing from map:', UN.filter(c=>!have.has(c)));
console.log('non-UN entries in map (territories etc):', W.countries.filter(c=>!UN.includes(c.code)).map(c=>c.code+':'+c.name).join(', '));
