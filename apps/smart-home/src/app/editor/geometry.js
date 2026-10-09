// Pure millimetre-space geometry. Positive Y points up.
export const EPS=1e-7, GEOM_TOL=1e-6;
export const finite=Number.isFinite;
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const equal=(a,b)=>dist(a,b)<EPS;
export const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
export const dot=(a,b)=>a.x*b.x+a.y*b.y;
export const det=(a,b)=>a.x*b.y-a.y*b.x;
export const along=(a,u,t)=>({x:a.x+u.x*t,y:a.y+u.y*t});
export const signedArea=ps=>{if(ps.length<3)return 0;const a=ps[0];let area=0;for(let i=1;i<ps.length-1;i++)area+=cross(a,ps[i],ps[i+1])/2;return area;};
export const perimeter=ps=>ps.length<2?0:ps.reduce((sum,p,i)=>sum+dist(p,ps[(i+1)%ps.length]),0);
export function onSegment(a,b,p) {
    const length=dist(a,b);if(length<GEOM_TOL)return dist(a,p)<GEOM_TOL;
    return Math.abs(cross(a,b,p))/length<=GEOM_TOL &&
      (p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)<=GEOM_TOL*length;
  }
export function intersects(a,b,c,d) {const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
    return (((p>EPS&&q<-EPS)||(p<-EPS&&q>EPS))&&((r>EPS&&s<-EPS)||(r<-EPS&&s>EPS)))||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function validate(ps) {
    if(ps.length<3)return 'Для замыкания нужны минимум три точки.';
    const a=Math.abs(signedArea(ps));if(!finite(a)||a<EPS)return 'Контур должен иметь ненулевую конечную площадь.';
    for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],c=ps[(i+2)%ps.length];
      if(equal(a,b))return 'Сторона должна иметь ненулевую длину.';
      if(Math.abs(cross(a,b,c))<EPS&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)<-EPS)return 'Стороны не должны накладываться.';
      for(let j=i+1;j<ps.length;j++){if(j===i+1||(i===0&&j===ps.length-1))continue;
        if(intersects(a,b,ps[j],ps[(j+1)%ps.length]))return 'Контур не должен пересекать сам себя.';}
    } return null;
  }
  // Boundaries may touch or share an edge. The interiors of contours may not overlap.
  // Split a segment at every boundary contact: this also catches passage through a
  // polygon vertex, where a "proper intersections only" check would miss a crossing.
export function pointLocation(p,polygon) {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[j],b=polygon[i];if(onSegment(a,b,p))return 0;
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }return inside?1:-1;
  }
export function segmentEnters(a,b,polygon) {
    const d=sub(b,a),len=dist(a,b);if(len<GEOM_TOL)return pointLocation(a,polygon)===1;
    const cuts=[0,1],len2=dot(d,d),u={x:d.x/len,y:d.y/len};
    for(let i=0;i<polygon.length;i++){
      const c=polygon[i],e=polygon[(i+1)%polygon.length],v=sub(e,c);
      const denominator=det(d,v),el=dist(c,e);
      if(Math.abs(denominator)>GEOM_TOL*Math.max(1,len,el)){
        const t=det(sub(c,a),v)/denominator,k=det(sub(c,a),d)/denominator;
        if(t>=-EPS&&t<=1+EPS&&k>=-EPS&&k<=1+EPS)cuts.push(Math.max(0,Math.min(1,t)));
      }else if(onSegment(a,b,c)||onSegment(a,b,e)){
        for(const q of [c,e]){const t=dot(sub(q,a),d)/len2;if(t>0&&t<1)cuts.push(t);}
      }
    }
    cuts.sort((a,b)=>a-b);
    if(pointLocation(a,polygon)===1||pointLocation(b,polygon)===1)return true;
    for(let i=1;i<cuts.length;i++)if((cuts[i]-cuts[i-1])*len>GEOM_TOL&&
      pointLocation(along(a,u,(cuts[i]+cuts[i-1])*len/2),polygon)===1)return true;
    return false;
  }
export function interiorPoint(ps) {
    // A scanline between vertex rows gives a point strictly inside a simple polygon.
    const ys=[...new Set(ps.map(p=>p.y))].sort((a,b)=>a-b);
    for(let row=1;row<ys.length;row++){
      const y=(ys[row-1]+ys[row])/2,xs=[];
      for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];
        if((a.y>y)!==(b.y>y))xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));}
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>GEOM_TOL)return {x:(xs[i]+xs[i+1])/2,y};
    }return null;
  }
export function overlap(a,b) {
    for(const [ps,other] of [[a,b],[b,a]]){
      for(let i=0;i<ps.length;i++)if(segmentEnters(ps[i],ps[(i+1)%ps.length],other))return true;
      const p=interiorPoint(ps);if(p&&pointLocation(p,other)===1)return true;
    }return false;
  }
