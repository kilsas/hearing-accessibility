import json,numpy as np
exec(open('code/rule_dev.py').read().split("grid=np.round")[0])
grid=np.round(np.arange(0.05,0.96,0.05),2); rows=[]
for T in grid:
    lbl=np.where(Xd[:,0]>=4,2,np.where(p>=T,1,0)); c=counts(lbl); faint=(lbl==1).mean()
    ok=[all(score(c,w)<score(cb,w) for w in (0.25,0.5,0.75)), c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'], faint<=0.30]
    rows.append((T,c,round(faint,3),[round(score(c,w),3) for w in (0.25,0.5,0.75)],ok))
for r in rows: print(r)
ps=[r for r in rows if all(r[4])]; ps.sort(key=lambda r:(r[3][1],r[2])); print('best',ps[0] if ps else None)
R=json.load(open('rule_fixed.json')); R2=dict(R); R2.update(kind='hybrid',T_faint=float(ps[0][0]),dev_counts=ps[0][1],dev_scores=ps[0][3],dev_faint=ps[0][2])
json.dump(R2,open('rule_hybrid_fixed.json','w'),ensure_ascii=False)
