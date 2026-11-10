const fs=require('fs');
let rows=[],tot=0,totB=0,fail=0;
for(const f of fs.readdirSync('.')){
  if(!f.endsWith('.ts')||f==='TEMPLATE.ts')continue;
  let s=fs.readFileSync(f,'utf8');
  // drop header comment block, keep from first "const NAME = {" at line start after comment end
  const i=s.indexOf('*/'); if(i>=0) s=s.slice(i+2);
  s=s.replace(/export default \w+;?\s*$/,'').replace(/^\s*const\s+\w+\s*=\s*/m,'module.exports = ');
  try{
    const m={exports:{}}; new Function('module','exports',s)(m,m.exports); const d=m.exports;
    const st=d.states||d.countries||[]; const b=fs.statSync(f).size; tot+=st.length; totB+=b;
    rows.push({f:f.replace('.ts',''),n:st.length,b,vb:d.viewBox,codes:st.slice(0,3).map(x=>x.code).join('/'),cap:(d.capitals||[]).length,lab:(d.labels||[]).length,names:st.map(x=>x.code+':'+x.name)});
  }catch(e){fail++;rows.push({f,n:'ERR',err:String(e).slice(0,80)});}
}
console.log('files',rows.length,'fail',fail,'total regions',tot,'MB',(totB/1e6).toFixed(1));
for(const p of ['CAMEROON','NIGERIA','FRANCE','USA','SENEGAL','MOROCCO','KENYA','COTE_D_IVOIRE','DRC','GB','ANDORRA','CHINA']){const r=rows.find(x=>x.f===p);if(r)console.log(p,r.n,(r.b/1e3|0)+'KB',r.vb,r.codes,'cap',r.cap,'lab',r.lab);}
const small=rows.filter(r=>typeof r.n==='number'&&r.n<=2).map(r=>r.f+':'+r.n);console.log('<=2 regions:',small.length,small.join(','));
const noCap=rows.filter(r=>r.cap===0).length;console.log('maps with capitals',rows.filter(r=>r.cap>0).length,'without',noCap);
const fmt={};rows.forEach(r=>{if(r.codes){const k=/^[A-Z]{2}-/.test(r.codes)?'ISO-3166-2 style (XX-YY)':/^[A-Z]{4}/.test(r.codes)?'4-letter (CMOU style)':'other';fmt[k]=(fmt[k]||0)+1}});console.log('code formats',fmt);
const cm=rows.find(x=>x.f==='CAMEROON');console.log(cm.names.join('; '));
console.log('heaviest',rows.slice().sort((a,b)=>b.b-a.b).slice(0,8).map(r=>r.f+':'+(r.b/1e3|0)+'KB/'+r.n).join(', '));
