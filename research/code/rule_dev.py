import json,numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
ALL=json.load(open('praat_main_all.json'))
dev=[r for r in ALL if r['dev'] and not r['excluded'] and 'end_rise' in r]   # test speakers NOT loaded below
def X(rs):
    return np.array([[r['end_rise'],r['end_level'],(r['wh']!='(없음)')*r.get('wh_rise',0),float(r['wh']!='(없음)'),(r['wh']!='(없음)')*r['end_rise']] for r in rs])
y=np.array([r['meaning'] in ('예/아니오','질문','의문사') for r in dev]).astype(int)
spk=np.array([r['spk'] for r in dev]); Xd=X(dev)
def model(): return make_pipeline(StandardScaler(),LogisticRegression(C=1.0,max_iter=1000))
p=np.zeros(len(dev))
for s in np.unique(spk):
    tr=spk!=s; m=model().fit(Xd[tr],y[tr]); p[~tr]=m.predict_proba(Xd[~tr])[:,1]
NS=int((y==0).sum()); NQ=int((y==1).sum())
def counts(lbl):  # lbl: 2='?',1=faint,0='.'
    S=y==0;Q=y==1
    return dict(Sq=int(((lbl==2)&S).sum()),Sf=int(((lbl==1)&S).sum()),Qd=int(((lbl==0)&Q).sum()),Qf=int(((lbl==1)&Q).sum()))
def score(c,w): return (c['Sq']+w*c['Sf'])/NS+(c['Qd']+w*c['Qf'])/NQ
base=np.where(Xd[:,0]>=4,2,0); cb=counts(base)
print('N statements',NS,'questions',NQ,'baseline(4st)',cb,{w:round(score(cb,w),3) for w in (0.25,0.5,0.75)})
grid=np.round(np.arange(0.05,0.96,0.05),2); passed=[]
for lo in grid:
    for hi in grid:
        if hi<lo: continue
        lbl=np.where(p>=hi,2,np.where(p<lo,0,1)); c=counts(lbl); faint=(lbl==1).mean()
        ok=all(score(c,w)<score(cb,w) for w in (0.25,0.5,0.75)) and c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'] and faint<=0.30
        if ok: passed.append((round(score(c,0.5),4),round(faint,3),lo,hi,c))
passed.sort(key=lambda t:(t[0],t[1]))
print('passed',len(passed)); 
for t in passed[:5]: print(t)
final=model().fit(Xd,y); lr=final[-1]; sc=final[0]
print('coef (standardized)',dict(zip(['end_rise','end_level','wh_rise','has_wh','has_wh*end_rise'],np.round(lr.coef_[0],2))),'intercept',round(lr.intercept_[0],2))
print('means',np.round(sc.mean_,2),'sds',np.round(sc.scale_,2))
if passed:
    best=passed[0]; json.dump(dict(T_low=best[2],T_high=best[3],coef=lr.coef_[0].tolist(),intercept=float(lr.intercept_[0]),mean=sc.mean_.tolist(),scale=sc.scale_.tolist(),features=['end_rise','end_level','wh_rise','has_wh','has_wh*end_rise'],cv_counts=best[4],baseline=cb,NS=NS,NQ=NQ),open('rule_fixed.json','w'),ensure_ascii=False)
