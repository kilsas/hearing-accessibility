import json,numpy as np,itertools
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
o=[r for r in json.load(open('siteemu/site_lab.json')) if r['role']=='dev']   # dev only
y=np.array([r['meaning'] in ('예/아니오','질문','의문사') for r in o]).astype(int)
spk=np.array([r['spk'] for r in o]); site=np.array([{'?':2,'faint':1,'.':0}[r['site']] for r in o])
ok=np.array([r['pf'] is not None and r['rise'] is not None for r in o])
FEAT=['rise','front_wh','endRise','endLevel','whRise_wh','hasWh']
def feats(r):
    pf=r['pf']; h=pf['hasWh']
    return [r['rise'],(r['front'] or 0)*h,pf['endRise'],pf['endLevel'],pf['whRise']*h,h]
X=np.array([feats(r) if k else [0]*6 for r,k in zip(o,ok)],float)
mk=lambda: make_pipeline(StandardScaler(),LogisticRegression(C=1.0,max_iter=2000))
p=np.full(len(o),np.nan)
for s in np.unique(spk):
    tr=(spk!=s)&ok; te=(spk==s)&ok; m=mk().fit(X[tr],y[tr]); p[te]=m.predict_proba(X[te])[:,1]
NS=int((y==0).sum()); NQ=int((y==1).sum())
def cnt(l): S=y==0;Q=y==1; return dict(Sq=int(((l==2)&S).sum()),Sf=int(((l==1)&S).sum()),Qd=int(((l==0)&Q).sum()),Qf=int(((l==1)&Q).sum()))
def sc(c,w): return (c['Sq']+w*c['Sf'])/NS+(c['Qd']+w*c['Qf'])/NQ
def apply(pp,site,ok,Tdd,Tdown,Tup):
    l=site.copy()
    m=ok&(site==2)&(pp<Tdd); l[m]=1          # dark ? -> faint when p very low
    m=ok&(site==1)&(pp<Tdown); l[m]=0        # faint -> . when p low
    m=ok&(site==0)&(pp>=Tup); l[m]=1         # . -> faint when p high
    return l
cb=cnt(site); print('NS',NS,'NQ',NQ,'site',cb,[round(sc(cb,w),3) for w in (.25,.5,.75)],'faint',round((site==1).mean(),3))
G=np.round(np.arange(0.0,1.0001,0.05),2); res=[]
for Tdd,Tdown,Tup in itertools.product(G,G,np.append(G,1.01)):
    l=apply(p,site,ok,Tdd,Tdown,Tup); c=cnt(l); f=(l==1).mean()
    if all(sc(c,w)<sc(cb,w) for w in (.25,.5,.75)) and c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'] and f<=0.30:
        res.append((round(sc(c,.5),4),round(f,3),Tdd,Tdown,Tup,c,[round(sc(c,w),3) for w in (.25,.5,.75)]))
res.sort(key=lambda t:(t[0],t[1])); print('passed',len(res))
for t in res[:8]: print(t)
final=mk().fit(X[ok],y[ok]); lr=final[-1]; scl=final[0]
if res:
    b=res[0]; json.dump(dict(features=FEAT,coef=lr.coef_[0].tolist(),intercept=float(lr.intercept_[0]),mean=scl.mean_.tolist(),scale=scl.scale_.tolist(),Tdd=b[2],Tdown=b[3],Tup=b[4],dev_counts=b[5],dev_scores=b[6],dev_faint=b[1],site_dev=cb),open('siteemu/rule_v3_fixed.json','w'),ensure_ascii=False)
    print('coef',dict(zip(FEAT,np.round(lr.coef_[0],3))),round(lr.intercept_[0],3))
