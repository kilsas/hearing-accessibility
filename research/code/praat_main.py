import sys,json,numpy as np
sys.path.insert(0,'code'); import pitch as P
from measure import seg2
from scipy.ndimage import median_filter
d=json.load(open('../main/main.json')); items={r[0]:r for r in d['items']}
DEV=set(d['dev'])
def segs_for(f):
    x=P.load(f'wav_main/{f}.wav'); s=seg2(x,min_sil=0.25 if int(f[1:3])>=13 else 0.5,min_len=0.2)
    if f=='S07':
        i=[k for k,(a,b) in enumerate(s) if 77<a<78][0]; s=s[:i]+[(77.6,78.34),(78.83,s[i][1])]+s[i+1:]
    if f=='S10':
        i=[k for k,(a,b) in enumerate(s) if 85<a<86][0]; a0,b0=s[i]; s=s[:i]+[(a0,86.57),(87.31,b0)]+s[i+1:]
    return s
files=[('S01','S01',d['orders_v1_S01']),('S01','S01_add',d['s01_addon'])]+[(f'S{n:02d}',f'S{n:02d}',d['orders'][f'S{n:02d}']) for n in range(2,25)]
EXCL={('S10',k) for k in json.load(open('wav_main/S10_segs.json'))['spliced']}
out=[];qc={}
# speaker median from all files of speaker
for spk,f,order in files:
    a_=np.genfromtxt(f'ptxt_main/{f}_pitch.txt',skip_header=1,missing_values='NA',filling_values=np.nan); tt,ff0=a_[:,0],a_[:,1]
    ib=np.genfromtxt(f'ptxt_main/{f}_intensity.txt',skip_header=1,missing_values='NA',filling_values=np.nan); it,idb=ib[:,0],ib[:,1]
    s=segs_for(f); ins=np.zeros(len(tt),bool)
    for a,b in s: ins|=(tt>=a-0.05)&(tt<=b+0.05)
    ff0=np.where(ins,ff0,np.nan)
    lg=np.log2(ff0[~np.isnan(ff0)]); h,e=np.histogram(lg,bins=np.arange(np.log2(75),np.log2(500)+1/24,1/24)); h=np.convolve(h,np.ones(5)/5,'same')
    mode=2**((e[np.argmax(h)]+e[np.argmax(h)+1])/2)
    medraw=np.nanmedian(ff0); med=mode; fold_hi=np.nansum(ff0>1.7*med); fold_lo=np.nansum(ff0<0.6*med)
    ff=np.where(ff0>1.7*med,ff0/2,ff0); ff=np.where(ff<0.6*med,ff*2,ff)
    med=np.nanmedian(ff)
    q=qc.setdefault(spk,{'median_hz':[],'voiced':0,'fold':0,'n_low':0})
    q['median_hz'].append((round(float(medraw)),round(float(mode)))); q['voiced']+=int(np.sum(~np.isnan(ff0))); q['fold']+=int(fold_hi+fold_lo)
    assert len(s)==len(order),(f,len(s),len(order))
    for iid,(a,b) in zip(order,s):
        r=items[iid]
        if r[7].startswith('사용 안 함'): continue
        rec=dict(spk=spk,file=f,item=iid,sent=r[5],wh=r[2],meaning=r[3],dev=spk in DEV,seg=[round(a,2),round(b,2)],excluded=(spk,iid) in EXCL)
        w=(tt>=a-0.05)&(tt<=b+0.05)&~np.isnan(ff); t=tt[w]; st=12*np.log2(ff[w]/med)
        if len(t)<10: rec['status']='음높이 부족'; q['n_low']+=1; out.append(rec); continue
        rm=median_filter(st,7,mode='nearest'); k=abs(st-rm)<=3; t,st=t[k],st[k]
        st=median_filter(st,5,mode='nearest'); T=t[-1]-t[0]; rt=t-t[0]
        endv=float(np.median(st[rt>=T-0.05])); low=float(st[rt>=0.4*T].min())
        nsyl=sum('가'<=c<='힣' for c in r[5]); wend=T*2/nsyl+0.05
        win=(rt>=0.05)&(rt<=wend)
        if win.sum()>=3:
            di=np.where(win)[0][np.argmax(st[win])]; pre=st[(rt>=0.05)&(rt<=rt[di])].min()
            rec['wh_rise']=round(float(st[di]-pre),2)
        rec['end_rise']=round(endv-low,2); rec['end_level']=round(endv,2)
        out.append(rec)
json.dump(out,open('praat_main_all.json','w'),ensure_ascii=False)
for spk,q in qc.items(): print(spk,'dev' if spk in DEV else 'test',q['median_hz'],'voiced frames',q['voiced'],'folded %.1f%%'%(100*q['fold']/max(q['voiced'],1)),'low-pitch sentences',q['n_low'])
