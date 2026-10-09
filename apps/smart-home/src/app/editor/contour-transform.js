import { signedArea, perimeter } from './geometry.js';

/** Contour dimensions use the first edge's local axes, with its first vertex fixed. */
export function contourFrame(points) {
  if (!Array.isArray(points) || points.length < 3) throw new Error('Нужен замкнутый контур.');
  const anchor = points[0], dx = points[1].x - anchor.x, dy = points[1].y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-7) throw new Error('Первая сторона имеет нулевую длину.');
  const u = { x: dx / length, y: dy / length }, v = { x: -u.y, y: u.x };
  const local = points.map(p => ({ x: (p.x-anchor.x)*u.x+(p.y-anchor.y)*u.y,
    y: (p.x-anchor.x)*v.x+(p.y-anchor.y)*v.y }));
  const xs = local.map(p=>p.x), ys = local.map(p=>p.y);
  return { anchor, u, v, local, width: Math.max(...xs)-Math.min(...xs),
    height: Math.max(...ys)-Math.min(...ys), angle: Math.atan2(u.y,u.x)*180/Math.PI,
    area: Math.abs(signedArea(points))/1e6, perimeter: perimeter(points)/1000 };
}

export function resizeContour(points, changes) {
  const frame = contourFrame(points);
  const width = changes.width ?? frame.width, height = changes.height ?? frame.height, angle = changes.angle ?? frame.angle;
  if (![width,height,angle].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Размеры должны быть положительными числами, угол — конечным числом.');
  }
  if (frame.width < 1e-7 || frame.height < 1e-7) throw new Error('Контур не имеет площади.');
  const t = angle*Math.PI/180, c = Math.cos(t), s = Math.sin(t);
  return frame.local.map(p => { const x = p.x*width/frame.width, y=p.y*height/frame.height;
    return { x:frame.anchor.x+x*c-y*s, y:frame.anchor.y+x*s+y*c }; });
}

export function moveContour(points, from, to) {
  const dx=to.x-from.x, dy=to.y-from.y;
  return points.map(p=>({x:p.x+dx,y:p.y+dy}));
}

export function rotateContour(points, pivot, degrees) {
  if (!Number.isFinite(degrees)) throw new Error('Введите угол числом.');
  const t=degrees*Math.PI/180, c=Math.cos(t), s=Math.sin(t);
  return points.map(p=>{const x=p.x-pivot.x,y=p.y-pivot.y;
    return {x:pivot.x+x*c-y*s,y:pivot.y+x*s+y*c};});
}
