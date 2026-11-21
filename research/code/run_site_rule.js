// End-to-end check of the pushed site code at the site's own sample rate (16 kHz).
const fs=require('fs'), vm=require('vm');
function load(){const win={location:{search:''}};const ctx={window:win,console,Date,Math,Float64Array,Uint32Array,Float32Array,Int16Array,Array,Object,JSON};vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);return win.HEARQ;}
const job=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
function readWav(p){const b=fs.readFileSync(p);let o=12,sr=0,data=null;while(o<b.length){const id=b.toString('ascii',o,o+4),sz=b.readUInt32LE(o+4);if(id==='fmt ')sr=b.readUInt32LE(o+12);if(id==='data')data=new Int16Array(b.buffer.slice(b.byteOffset+o+8,b.byteOffset+o+8+sz));o+=8+sz+(sz%2);}const x=new Float64Array(data.length);for(let i=0;i<data.length;i++)x[i]=data[i]/32768;return {x,sr};}
const med=m=>{const s=m.slice().sort((p,q)=>p-q),k=s.length>>1;return s.length%2?s[k]:(s[k-1]+s[k])/2;};
const out=[];
for(const cfg of [[false,false],[true,true]]){
  const H=load(); H.v3RuleOn=false; H.probRuleOn=false; H.fallRuleOn=cfg[0]; H.choiceRuleOn=cfg[1];
  for(const f of job.files){
    const {x,sr}=readWav(f.wav); if(sr!==16000) throw 'sr '+sr;
    H._v3Reset(); const buf=[];
    for(const [a,b,text,item] of f.segs){
      const s0=Math.max(0,Math.round((a-0.05)*sr)), s1=Math.min(x.length,Math.round((b+0.05)*sr));
      const seg=x.slice(s0,s1); const pt=H._pitchTrack(seg,sr); const fr=H._finalRise(pt.st,pt.hop);
      const cut=a-60; let all=[],sec=0; buf.forEach(q=>{if(q.t>=cut){const v=q.vals.filter(z=>z!=null);all=all.concat(v);sec+=v.length*q.hop;}});
      let B=null; if(sec>=10){const B0=med(all);B=med(all.map(v=>{const d=v-B0;return d>9.18?v-12:(d<-8.84?v+12:v);}));}
      buf.push({t:a,vals:(pt.abs||[]),hop:pt.hop});
      const key=s0+':'+seg.length;
      const r= fr? {rise:fr.rise,front:H._frontRise(pt.st,pt.hop),question:fr.rise>=H.threshold,audio:seg,st:pt.st,abs:pt.abs,hop:pt.hop,B,w0:fr.w0,last:fr.last,key}
                : {rise:null,question:false,audio:seg,st:pt.st,abs:pt.abs,hop:pt.hop,B};
      const q=H.decide(text,r).question, u=H.uncertain(text,r);
      out.push({cfg:cfg.join(),file:f.id,item,mark:q?'?':(u?'faint':'.')});
    }
  }
}
fs.writeFileSync(process.argv[4],JSON.stringify(out)); console.log('done',out.length);
