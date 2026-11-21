import json,csv,numpy as np,itertools,re
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
d=json.load(open('main/main.json')); items={r[0]:r for r in d['items']}; DEV=set(d['dev'])
spl={('S10',k) for k in json.load(open('nuga/wav_main/S10_segs.json'))['spliced']}
rows={r['clip']:r for r in csv.DictReader(open('hear_eval/HEAR_question_mark_test/answers.csv',encoding='utf-8-sig'))}
A=[]
for r in json.load(open('siteemu/f16_main.json')):
    spk=r['file'][:3]; it=items[r['item']]
    if it[7].startswith('사용 안 함') or (spk,r['item']) in spl or spk not in DEV: continue
    r['src']='main'; r['spk']=spk; r['y']=int(it[3] in ('예/아니오','질문','의문사')); A.append(r)
for r in json.load(open('siteemu/f16_A.json')):
    r['src']='A'; r['spk']=r['file']; r['y']=int(items[r['item']][3] in ('예/아니오','질문','의문사')); A.append(r)
for r in json.load(open('siteemu/f16_464.json')):
    r['src']='464'; r['spk']='old_'+r['file']; r['y']=int(rows[r['item']]['is_question']=='1'); A.append(r)
FEAT=['rise','front_wh','whdb_wh','pause_wh','rate_n','hasWh','endLevel','nsyl']
def fx(r):
    h=r['hasWh']; n=len(re.findall('[가-힣]',r['text']))
    return [r['rise'],(r['front'] or 0)*h,r.get('whdb',0)*h,r.get('pause',0)*h,r.get('rate_n',1.0),h,r['endLevel'],n]
K=np.array([r['rise'] is not None and 'whdb' in r and not r['ending'] for r in A])
X=np.array([fx(r) if k else [0]*8 for r,k in zip(A,K)],float); y=np.array([r['y'] for r in A]); spk=np.array([r['spk'] for r in A]); src=np.array([r['src'] for r in A])
site=np.array([{'?':2,'faint':1,'.':0}[r['site']] for r in A])
mk=lambda: make_pipeline(StandardScaler(),LogisticRegression(C=1.0,max_iter=3000,class_weight='balanced'))
p=np.full(len(A),np.nan)
for s in np.unique(spk):
    tr=(spk!=s)&K; te=(spk==s)&K
    if te.any(): p[te]=mk().fit(X[tr],y[tr]).predict_proba(X[te])[:,1]
def cnt(l,m): S=(y==0)&m;Q=(y==1)&m; return dict(Sq=int(((l==2)&S).sum()),Sf=int(((l==1)&S).sum()),Qd=int(((l==0)&Q).sum()),Qf=int(((l==1)&Q).sum()))
def sc(c,m,w): NS=((y==0)&m).sum(); NQ=((y==1)&m).sum(); return (c['Sq']+w*c['Sf'])/NS+(c['Qd']+w*c['Qf'])/NQ
def apply(Tdd,Tdown,Tup):
    l=site.copy(); l[K&(site==2)&(p<Tdd)]=1; l[K&(site==1)&(p<Tdown)]=0; l[K&(site==0)&(p>=Tup)]=1; return l
subs={'main':src=='main','464':src=='464','A':src=='A'}
for nm,m in subs.items(): c=cnt(site,m); print('site',nm,c,[round(sc(c,m,w),3) for w in (.25,.5,.75)])
G=np.round(np.arange(0,1.0001,0.05),2); res=[]
for Tdd,Tdown,Tup in itertools.product(G,G,np.append(np.round(np.arange(0.5,1.0,0.05),2),1.01)):
    l=apply(Tdd,Tdown,Tup); ok=True; tot=0
    for nm,m in subs.items():
        c=cnt(l,m); cb=cnt(site,m); f=(l[m]==1).mean()
        if not (all(sc(c,m,w)<sc(cb,m,w) for w in (.25,.5,.75)) and c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'] and f<=0.30): ok=False;break
        tot+=sc(c,m,.5)
    if ok: res.append((round(tot,4),Tdd,Tdown,Tup,{nm:cnt(l,m) for nm,m in subs.items()},{nm:[round(sc(cnt(l,m),m,w),3) for w in (.25,.5,.75)] for nm,m in subs.items()}))
res.sort(key=lambda t:t[0]); print('passed both',len(res))
for t in res[:6]: print(t)
json.dump(dict(res=[list(map(lambda v: v if not isinstance(v,np.floating) else float(v),t)) for t in res[:50]]),open('siteemu/dev5_res.json','w'),default=float)
import pickle; pickle.dump(dict(p=p,K=K,site=site,y=y,src=src,X=X,spk=spk),open('siteemu/dev5.pkl','wb'))
