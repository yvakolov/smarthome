import { finite } from './geometry.js';

/** Apply one handle edit to a copy. Draft geometry is never written to the source. */
export function editContour(points, kind, index, base, target) {
  if (!Array.isArray(points) || points.length < 3 || !Number.isInteger(index) || index < 0 || index >= points.length) {
    throw new Error('Некорректная вершина или сторона контура.');
  }
  if (![base?.x, base?.y, target?.x, target?.y].every(finite)) throw new Error('Укажите конечные координаты.');
  const result = points.map(p => ({ x: p.x, y: p.y }));
  if (kind === 'vertex') result[index] = { ...target };
  else if (kind === 'insert') result.splice(index + 1, 0, { ...target });
  else if (kind === 'edge') {
    const delta = { x: target.x - base.x, y: target.y - base.y };
    for (const i of [index, (index + 1) % points.length]) result[i] = { x: points[i].x + delta.x, y: points[i].y + delta.y };
  } else throw new Error('Неизвестный способ редактирования контура.');
  return result;
}
export const isHandleEdit = kind => ['vertex', 'edge', 'insert'].includes(kind);
