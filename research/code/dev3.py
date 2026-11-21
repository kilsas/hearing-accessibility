import json,numpy as np,itertools
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
E=json.load(open('nuga/extra_feats.json'))
ALL=json.load(open('siteemu/site_lab.json'))
def prep(rs):
    for r in rs: r.update(E.get(r['file']+'|'+r['item'],{}))
    for s in {r['spk'] for r in rs}:
        rr=[r for r in rs if r['spk']==s and 'rate' in r]; m=np.median([r['rate'] for r in rr])
        for r in rr: r['rate_n']=r['rate']/m
    return rs
o=prep([r for r in ALL if r['role']=='dev'])
FEAT=['rise','front_wh','whdb_wh','pause_wh','rate_n','hasWh','endLevel']
def ok(r): return r['rise'] is not None and 'rate_n' in r
def fx(r):
    h=1.0 if r['item'][0]=='W' else 0.0
    el=r['pf']['endLevel'] if r['pf'] else 0.0
    return [r['rise'],(r['front'] or 0)*h,r['whdb']*h,r['pause']*h,r['rate_n'],h,el]
y=np.array([r['meaning'] in ('예/아니오','질문','의문사') for r in o]).astype(int)
spk=np.array([r['spk'] for r in o]); site=np.array([{'?':2,'faint':1,'.':0}[r['site']] for r in o]); K=np.array([ok(r) for r in o])
X=np.array([fx(r) if k else [0]*len(FEAT) for r,k in zip(o,K)],float)
mk=lambda: make_pipeline(StandardScaler(),LogisticRegression(C=1.0,max_iter=3000))
p=np.full(len(o),np.nan)
for s in np.unique(spk):
    tr=(spk!=s)&K; te=(spk==s)&K; p[te]=mk().fit(X[tr],y[tr]).predict_proba(X[te])[:,1]
NS=int((y==0).sum()); NQ=int((y==1).sum())
def cnt(l): S=y==0;Q=y==1; return dict(Sq=int(((l==2)&S).sum()),Sf=int(((l==1)&S).sum()),Qd=int(((l==0)&Q).sum()),Qf=int(((l==1)&Q).sum()))
def sc(c,w): return (c['Sq']+w*c['Sf'])/NS+(c['Qd']+w*c['Qf'])/NQ
def apply(pp,Tdd,Tdown,Tup):
    l=site.copy()
    l[K&(site==2)&(pp<Tdd)]=1; l[K&(site==1)&(pp<Tdown)]=0; l[K&(site==0)&(pp>=Tup)]=1
    return l
cb=cnt(site); print('site',cb,[round(sc(cb,w),3) for w in (.25,.5,.75)])
G=np.round(np.arange(0,1.0001,0.025),3); res=[]
for Tdd in G:
  for Tdown in G:
    for Tup in [1.01]+list(np.round(np.arange(0.5,1.0,0.05),2)):
        l=apply(p,Tdd,Tdown,Tup); c=cnt(l); f=(l==1).mean()
        if all(sc(c,w)<sc(cb,w) for w in (.25,.5,.75)) and c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'] and f<=0.30:
            res.append((round(sc(c,.5),4),round(f,3),Tdd,Tdown,Tup,c,[round(sc(c,w),3) for w in (.25,.5,.75)]))
res.sort(key=lambda t:(t[0],t[1])); print('passed',len(res))
for t in res[:6]: print(t)
from sklearn.metrics import roc_auc_score
print('AUC LOSO',round(roc_auc_score(y[K],p[K]),3),' AUC on W statements vs wh-questions', round(roc_auc_score(y[K&(np.array([r['item'][0]=='W' for r in o]))],p[K&(np.array([r['item'][0]=='W' for r in o]))]),3))
simple=[t for t in res if t[4]==1.01]; simple.sort(key=lambda t:(t[0],t[1])); print('best without .->faint',simple[0])
b=simple[0]
# neighborhood stability
for dd in (-0.05,0,0.05):
  for dn in (-0.05,0,0.05):
    l=apply(p,b[2]+dd,b[3]+dn,1.01); c=cnt(l); print(round(b[2]+dd,3),round(b[3]+dn,3),c,[round(sc(c,w),3) for w in (.25,.5,.75)])
final=mk().fit(X[K],y[K]); lr=final[-1]; scl=final[0]
json.dump(dict(features=FEAT,coef=lr.coef_[0].tolist(),intercept=float(lr.intercept_[0]),mean=scl.mean_.tolist(),scale=scl.scale_.tolist(),Tdd=float(b[2]),Tdown=float(b[3]),Tup=None,dev_counts=b[5],dev_scores=b[6],dev_faint=b[1],site_dev=cb),open('siteemu/rule_v3_fixed.json','w'),ensure_ascii=False)
print('coef',dict(zip(FEAT,np.round(lr.coef_[0],3))),round(lr.intercept_[0],3))
