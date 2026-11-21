import{mkdirSync,readFileSync,readdirSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output',DX=[0,0,-1,1],DY=[-1,1,0,0],L='udlr',CAP=2e5;
function solve(t){
let R=t.split('\n').filter(x=>x.length),W=Math.max(...R.map(x=>x.length)),H=R.length,N=W*H;
let wl=new Uint8Array(N).fill(1),gl=new Uint8Array(N),bx=[],pl=-1,ng=0;
R.forEach((r,y)=>{for(let x=0;x<r.length;x++){let c=r[x],i=y*W+x;if(c=='#')continue;wl[i]=0;if(c=='.'||c=='*'||c=='+'){gl[i]=1;ng++}if(c=='$'||c=='*')bx.push(i);if(c=='@'||c=='+')pl=i}});
let hr=(pl/W)|0,nb=(c,d)=>c+DY[d]*W+DX[d];
let fl=(s,bs,wk)=>{let q=[s],rg=new Uint8Array(N),m=s;rg[s]=1;for(let h=0;h<q.length;h++){let c=q[h];if(c<m)m=c;for(let d=0;d<4;d++){let n=nb(c,d);if(n<0||n>=N||rg[n]||!wk[n]||bs.includes(n))continue;rg[n]=1;q.push(n)}}return[m,rg]};
let wp=(a,b,bs,wk)=>{if(a==b)return'';let pv=new Int32Array(N).fill(-1),pd=new Int8Array(N),q=[a];pv[a]=a;for(let h=0;h<q.length;h++){let c=q[h];for(let d=0;d<4;d++){let n=nb(c,d);if(n<0||n>=N||pv[n]>=0||!wk[n]||bs.includes(n))continue;pv[n]=c;pd[n]=d;q.push(n);if(n==b){let s='';for(let x=b;x!=a;x=pv[x])s=L[pd[x]]+s;return s}}}return null};
let SR=(wk,bk,b0,g0,en,dr)=>{
let n=b0.length;
let ds=g0.map(g=>{let d=new Int16Array(N).fill(-1),q=[g];d[g]=0;for(let h=0;h<q.length;h++){let c=q[h];for(let k=0;k<4;k++){let m=nb(c,k);if(m<0||m>=N||d[m]>=0||!bk[m])continue;d[m]=d[c]+1;q.push(m)}}return d});
let lv=new Uint8Array(N),lq=[...g0];g0.forEach(g=>lv[g]=1);
for(let h=0;h<lq.length;h++){let y=lq[h];for(let k=0;k<4;k++){let D=DY[k]*W+DX[k],x=y-D,o=x-D;if(x<0||x>=N||o<0||o>=N||!bk[x]||!wk[o]||lv[x])continue;lv[x]=1;lq.push(x)}}
let hc=new Map();
let hh=b=>{let k=b.join();if(hc.has(k))return hc.get(k);let m=1/0,a=[...Array(n).keys()];
let pm=(a,i)=>{if(i==a.length){let s=0;for(let j=0;j<n;j++){let d=ds[a[j]][b[j]];if(d<0)return;s+=d}if(s<m)m=s;return}for(let j=i;j<n;j++){let t=a[i];a[i]=a[j];a[j]=t;pm(a,i+1);t=a[i];a[i]=a[j];a[j]=t}};
pm(a,0);hc.set(k,m);return m};
let key=b=>{let k=0;for(let j=0;j<4;j++)k=k*256+(j<b.length?b[j]:255);return k};
let gt=(a,b)=>a[0]>b[0]||a[0]==b[0]&&a[1]>b[1];
let hp=[];
let pu=e=>{hp.push(e);let i=hp.length-1;while(i>0){let j=(i-1)>>1;if(!gt(hp[j],hp[i]))break;let t=hp[i];hp[i]=hp[j];hp[j]=t;i=j}};
let po=()=>{let t=hp[0],l=hp.pop();if(hp.length){hp[0]=l;let i=0;for(;;){let a=2*i+1,b=a+1,m=i;if(a<hp.length&&gt(hp[m],hp[a]))m=a;if(b<hp.length&&gt(hp[m],hp[b]))m=b;if(m==i)break;let t=hp[i];hp[i]=hp[m];hp[m]=t;i=m}}return t};
let st=b0.slice().sort((a,b)=>a-b),p0=fl(en,st,wk)[0];
if(hh(st)>=1/0)return null;
let best=new Map(),par=new Map(),k0=key(st)*256+p0,exp=0;
best.set(k0,0);pu([hh(st),k0,st,p0,0]);
let rc=k=>{let ps=[];while(par.has(k)){let q=par.get(k);ps.unshift([q[1],q[2]]);k=q[0]}let mv='',pc=en,b2=st.slice();for(let z=0;z<ps.length;z++){let B=ps[z][0],d=ps[z][1],w=wp(pc,2*B-nb(B,d),b2,wk);if(w===null)return null;mv+=w+L[d];b2=b2.map(x=>x==B?nb(B,d):x).sort((a,c)=>a-c);pc=B}if(dr>=0){let w=wp(pc,dr,b2,wk);if(w===null)return null;mv+=w;for(let d=0;d<4;d++)if(nb(dr,d)==en)mv+=L[d]}return[mv,ps.length]};
while(hp.length){let e=po(),f=e[0],k=e[1],b=e[2],p=e[3],g=e[4];if(best.get(k)<g)continue;if(++exp>CAP)return null;let fr=fl(p,b,wk);if(hh(b)==0){if(dr<0)return rc(k);if(fr[1][dr])return rc(k)}let rg=fr[1];for(let i=0;i<n;i++){let B=b[i];for(let d=0;d<4;d++){let T=nb(B,d),S=2*B-T;if(!bk[T]||!lv[T]||b.includes(T)||!rg[S])continue;let nb2=b.slice();nb2[i]=T;nb2.sort((a,c)=>a-c);let np=fl(B,nb2,wk)[0],h2=hh(nb2);if(h2>=1/0)continue;let g2=g+1,k2=key(nb2)*256+np;if(best.has(k2)&&best.get(k2)<=g2)continue;best.set(k2,g2);par.set(k2,[k,B,d]);pu([g2+h2,k2,nb2,np,g2])}}}
return null};
let seen=new Uint8Array(N),rooms=[];
for(let i=0;i<N;i++){if(wl[i]||(i/W|0)==hr||seen[i])continue;let q=[i],cp=[];seen[i]=1;for(let h=0;h<q.length;h++){let c=q[h];cp.push(c);for(let d=0;d<4;d++){let m=nb(c,d);if(m<0||m>=N||seen[m]||wl[m]||(m/W|0)==hr)continue;seen[m]=1;q.push(m)}}let drs=cp.filter(c=>{let y=(c/W|0);return(y==hr-1||y==hr+1)&&!wl[hr*W+c%W]});rooms.push({c:cp,d:drs,b:cp.filter(c=>bx.includes(c)),g:cp.filter(c=>gl[c])})}
let tg=rooms.reduce((a,r)=>a+r.g.length,0),tb=rooms.reduce((a,r)=>a+r.b.length,0);
let ok=rooms.length>0&&tg==ng&&tb==bx.length&&rooms.every(r=>r.d.length==1&&r.b.length==r.g.length&&r.b.length>0);
if(ok){let hwk=new Uint8Array(N);for(let x=0;x<W;x++)if(!wl[hr*W+x])hwk[hr*W+x]=1;let rs=[];for(let r of rooms){let dr=r.d[0],en2=nb(dr,dr<hr*W?1:0),wk=new Uint8Array(N),bk=new Uint8Array(N);r.c.forEach(c=>{wk[c]=1;bk[c]=1});wk[en2]=1;let a=SR(wk,bk,r.b,r.g,en2,-1),b=SR(wk,bk,r.b,r.g,en2,dr);if(!a)return'';rs.push({en:en2,a:a,b:b})}if(rs.filter(r=>!r.b).length>1)return'';rs.sort((x,y)=>((x.b?x.b[1]-x.a[1]:1e9)-(y.b?y.b[1]-y.a[1]:1e9)));let mv='',cur=pl;for(let i=0;i<rs.length;i++){let r=rs[i],w=wp(cur,r.en,[],hwk);if(w===null)return'';mv+=w;mv+=i<rs.length-1?r.b[0]:r.a[0];cur=r.en}return mv}
let wk=new Uint8Array(N),bk=new Uint8Array(N),gs=[];for(let i=0;i<N;i++)if(!wl[i]){wk[i]=1;bk[i]=1}for(let i=0;i<N;i++)if(gl[i])gs.push(i);let r=SR(wk,bk,bx,gs,pl,-1);return r?r[0]:'';
}
for(const id of readdirSync(I).sort()){let mv='';try{mv=solve(readFileSync(join(I,id,'level.txt'),'utf8'))||''}catch(e){mv=''}mkdirSync(join(O,id),{recursive:true});writeFileSync(join(O,id,'solution.txt'),mv+'\n')}
