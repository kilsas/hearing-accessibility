import json,csv,numpy as np,itertools
d=json.load(open('main/main.json')); items={r[0]:r for r in d['items']}; DEV=set(d['dev'])
spl={('S10',k) for k in json.load(open('nuga/wav_main/S10_segs.json'))['spliced']}
rows={r['clip']:r for r in csv.DictReader(open('hear_eval/HEAR_question_mark_test/answers.csv',encoding='utf-8-sig'))}
A=[]
for r in json.load(open('siteemu/f16_main.json')):
    spk=r['file'][:3]; it=items[r['item']]
    if it[7].startswith('사용 안 함') or (spk,r['item']) in spl or spk not in DEV: continue
    r['src']='main'; r['y']=int(it[3] in ('예/아니오','질문','의문사')); A.append(r)
for r in json.load(open('siteemu/f16_464.json')): r['src']='464'; r['y']=int(rows[r['item']]['is_question']=='1'); A.append(r)
for r in json.load(open('siteemu/f16_A.json')): r['src']='A'; r['y']=int(items[r['item']][3] in ('예/아니오','질문','의문사')); A.append(r)
y=np.array([r['y'] for r in A]); src=np.array([r['src'] for r in A]); site=np.array([{'?':2,'faint':1,'.':0}[r['site']] for r in A])
rise=np.array([r['rise'] if r['rise'] is not None else np.nan for r in A]); wh=np.array([r['hasWh'] for r in A]); end=np.array([r['ending'] for r in A])
def emu(T,lo,Tn=None,lon=None):
    # wh sentences use (T,lo); non-wh use (Tn, lon) with faint band too if lon given
    Tn=T if Tn is None else Tn
    l=np.zeros(len(A),int)
    ok=~np.isnan(rise)
    l[ok&(wh==1)&(rise>=T)]=2; l[ok&(wh==1)&(rise>=lo)&(rise<T)]=1
    l[ok&(wh==0)&(rise>=Tn)]=2
    if lon is not None: l[ok&(wh==0)&(rise>=lon)&(rise<Tn)]=1
    l[end]=site[end]   # ending-decided sentences unchanged
    return l
print('replication match', (emu(4,2)==site).mean())
def cnt(l,m): S=(y==0)&m;Q=(y==1)&m; return dict(Sq=int(((l==2)&S).sum()),Sf=int(((l==1)&S).sum()),Qd=int(((l==0)&Q).sum()),Qf=int(((l==1)&Q).sum()))
def sc(c,m,w): NS=((y==0)&m).sum(); NQ=((y==1)&m).sum(); return (c['Sq']+w*c['Sf'])/NS+(c['Qd']+w*c['Qf'])/NQ
subs={k:src==k for k in ('main','464','A')}
G=np.arange(2,9.01,0.25); res=[]
for T,lo,Tn in itertools.product(G,np.arange(0,6.01,0.25),G):
    if lo>T: continue
    for lon in [None]+list(np.arange(0,6.01,0.5)):
        if lon is not None and lon>Tn: continue
        l=emu(T,lo,Tn,lon); ok=True; tot=0
        for k,m in subs.items():
            c=cnt(l,m); cb=cnt(site,m); f=(l[m]==1).mean()
            if not (all(sc(c,m,w)<sc(cb,m,w) for w in (.25,.5,.75)) and c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'] and f<=0.3): ok=False;break
            tot+=sc(c,m,.5)
        if ok: res.append((round(tot,4),T,lo,Tn,lon,{k:cnt(l,m) for k,m in subs.items()}))
res.sort(key=lambda t:t[0]); print('passed all three',len(res))
for t in res[:8]: print(t)
json.dump([list(map(lambda v: float(v) if isinstance(v,(np.floating,)) else v,t)) for t in res],open('siteemu/dev6_res.json','w'),default=float)
