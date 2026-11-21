import json,numpy as np
R=json.load(open('rule_fixed.json'))
test=[r for r in json.load(open('praat_main_all.json')) if not r['dev'] and not r['excluded'] and 'end_rise' in r]
Xt=np.array([[r['end_rise'],r['end_level'],(r['wh']!='(없음)')*r.get('wh_rise',0),float(r['wh']!='(없음)'),(r['wh']!='(없음)')*r['end_rise']] for r in test])
z=(Xt-np.array(R['mean']))/np.array(R['scale']); p=1/(1+np.exp(-(z@np.array(R['coef'])+R['intercept'])))
y=np.array([r['meaning'] in ('예/아니오','질문','의문사') for r in test]).astype(int)
NS=int((y==0).sum()); NQ=int((y==1).sum())
def counts(l):
    S=y==0;Q=y==1; return dict(Sq=int(((l==2)&S).sum()),Sf=int(((l==1)&S).sum()),Qd=int(((l==0)&Q).sum()),Qf=int(((l==1)&Q).sum()))
def score(c,w): return (c['Sq']+w*c['Sf'])/NS+(c['Qd']+w*c['Qf'])/NQ
lbl=np.where(p>=R['T_high'],2,np.where(p<R['T_low'],0,1)); c=counts(lbl); base=np.where(Xt[:,0]>=4,2,0); cb=counts(base)
faint=(lbl==1).mean()
conds=[all(score(c,w)<score(cb,w) for w in (0.25,0.5,0.75)), c['Sq']<=cb['Sq'] and c['Qd']<=cb['Qd'], faint<=0.30]
print('N',NS,NQ); print('new',c,{w:round(score(c,w),3) for w in (0.25,0.5,0.75)},'faint',round(faint,3)); print('base',cb,{w:round(score(cb,w),3) for w in (0.25,0.5,0.75)}); print('conds',conds)
meanings=['예/아니오','질문','의문사','평서','평서문']
for m in meanings:
    idx=[i for i,r in enumerate(test) if r['meaning']==m]; l=lbl[idx]
    print(m,len(idx),'? %d faint %d . %d'%((l==2).sum(),(l==1).sum(),(l==0).sum()),'| base ? %d'%(base[idx]==2).sum())
for g,cond in [('M',lambda r:int(r['spk'][1:])<13),('F',lambda r:int(r['spk'][1:])>=13)]:
    idx=[i for i,r in enumerate(test) if cond(r)]; yy=y[idx]; l=lbl[idx]
    print(g,'S? %d/%d  Q. %d/%d'%(((l==2)&(yy==0)).sum(),(yy==0).sum(),((l==0)&(yy==1)).sum(),(yy==1).sum()))
json.dump(dict(new=c,base=cb,conds=conds,faint=float(faint),NS=NS,NQ=NQ),open('rule_test_result.json','w'))
