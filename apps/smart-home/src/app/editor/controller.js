
import Konva from 'konva';
import {EPS,GEOM_TOL,finite,dist,equal,cross,sub,dot,det,along,signedArea,perimeter,validate,overlap,onSegment,intersects,pointLocation,interiorPoint,segmentEnters} from './geometry.js';
/**
 * Isolated imperative interaction controller for the editor route.
 * Angular owns the application and controls; Konva owns only its stage subtree.
 * @param {HTMLElement} root
 * @param {import('../core/models').Project} project
 * @param {{save:(project: import('../core/models').Project)=>boolean}} callbacks
 * @returns {import('../core/models').EditorHandle}
 */
export function mountEditor(root,project,callbacks) {
  // Geometry remains in world units; input, drafts and commits are separate states.
  const $ = id => {const element=root.querySelector('#'+id);if(!element)throw new Error('Missing editor control: '+id);return element;};
  const canvas=$('canvas');
  const stage=new Konva.Stage({container:canvas,width:1,height:1});
  const layer=new Konva.Layer({listening:false});stage.add(layer);
  let ctx=null,disposed=false;
  const shape=new Konva.Shape({listening:false,perfectDrawEnabled:false,sceneFunc(context){ctx=context;paintScene();}});
  layer.add(shape);
  const abort=new AbortController(),timers=new Set();
  function listen(target,type,handler,options={}){target.addEventListener(type,handler,{...(typeof options==='boolean'?{capture:options}:options),signal:abort.signal});}
  function schedule(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);if(!disposed)fn();},ms);timers.add(timer);return timer;}
  function draw(){if(!disposed)layer.batchDraw();}
  const BASE_SCALE=.05;
  const INFER_PX = 9, DWELL_MS = 320; // Screen-space tolerance, independent of zoom.
  const I = {points:[],edge:null,pending:null,timer:null,hit:null,solution:null};
  let T=null, menuReturnFocus=null, renameIndex=-1, lastFinish=0, dismissContext=false;

  const S = {page:'home', id:null, name:'', points:[], contours:[], closed:false, active:false,
    tool:'graphical', rect:null, dir:null, raw:null, hover:null, pointer:false,
    grid:true, snap:true, ortho:false, step:100, angleStep:1, mode:'mouse', closeSnap:false,
    scale:BASE_SCALE, ox:0, oy:0, w:0, h:0, history:[], future:[],
    space:false, pan:null, middle:null, highlighted:-1, lineDraft:false, draftDir:null, dirty:false, projects:[]};
  const dirs = {ArrowRight:{x:1,y:0,label:'→ Вправо'},ArrowLeft:{x:-1,y:0,label:'← Влево'},
    ArrowUp:{x:0,y:1,label:'↑ Вверх'},ArrowDown:{x:0,y:-1,label:'↓ Вниз'}};
  const clone = value => JSON.parse(JSON.stringify(value));
  const fmt = (n,d=0) => Number(n).toLocaleString('ru-RU',{maximumFractionDigits:d});
  const parse = value => { const s=String(value).trim().replace(/\s/g,'').replace(',','.');
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN; };
  const positive = n => finite(n) && n > 0;
  const screen = p => ({x:S.ox+p.x*S.scale,y:S.oy-p.y*S.scale});
  const world = p => ({x:(p.x-S.ox)/S.scale,y:(S.oy-p.y)/S.scale});
  const mouse = e => {const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  function coords(p) { if(!p)return; $('coordX').textContent=fmt(p.x,2);$('coordY').textContent=fmt(p.y,2); }
  function message(text,error=false) { $('commandHint').textContent=text;$('commandHint').title=text;
    $('commandHint').classList.toggle('error',error); }
  function announceState() {
    if(T){message(temporaryHint());return;}
    if(!S.points.length&&S.contours.length){const last=S.contours.at(-1).points;
      message(`${S.contours.at(-1).name||'Контур '+S.contours.length}: ${fmt(Math.abs(signedArea(last))/1e6,2)} м² · ${fmt(perimeter(last)/1000,2)} м · ${last.length} сторон${S.active?' · Укажите начало.':''}`);
    }else if(!S.active)message(S.points.length?'Построение приостановлено. Нажмите «Контур», чтобы продолжить.':'Выберите инструмент «Контур».');
    else if(!S.points.length)message('Первая точка: мышь / X, Y · временные точки: колесо или P');
    else if(S.rect)message(S.rect.stage==='rotation' ? (S.rect.angleDraft!==null?'Угол → Enter / щелчок — завершить · Esc — к повороту мышью':'Поворот вокруг начала · мышь или угол → Enter / щелчок — завершить') : `${S.rect.stage==='width'?'Длина':'Ширина'} · Enter / щелчок — фиксировать · Tab — сторона · затем поворот`);
    else if(S.dir||S.lineDraft)message('Длина в мм → Enter · Esc — снять ввод');
    else message('Стрелка → длина → Enter · правая кнопка — замкнуть · колесо / P — точки');
  }
  function syncToggle(id,on) {$(id).classList.toggle('on',on);$(id).setAttribute('aria-pressed',String(on));}
  function sync() {
    const editor=true;
    $('stageHint').hidden=S.active||S.points.length>0||S.contours.length>0;
    $('originForm').hidden=!(S.active&&!S.points.length&&!T);
    $('lineForm').hidden=!(S.active&&S.tool==='graphical'&&S.points.length&&(S.dir||S.lineDraft)&&!T);
    $('rectForm').hidden=!(S.active&&S.rect);$('editor').classList.toggle('rectangle-entry',!!(S.active&&S.rect));
    $('directionLabel').textContent=S.dir?S.dir.label:'↗ Мышью';
    $('undo').disabled=!S.history.length;$('redo').disabled=!S.future.length;
    $('contourTool').classList.toggle('on',S.active);$('contourTool').setAttribute('aria-pressed',String(S.active));
    syncToggle('gridToggle',S.grid);syncToggle('snapToggle',S.snap);syncToggle('orthoToggle',S.ortho);
    $('gridStep').disabled=!S.grid;
    $('gridStep').title=S.grid?'Шаг сетки, мм':'Включите сетку, чтобы изменить шаг';
    if(document.activeElement!==$('gridStep'))$('gridStep').value=String(S.step);
    $('angleStepSetting').hidden=!(S.active&&S.tool==='rectangle');
    if(document.activeElement!==$('angleStep'))$('angleStep').value=fieldNumber(S.angleStep);
    if(S.rect)syncRectangleFields();
    $('save').title=`Сохранить «${S.name}» в браузере (Ctrl/⌘ S)`;
    document.title=`${S.name} — Smart Home`;
    announceState();
  }
  function clearEntry() {S.dir=null;S.lineDraft=false;S.draftDir=null;S.closeSnap=false;$('lineLength').value='';}
  function snapshot() {return clone({points:S.points,contours:S.contours,closed:S.closed,active:S.active,tool:S.tool,rect:S.rect});}
  function record() {S.history.push(snapshot());S.future=[];S.dirty=true;}
  function restore(v) {T=null;hidePointMenu();Object.assign(S,clone(v));clearEntry();resetInference();S.hover=S.points.length?{...S.points.at(-1)}:null;
    if(S.rect){S.rect=normalizeRectangle(S.rect);updateRectangleHover();}
    sync();draw();canvas.focus({preventScroll:true});}
  function undo() {if(!S.history.length)return;S.future.push(snapshot());restore(S.history.pop());S.dirty=true;}
  function redo() {if(!S.future.length)return;S.history.push(snapshot());restore(S.future.pop());S.dirty=true;}
  function externalError(ps,closed=false) {
    for(const c of S.contours){
      if(closed?overlap(ps,c.points):ps.length===1?pointLocation(ps[0],c.points)===1:segmentEnters(ps.at(-2),ps.at(-1),c.points))
        return 'Контуры не должны пересекаться или перекрывать площадь. Примыкание по границе допустимо.';
    }return null;
  }
  function append(p,referenceEdge=null) {
    if(!p||!finite(p.x)||!finite(p.y)){message('Введите конечные числовые координаты.',true);return false;}
    p={x:p.x,y:p.y};const n=S.points.length;
    if(n>=3&&equal(p,S.points[0]))return closeContour();
    if(n&&equal(p,S.points[n-1])){message('Новая точка совпадает с предыдущей.',true);return false;}
    if(n>=2){const a=S.points[n-2],b=S.points[n-1];
      if(Math.abs(cross(a,b,p))<EPS&&(b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)<-EPS){message('Новая сторона накладывается на предыдущую.',true);return false;}
      for(let i=0;i<n-2;i++)if(intersects(b,p,S.points[i],S.points[i+1])){message('Новая сторона пересекает контур.',true);return false;}}
    const outside=externalError(n?[S.points[n-1],p]:[p]);if(outside){message(outside,true);return false;}
    record();S.points.push(p);S.hover={...p};S.active=true;clearEntry();resetInference();
    if(S.tool==='rectangle'&&n===0){S.rect=createRectangle(referenceEdge);S.raw={...p};updateRectangleHover();}
    sync();coords(p);draw();
    canvas.focus({preventScroll:true});
    return true;
  }
  function finishContour(ps) {
    const error=validate(ps)||externalError(ps,true);if(error){message(error,true);return false;}
    record();S.contours.push({id:`contour-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:'',points:clone(ps)});
    S.points=[];S.closed=false;S.rect=null;S.active=false;S.highlighted=-1;T=null;
    clearEntry();resetInference();hidePointMenu();S.hover={...ps[0]};lastFinish=performance.now();
    sync();coords(S.hover);draw();canvas.focus({preventScroll:true});return true;
  }
  function closeContour() {
    if(!S.active||S.tool==='rectangle')return false;
    return finishContour(S.points);
  }
  function openMethods() {cancelTemporary(false);hidePointMenu();clearPending();$('methodDialog').showModal();}
  function activate(tool) {
    // Changing a tool can discard only the unfinished draft, never completed contours.
    if(S.points.length&&S.tool!==tool){
      if(!confirm('Отменить незавершённое построение? Готовые контуры сохранятся.'))return;
      record();S.points=[];S.closed=false;S.rect=null;
    }
    S.tool=tool;S.active=true;S.highlighted=-1;clearEntry();resetInference();$('methodDialog').close();sync();draw();canvas.focus({preventScroll:true});
    if(S.rect)updateRectangleHover();
  }
  function origin() {
    const x=parse($('originX').value),y=parse($('originY').value);
    if(!finite(x)||!finite(y)){message('Введите координаты X и Y числами.',true);return;}
    if(!S.active||S.points.length)return;
    if(append({x,y})){const p=screen({x,y});if(p.x<24||p.x>S.w-24||p.y<24||p.y>S.h-24){S.ox=S.w*.24-x*S.scale;S.oy=S.h*.75+y*S.scale;draw();}}
  }
  function setDirection(key) {
    if(!S.active||!S.points.length||S.closed||S.tool!=='graphical')return;
    S.dir={...dirs[key]};S.lineDraft=true;sync();
    preview(S.raw||S.points.at(-1));draw();$('lineLength').focus({preventScroll:true});$('lineLength').select();
  }
  function unitDirection() {
    if(S.dir)return S.dir;
    if(S.draftDir)return S.draftDir;
    const a=S.points.at(-1),p=S.hover;
    if(a&&p&&dist(a,p)>EPS){const d=dist(a,p);return {x:(p.x-a.x)/d,y:(p.y-a.y)/d};}return null;
  }
  function buildLength() {
    if(!S.active||!S.points.length||S.tool!=='graphical'||S.rect)return;
    const n=parse($('lineLength').value),d=unitDirection();
    if(!positive(n)){message('Длина должна быть положительным числом.',true);return;}
    if(!d){message('Выберите направление стрелкой или мышью.',true);return;}
    const a=S.points.at(-1);append({x:a.x+d.x*n,y:a.y+d.y*n});
  }
  // Pending rectangles use a local coordinate frame; only explicit confirmations
  // write a completed contour. Pointer motion and typed drafts never do.
  const RECT_FIELDS={width:{key:'w',sign:'sx',id:'rectW',label:'rectWLabel'},height:{key:'h',sign:'sy',id:'rectH',label:'rectHLabel'}};
  const otherSide=side=>side==='width'?'height':'width';
  const normalizeAngle=angle=>((angle+180)%360+360)%360-180;
  const fieldNumber=n=>String(Number(n.toFixed(6)));
  function createRectangle(edge=null) {
    const u=edge?edgeDirection(edge):null;let angle=u?Math.atan2(u.y,u.x)*180/Math.PI:0;
    // A line is undirected. Prefer +X (or +Y for a vertical source edge).
    if(angle>90)angle-=180;if(angle<=-90)angle+=180;
    return {w:0,h:0,sx:1,sy:1,angle,stage:'width',locked:{width:false,height:false},
      drafts:{width:null,height:null},draftBase:{width:null,height:null},angleDraft:null,angleBefore:null,rotationRef:null,rotationRawAngle:null,sourceEdge:edge?clone(edge):null};
  }
  function normalizeRectangle(raw) {
    if(!raw||!finite(raw.w)||!finite(raw.h)||raw.w<0||raw.h<0)return null;
    const r=createRectangle();Object.assign(r,{w:raw.w,h:raw.h,stage:['height','rotation'].includes(raw.stage)?raw.stage:'width',
      angle:finite(raw.angle)?normalizeAngle(raw.angle):0,sx:raw.sx===-1?-1:1,sy:raw.sy===-1?-1:1});
    r.locked=raw.locked?{width:raw.locked.width===true,height:raw.locked.height===true}:{width:r.stage==='height',height:false};
    for(const side of ['width','height']){
      r.drafts[side]=typeof raw.drafts?.[side]==='string'?raw.drafts[side]:null;
      const base=raw.draftBase?.[side];if(base&&finite(base.value)&&base.value>=0)r.draftBase[side]={value:base.value,sign:base.sign===-1?-1:1,locked:base.locked===true};
    }
    const e=raw.sourceEdge;if(e?.a&&e?.b&&[e.a.x,e.a.y,e.b.x,e.b.y].every(finite)&&dist(e.a,e.b)>EPS)r.sourceEdge=clone(e);
    r.angleDraft=typeof raw.angleDraft==='string'?raw.angleDraft:null;
    r.angleBefore=raw.angleBefore&&finite(raw.angleBefore.angle)?clone(raw.angleBefore):null;
    if(r.stage==='rotation'){
      if(positive(r.w)&&positive(r.h))r.locked={width:true,height:true};else r.stage='width';
    }
    // Pointer references are transient: restoring a draft must not cause a jump.
    r.rotationRef=null;r.rotationRawAngle=null;return r;
  }
  function rectangleBasis(r=S.rect) {const t=r.angle*Math.PI/180,u={x:Math.cos(t),y:Math.sin(t)};return {u,v:{x:-u.y,y:u.x}};}
  function rectangleVertices(a,r) {const {u,v}=rectangleBasis(r),b=along(a,u,r.w*r.sx),d=along(a,v,r.h*r.sy);return [{...a},b,along(b,v,r.h*r.sy),d];}
  function updateRectangleHover() {if(!S.rect||!S.points.length)return;S.hover=rectangleVertices(S.points[0],S.rect)[2];coords(S.hover);}
  function syncRectangleFields() {
    const r=S.rect;if(!r)return;
    for(const side of ['width','height']){
      const f=RECT_FIELDS[side],input=$(f.id),label=$(f.label),active=r.stage===side;
      label.classList.toggle('current',active);label.classList.toggle('locked',r.locked[side]);
      input.readOnly=false;input.setAttribute('aria-current',String(active));
      label.title=`${side==='width'?'Длина':'Ширина'}${r.locked[side]?' зафиксирована. Выберите поле для точного изменения.':active?' — активная сторона. Enter или щелчок фиксирует размер.':' — Tab переключает на эту сторону.'}`;
      const value=r.drafts[side]??(r[f.key]===0?'':fieldNumber(r[f.key]));if(input.value!==value)input.value=value;
    }
    const angleValue=r.angleDraft??fieldNumber(r.angle);if($('rectAngle').value!==angleValue)$('rectAngle').value=angleValue;
    const rotating=r.stage==='rotation',special=specialRectangleAngle(r.angle);
    $('rectAngleLabel').classList.toggle('edge-aligned',!!r.sourceEdge&&!rotating);
    $('rectAngleLabel').classList.toggle('current',rotating||document.activeElement===$('rectAngle'));
    $('rectAngleLabel').classList.toggle('special-angle',rotating&&special!==null);
    $('rectAngleLabel').dataset.specialAngle=rotating&&special!==null?String(special):'';
    $('rectAngle').setAttribute('aria-current',String(rotating));
    $('rectForm').dataset.phase=r.stage;
    $('rectAngleLabel').title=rotating?'Поворот вокруг начальной точки. Enter или щелчок завершает контур.':r.sourceEdge?'Направление выбранного ребра. Можно изменить вручную.':'Угол длины к оси X, против часовой стрелки. A — ввод угла.';
    const confirm=$('rectForm').querySelector('button');
    confirm.title=rotating?'Зафиксировать поворот и завершить контур (Enter)':'Зафиксировать активную сторону (Enter)';
    confirm.setAttribute('aria-label',rotating?'Завершить прямоугольник':'Зафиксировать активную сторону');
  }
  function previewRectangle(raw) {
    const r=S.rect;if(!r||!S.active)return;
    if(r.stage==='rotation'){previewRectangleRotation(raw);return;}
    const {u,v}=rectangleBasis(r),delta=sub(raw,S.points[0]);
    for(const [side,axis] of [['width',u],['height',v]]){
      if(r.locked[side]||r.drafts[side]!==null)continue;
      const f=RECT_FIELDS[side];let value=dot(delta,axis);if(S.snap)value=Math.round(value/S.step)*S.step;
      if(!finite(value))continue;r[f.key]=Math.abs(value);if(Math.abs(value)>EPS)r[f.sign]=value<0?-1:1;
    }
    updateRectangleHover();syncRectangleFields();
  }
  function selectRectangleSide(side,focusCanvas=false) {
    if(!S.active||!S.rect||!RECT_FIELDS[side])return;S.rect.stage=side;S.rect.rotationRef=null;syncRectangleFields();announceState();draw();if(focusCanvas)canvas.focus({preventScroll:true});
  }
  function editRectangleSide(side) {
    const r=S.rect;if(!r||!S.active)return;const f=RECT_FIELDS[side],input=$(f.id);r.stage=side;
    if(r.drafts[side]===null)r.draftBase[side]={value:r[f.key],sign:r[f.sign],locked:r.locked[side]};
    r.drafts[side]=input.value;r.locked[side]=false;const n=parse(input.value);if(finite(n)&&n>=0)r[f.key]=n;
    input.removeAttribute('aria-invalid');updateRectangleHover();syncRectangleFields();announceState();draw();
  }
  function editRectangleAngle() {
    const r=S.rect;if(!r||!S.active)return;
    if(r.angleDraft===null)r.angleBefore={angle:r.angle,sourceEdge:clone(r.sourceEdge)};
    r.angleDraft=$('rectAngle').value;const n=parse(r.angleDraft);if(finite(n)){r.angle=normalizeAngle(n);r.sourceEdge=null;}
    r.rotationRef=null;r.rotationRawAngle=null;
    $('rectAngle').removeAttribute('aria-invalid');updateRectangleHover();syncRectangleFields();announceState();draw();
  }
  function validRectangleAngle() {
    const r=S.rect;if(r.angleDraft!==null&&!finite(parse(r.angleDraft))){$('rectAngle').setAttribute('aria-invalid','true');message('Введите угол числом в градусах.',true);return false;}return true;
  }
  function confirmRectangleAngle() {
    if(!S.rect||!validRectangleAngle())return;
    if(S.rect.stage==='rotation'){commitRectangle();return;}
    S.rect.angleDraft=null;S.rect.angleBefore=null;syncRectangleFields();announceState();draw();canvas.focus({preventScroll:true});
  }
  function commitRectangle() {
    const r=S.rect;if(!r||!S.active||!validRectangleAngle())return;
    if(r.stage==='rotation'){finishContour(rectPoints());return;}
    const side=r.stage,other=otherSide(side),f=RECT_FIELDS[side],n=r.drafts[side]===null?r[f.key]:parse(r.drafts[side]);
    if(!positive(n)){message('Размер должен быть положительным числом. Укажите его мышью или с клавиатуры.',true);$(f.id).setAttribute('aria-invalid','true');return;}
    $(f.id).removeAttribute('aria-invalid');r[f.key]=n;const ps=rectPoints();
    if(ps.some(p=>!finite(p.x)||!finite(p.y))){message('Размер не представим числом в браузере.',true);return;}
    // Three explicit confirmations: first dimension, second dimension, then angle.
    // Do not validate overlap until rotation is confirmed: rotation may resolve it.
    record();r.locked[side]=true;r.drafts[side]=null;r.draftBase[side]=null;
    if(r.locked[other]){beginRectangleRotation();return;}
    r.stage=other;sync();draw();canvas.focus({preventScroll:true});
  }
  function cancelRectangleEdit() {
    const r=S.rect;if(!r)return false;
    if((document.activeElement===$('rectAngle')||r.stage==='rotation')&&r.angleDraft!==null){
      if(r.angleBefore){r.angle=r.angleBefore.angle;r.sourceEdge=r.angleBefore.sourceEdge;}
      r.angleDraft=null;r.angleBefore=null;r.rotationRef=null;r.rotationRawAngle=null;$('rectAngle').removeAttribute('aria-invalid');
    }else if(RECT_FIELDS[r.stage]&&r.drafts[r.stage]!==null){
      const side=r.stage,f=RECT_FIELDS[side],base=r.draftBase[side];if(base){r[f.key]=base.value;r[f.sign]=base.sign;r.locked[side]=base.locked;}
      r.drafts[side]=null;r.draftBase[side]=null;$(f.id).removeAttribute('aria-invalid');
    }else return false;
    updateRectangleHover();syncRectangleFields();announceState();draw();canvas.focus({preventScroll:true});return true;
  }
  const SPECIAL_RECT_ANGLES=[-135,-90,-45,45,90,135];
  function specialRectangleAngle(angle) {
    const normalized=normalizeAngle(angle);
    return SPECIAL_RECT_ANGLES.find(a=>Math.abs(normalized-a)<1e-6)??null;
  }
  function snapRectangleAngle(angle) {
    const normalized=normalizeAngle(angle),tolerance=Math.min(.75,S.angleStep/2);
    const special=SPECIAL_RECT_ANGLES.find(a=>Math.abs(normalized-a)<=tolerance+EPS);
    if(special!==undefined)return special;
    const value=Math.round(normalized/S.angleStep)*S.angleStep;
    return normalizeAngle(finite(value)?value:normalized);
  }
  function rotationHeading(raw) {
    if(!raw||!S.points.length)return null;
    const d=sub(raw,S.points[0]);
    // A dead zone around the pivot prevents unstable angles near the origin.
    return Math.hypot(d.x,d.y)*S.scale<10?null:Math.atan2(d.y,d.x)*180/Math.PI;
  }
  function armRectangleRotation(raw) {
    const r=S.rect,heading=rotationHeading(raw);
    if(r&&heading!==null)r.rotationRef={heading,angle:r.angle};
  }
  function beginRectangleRotation() {
    const r=S.rect;r.stage='rotation';r.rotationRef=null;r.rotationRawAngle=null;
    if(S.pointer)armRectangleRotation(S.raw);
    updateRectangleHover();sync();draw();
    $('rectAngle').focus({preventScroll:true});$('rectAngle').select();
  }
  function previewRectangleRotation(raw) {
    const r=S.rect;if(!r||r.stage!=='rotation')return;
    // Exact typed angles win over pointer motion and the angular snap step.
    if(r.angleDraft!==null){updateRectangleHover();return;}
    const heading=rotationHeading(raw);if(heading===null)return;
    // Re-entering the canvas (or returning after panning) only re-arms the ray;
    // the very first move never jumps the rectangle to an unrelated heading.
    if(!r.rotationRef){armRectangleRotation(raw);return;}
    const change=normalizeAngle(heading-r.rotationRef.heading);
    if(Math.abs(change)<1e-8&&r.rotationRawAngle===null)return;
    const next=normalizeAngle(r.rotationRef.angle+change);
    r.rotationRawAngle=next;const angle=snapRectangleAngle(next);
    if(Math.abs(normalizeAngle(angle-r.angle))>EPS)r.sourceEdge=null;
    r.angle=angle;updateRectangleHover();syncRectangleFields();
    // Keep the automatically focused angle field ready for replacement by typing.
    if(document.activeElement===$('rectAngle'))$('rectAngle').select();
  }
  function commitAngleStep() {
    const n=parse($('angleStep').value);
    if(!positive(n)||n>360||!finite(360/n)){
      $('angleStep').value=fieldNumber(S.angleStep);
      message('Шаг поворота — число больше 0 и не больше 360°.',true);return false;
    }
    S.angleStep=n;$('angleStep').value=fieldNumber(n);
    const r=S.rect;
    if(r?.stage==='rotation'&&r.angleDraft===null&&r.rotationRawAngle!==null){
      const angle=snapRectangleAngle(r.rotationRawAngle);
      if(Math.abs(normalizeAngle(angle-r.angle))>EPS)r.sourceEdge=null;
      r.angle=angle;r.rotationRef=null;updateRectangleHover();syncRectangleFields();
    }
    announceState();draw();return true;
  }

  // Inference never writes model geometry. Only append/finishContour commit points.
  function clearPending() {if(I.timer!==null)clearTimeout(I.timer);I.timer=null;I.pending=null;}
  function resetInference() {clearPending();I.points=[];I.edge=null;I.hit=null;I.solution=null;}
  const pointKey=p=>`${p.x},${p.y}`;
  function edgeDirection(e) {const d=dist(e.a,e.b);return d>EPS?{x:(e.b.x-e.a.x)/d,y:(e.b.y-e.a.y)/d}:null;}
  function entities() {
    const points=new Map(),edges=[];
    const add=(ps,closed)=>{ps.forEach(p=>points.set(pointKey(p),p));
      for(let i=1;i<ps.length+(closed?1:0);i++){const a=ps[(i-1)%ps.length],b=ps[i%ps.length];
        if(!equal(a,b))edges.push({a,b,key:`e:${pointKey(a)}:${pointKey(b)}`});}};
    S.contours.forEach(c=>add(c.points,true));add(S.points,false);
    return {points:[...points.values()],edges};
  }
  function nearby(raw) {
    const data=entities(),hits=[],tol=INFER_PX/S.scale;
    for(const p of data.points)if(dist(raw,p)<=tol)hits.push({kind:'vertex',p,key:`p:${pointKey(p)}`,rank:0});
    for(const e of data.edges){
      const mid={x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2};
      if(dist(raw,mid)<=tol)hits.push({kind:'midpoint',p:mid,edge:e,key:`m:${e.key}`,rank:1});
      const u=edgeDirection(e),t=dot(sub(raw,e.a),u);
      if(t>=0&&t<=dist(e.a,e.b)){const p=along(e.a,u,t);if(dist(raw,p)<=tol)hits.push({kind:'edge',p,edge:e,key:e.key,rank:3});}
    }
    return hits.sort((a,b)=>a.rank-b.rank||dist(raw,a.p)-dist(raw,b.p));
  }
  function trackReference(raw) {
    if(T||!$('pointMenu').hidden){clearPending();return;}
    if(!S.active||S.rect||S.pan||S.lineDraft){clearPending();return;}
    const hit=nearby(raw)[0];I.hit=hit||null;
    if(!hit){clearPending();return;}
    const acquired=hit.kind==='edge'?I.edge?.key===hit.key:I.points.some(p=>p.key===hit.key);
    if(acquired){clearPending();return;}
    if(I.pending?.key===hit.key)return;
    clearPending();I.pending=hit;
    I.timer=schedule(()=>{
      const current=I.pending;I.pending=null;I.timer=null;
      if(!current||!S.active||!S.pointer||S.page!=='editor'||$('methodDialog').open||$('helpDialog').open)return;
      acquireReference(current);
      if(S.raw)preview(S.raw);draw();
    },DWELL_MS);
  }
  function acquireReference(hit) {
    if(hit.kind==='edge')I.edge=clone(hit.edge);
    else {I.points=I.points.filter(p=>p.key!==hit.key);I.points.push({p:clone(hit.p),key:hit.key});I.points=I.points.slice(-2);}
  }
  function pinReference(raw) {
    const hit=nearby(raw)[0];if(!hit)return;
    clearPending();acquireReference(hit);preview(raw);draw();
    message(I.edge&&I.points.length?'Ребро и точка закреплены · выберите пересечение направляющих.':'Опора закреплена · Alt + щелчок по второй опоре.');
  }
  function referenceGuides(anchor) {
    const guides=[];
    if(I.edge){const u=edgeDirection(I.edge);
      if(anchor){guides.push({p:anchor,u,label:'Параллельно',kind:'parallel',source:I.edge});
        guides.push({p:anchor,u:{x:-u.y,y:u.x},label:'Перпендикулярно',kind:'perpendicular',source:I.edge});}
      guides.push({p:I.edge.a,u,label:'Продолжение ребра',kind:'extension',source:I.edge});}
    for(const ref of I.points){
      if(I.edge){const u=edgeDirection(I.edge);
        guides.push({p:ref.p,u,label:'Параллель через точку',kind:'point-parallel',source:ref.p});
        guides.push({p:ref.p,u:{x:-u.y,y:u.x},label:'Перпендикуляр через точку',kind:'point-perpendicular',source:ref.p});}
      guides.push({p:ref.p,u:{x:1,y:0},label:'По горизонтали от точки',kind:'horizontal',source:ref.p});
      guides.push({p:ref.p,u:{x:0,y:1},label:'По вертикали от точки',kind:'vertical',source:ref.p});}
    if(anchor&&!S.ortho&&!S.dir){guides.push({p:anchor,u:{x:1,y:0},label:'По горизонтали',kind:'axis',source:anchor});
      guides.push({p:anchor,u:{x:0,y:1},label:'По вертикали',kind:'axis',source:anchor});}
    return guides;
  }
  function intersection(a,b) {
    const d=det(a.u,b.u);if(Math.abs(d)<1e-10)return null;
    return along(a.p,a.u,det(sub(b.p,a.p),b.u)/d);
  }
  function infer(raw,base,anchor,constraint) {
    I.solution=null;const tol=INFER_PX/S.scale,probe=constraint?base:raw;
    const compatible=p=>!constraint||(Math.abs(det(sub(p,anchor),constraint))<1e-5&&dot(sub(p,anchor),constraint)>=-EPS);
    const candidates=[];
    const add=(p,rank,label,kind,guides=[])=>{
      const distance=dist(probe,p);if(distance<=tol&&compatible(p))candidates.push({p,rank,distance,label,kind,guides});};
    for(const hit of nearby(raw))add(hit.p,hit.rank,hit.kind==='vertex'?'Точка':hit.kind==='midpoint'?'Середина':'На ребре',hit.kind);
    const guides=referenceGuides(anchor),axis=constraint?{p:anchor,u:constraint}:null;
    for(const guide of guides){
      let p=along(guide.p,guide.u,dot(sub(probe,guide.p),guide.u));
      if(axis){const crossPoint=intersection(axis,guide);
        if(crossPoint)p=crossPoint;else if(Math.abs(det(sub(guide.p,anchor),constraint))>EPS)continue;}
      const fromAnchor=guide.kind==='parallel'||guide.kind==='perpendicular'||guide.kind==='axis';
      if(fromAnchor){const d=dist(probe,anchor);
        if(d*S.scale<20||Math.abs(det(sub(probe,anchor),guide.u))/d>Math.sin(5*Math.PI/180))continue;}
      add(p,guide.kind==='axis'?5:4,guide.label,guide.kind,[guide]);
    }
    for(let i=0;i<guides.length;i++)for(let j=i+1;j<guides.length;j++){
      const a=guides[i],b=guides[j];
      if(a.kind==='axis'||b.kind==='axis'||equal(a.p,b.p))continue;
      const p=intersection(a,b);if(p)add(p,2,([a.kind,b.kind].includes('parallel')&&[a.kind,b.kind].includes('point-perpendicular'))?'Параллельно ребру · перпендикуляр от точки':'Пересечение направляющих','intersection',[a,b]);
    }
    candidates.sort((a,b)=>a.rank-b.rank||a.distance-b.distance);
    if(candidates.length){I.solution=candidates[0];return {...I.solution.p};}
    return base;
  }
  function preview(raw) {
    if(T){temporaryPreview(raw);return;}
    S.raw={...raw};S.closeSnap=false;I.solution=null;
    if(S.active&&S.rect){previewRectangle(raw);return;}
    let p={...raw};
    if(S.snap){p.x=Math.round(p.x/S.step)*S.step;p.y=Math.round(p.y/S.step)*S.step;}
    const a=S.points.at(-1);let constraint=null;
    if(S.active&&a&&S.tool==='graphical'){
      const numeric=parse($('lineLength').value),d=S.dir||S.draftDir;
      if(d){constraint=d;
        const projected=dot(sub(p,a),d),length=S.lineDraft&&positive(numeric)?numeric:Math.max(0,projected);
        p=along(a,d,length);
        if(S.lineDraft&&positive(numeric)){S.hover=p;coords(p);return;}
      }else if(S.ortho){constraint=Math.abs(raw.x-a.x)>=Math.abs(raw.y-a.y)?{x:raw.x>=a.x?1:-1,y:0}:{x:0,y:raw.y>=a.y?1:-1};
        p=along(a,constraint,Math.max(0,dot(sub(p,a),constraint)));}
    }
    if(S.active&&!S.rect)p=infer(raw,p,a,constraint);
    if(S.active&&S.tool==='graphical'&&S.points.length>=3&&equal(p,S.points[0]))S.closeSnap=true;
    S.hover=p;coords(p);
  }
  function rectPoints() {return S.rect&&S.points.length?rectangleVertices(S.points[0],S.rect):[];}
  function projectData(){return {id:S.id,name:S.name,sequence:project.sequence,points:clone(S.points),closed:false,contours:clone(S.contours),draft:{points:clone(S.points),tool:S.tool,rect:clone(S.rect)},units:'mm',updatedAt:new Date().toISOString(),settings:{grid:S.grid,snap:S.snap,ortho:S.ortho,step:S.step,angleStep:S.angleStep,mode:S.mode}};}
  function save(){
    const current=projectData(),local=callbacks.save(current);
    if(!local){const blob=new Blob([JSON.stringify({format:'smart-home',version:1,projects:[current]},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Smart-Home-${S.name.replace(/\s/g,'-')}.json`;a.click();schedule(()=>URL.revokeObjectURL(url),1000);}
    S.dirty=false;$('save').classList.add('saved-flash');schedule(()=>$('save').classList.remove('saved-flash'),1000);
    message(local?`«${S.name}» сохранён в этом браузере.`:'Хранилище недоступно. Проект выгружен в JSON.');
  }
  function contourAt(raw) {
    for(let i=S.contours.length-1;i>=0;i--){const ps=S.contours[i].points;
      if(pointLocation(raw,ps)>=0)return i;
      for(let j=0;j<ps.length;j++){const a=ps[j],b=ps[(j+1)%ps.length],u=edgeDirection({a,b});
        const t=Math.max(0,Math.min(dist(a,b),dot(sub(raw,a),u)));if(dist(raw,along(a,u,t))*S.scale<=7)return i;}
    }return -1;
  }
  function renameContour(raw) {
    if(S.active||performance.now()-lastFinish<300)return;
    const i=contourAt(raw);if(i<0)return;renameIndex=i;
    $('contourName').value=S.contours[i].name||'';$('renameDialog').showModal();
    $('contourName').focus();$('contourName').select();
  }
  function commitName(e) {
    e.preventDefault();if(renameIndex<0||!S.contours[renameIndex])return;
    const name=$('contourName').value.trim();
    if(name!==S.contours[renameIndex].name){record();S.contours[renameIndex].name=name;}
    $('renameDialog').close();renameIndex=-1;sync();draw();canvas.focus({preventScroll:true});
  }
  function resize(reset=false) {
    if(S.page!=='editor')return;const r=$('stage').getBoundingClientRect();if(!r.width||!r.height)return;
    const oldW=S.w,oldH=S.h;S.w=r.width;S.h=r.height;
    stage.size({width:S.w,height:S.h});
    if(reset||!oldW){S.ox=S.w*.24;S.oy=S.h*.75;}else{S.ox+=(S.w-oldW)/2;S.oy+=(S.h-oldH)/2;}draw();
  }
  function zoom(factor,p={x:S.w/2,y:S.h/2}) {
    if(S.rect?.stage==='rotation')S.rect.rotationRef=null;
    const w=world(p),scale=Math.max(1e-9,Math.min(1e6,S.scale*factor));if(!finite(scale))return;
    S.scale=scale;S.ox=p.x-w.x*scale;S.oy=p.y+w.y*scale;draw();
  }
  function fit() {
    if(S.rect?.stage==='rotation')S.rect.rotationRef=null;
    const ps=[...S.contours.flatMap(c=>c.points),...(S.rect?rectPoints():S.points)];
    if(!ps.length){S.scale=BASE_SCALE;S.ox=S.w*.24;S.oy=S.h*.75;draw();return;}
    const minX=Math.min(...ps.map(p=>p.x)),maxX=Math.max(...ps.map(p=>p.x)),minY=Math.min(...ps.map(p=>p.y)),maxY=Math.max(...ps.map(p=>p.y));
    // Fit an anchor without excessive zoom.
    if(maxX-minX<EPS&&maxY-minY<EPS){S.scale=BASE_SCALE;S.ox=S.w*.24-minX*S.scale;S.oy=S.h*.75+minY*S.scale;draw();return;}
    S.scale=Math.max(1e-9,Math.min(1e6,(S.w-150)/Math.max(1,maxX-minX),(S.h-150)/Math.max(1,maxY-minY)));
    S.ox=S.w/2-(minX+maxX)/2*S.scale;S.oy=S.h/2+(minY+maxY)/2*S.scale;draw();
  }
  function line(a,b,color,width=1,dash=[]) {ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);}
  function label(text,x,y,active=false,rotate=0) {
    if(x<-200||x>S.w+200||y<-200||y>S.h+200)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(rotate);ctx.font='11px ui-monospace, SFMono-Regular, Consolas, monospace';
    const w=ctx.measureText(text).width;ctx.fillStyle=active?'#e4f5eb':'#fafcfbf0';ctx.fillRect(-w/2-6,-10,w+12,20);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=active?'#08774f':'#6c8a77';ctx.fillText(text,0,0);ctx.restore();
  }
  function dimensions(a,b,text,active=false) {const dx=b.x-a.x,dy=b.y-a.y;
    if(Math.hypot(dx,dy)<36)return;
    label(text,(a.x+b.x)/2+(Math.abs(dx)<1?-19:0),(a.y+b.y)/2+(Math.abs(dx)<1?0:19),active,Math.abs(dx)<1?-Math.PI/2:0);
  }
  function drawOutline(model,closed,rectangle) {
    const ps=model.map(screen);if(!ps.length)return;
    if(closed&&ps.length>=3){ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);ps.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fillStyle=rectangle?'#13976807':'#13976812';ctx.fill();}
    for(let i=1;i<ps.length+(closed?1:0);i++){
      const a=ps[(i-1)%ps.length],b=ps[i%ps.length];
      const active=rectangle&&((S.rect.stage==='width'&&i===1)||(S.rect.stage==='height'&&i===2));
      const rotating=rectangle&&S.rect.stage==='rotation';
      line(a,b,rotating?'#139768':active?'#139768':rectangle?'#93b9a2':'#139768',active?2.8:rotating?1.8:rectangle?1.3:1.8,rectangle&&!active?[5,4]:[]);
      if(rectangle&&i<=2)rectangleDimension(a,b,model,i,active);
      else if(!rectangle)dimensions(a,b,fmt(dist(model[(i-1)%ps.length],model[i%ps.length]),2),active);
    }
  }
  function rectangleDimension(a,b,model,i,active) {
    const len=dist(a,b);if(len<26)return;
    const centre=screen({x:model.reduce((v,p)=>v+p.x,0)/4,y:model.reduce((v,p)=>v+p.y,0)/4});
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},unit={x:(b.x-a.x)/len,y:(b.y-a.y)/len};
    let normal={x:-unit.y,y:unit.x};if(dot(sub(mid,centre),normal)<0)normal={x:-normal.x,y:-normal.y};
    const aa=along(a,normal,23),bb=along(b,normal,23),color=active?'#139768':'#a3bdad';
    line(along(a,normal,6),along(a,normal,30),color,.8);line(along(b,normal,6),along(b,normal,30),color,.8);line(aa,bb,color,.8);
    let angle=Math.atan2(unit.y,unit.x);if(angle>Math.PI/2)angle-=Math.PI;if(angle<-Math.PI/2)angle+=Math.PI;
    const side=i===1?'width':'height',locked=S.rect.locked[side];
    label((i===1?'Длина ':'Ширина ')+fmt(dist(model[i-1],model[i]),2)+(locked?' ✓':''),(aa.x+bb.x)/2,(aa.y+bb.y)/2,active,angle);
  }
  function drawRectangleReference() {
    if(!S.active||!S.rect?.sourceEdge)return;const e=S.rect.sourceEdge;line(screen(e.a),screen(e.b),'#6960a3',2);
  }
  function drawRectangleRotation() {
    const r=S.rect;if(!S.active||!r||r.stage!=='rotation'||!S.points.length)return;
    const pivot=screen(S.points[0]),angle=normalizeAngle(r.angle),theta=angle*Math.PI/180;
    const special=specialRectangleAngle(angle),emphasis=special!==null;
    const color=emphasis?'#6752a3':'#08774f',radius=56;
    const polar=(rad,degrees)=>({x:pivot.x+Math.cos(degrees*Math.PI/180)*rad,y:pivot.y-Math.sin(degrees*Math.PI/180)*rad});
    ctx.save();
    ctx.beginPath();ctx.arc(pivot.x,pivot.y,radius,0,Math.PI*2);ctx.strokeStyle='#d8e2dc';ctx.lineWidth=1;ctx.stroke();
    line(pivot,polar(radius+32,0),'#9db3a6',1,[3,4]);
    for(const degrees of SPECIAL_RECT_ANGLES){
      const selected=special===degrees;
      line(polar(radius-4,degrees),polar(radius+5,degrees),selected?color:'#b6c8bc',selected?2.8:1);
    }
    if(Math.abs(angle)>EPS){
      ctx.beginPath();ctx.arc(pivot.x,pivot.y,radius,0,-theta,theta>0);ctx.strokeStyle=color;ctx.lineWidth=emphasis?2.5:1.7;ctx.stroke();
    }
    const end=polar(radius+30,angle);line(pivot,end,color,emphasis?1.5:1,[5,4]);
    ctx.beginPath();ctx.arc(pivot.x,pivot.y,5.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.stroke();
    ctx.beginPath();ctx.arc(pivot.x,pivot.y,1.8,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    // The annotation is kept on-canvas, while the pivot stays at its world coordinate.
    const pos=polar(radius+52,angle/2),text=fmt(angle,6)+'°';
    ctx.font='12px ui-monospace,SFMono-Regular,Consolas,monospace';
    const width=ctx.measureText(text).width+18;
    const x=Math.max(width/2+8,Math.min(S.w-width/2-8,pos.x)),y=Math.max(16,Math.min(S.h-16,pos.y));
    ctx.fillStyle=emphasis?'#f1edfb':'#eaf7f0';ctx.fillRect(x-width/2,y-13,width,26);
    ctx.strokeStyle=emphasis?'#bfb0dc':'#bddaca';ctx.lineWidth=1;ctx.strokeRect(x-width/2,y-13,width,26);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);
    ctx.restore();
  }

  function drawInference() {
    if(!S.active||S.rect||T)return;
    const color='#6960a3';
    if(I.edge)line(screen(I.edge.a),screen(I.edge.b),color,2.7);
    for(const ref of I.points){const p=screen(ref.p);ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
    for(const guide of [...pairedGuides(),...(I.solution?.guides||[])]){const p=screen(guide.p),u={x:guide.u.x,y:-guide.u.y},extent=Math.hypot(S.w,S.h)*2;
      // The source can be far offscreen. Project to the canvas centre before extending.
      const c={x:S.w/2,y:S.h/2},origin=along(p,u,dot(sub(c,p),u));
      line(along(origin,u,-extent),along(origin,u,extent),color,1,[6,5]);}
    if(I.solution&&S.pointer&&S.hover){const p=screen(S.hover),text=I.solution.label;
      ctx.font='11px ui-monospace, SFMono-Regular, Consolas, monospace';const width=ctx.measureText(text).width+16;
      const x=Math.max(width/2+8,Math.min(S.w-width/2-8,p.x+20+width/2)),y=Math.max(16,Math.min(S.h-16,p.y-24));
      ctx.fillStyle='#f1eff9';ctx.fillRect(x-width/2,y-11,width,22);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);
      ctx.textAlign='start';ctx.textBaseline='alphabetic';
    }
  }
  function paintScene() {
    if(S.page!=='editor'||!S.w)return;
    ctx.clearRect(0,0,S.w,S.h);ctx.fillStyle='#fafcfb';ctx.fillRect(0,0,S.w,S.h);
    if(S.grid){let pixels=S.step*S.scale;
      // Sampling dense grids keeps the canvas responsive; snap still uses the exact step.
      if(pixels>0&&finite(pixels)){while(pixels<5)pixels*=10;
        for(const [space,color] of [[pixels,'#edf2ee'],[pixels*10,'#e0e9e3']]){
          ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1;
          for(let x=((S.ox%space)+space)%space;x<S.w;x+=space){ctx.moveTo(Math.round(x)+.5,0);ctx.lineTo(Math.round(x)+.5,S.h);}
          for(let y=((S.oy%space)+space)%space;y<S.h;y+=space){ctx.moveTo(0,Math.round(y)+.5);ctx.lineTo(S.w,Math.round(y)+.5);}ctx.stroke();}}
    }
    if(S.oy>=0&&S.oy<=S.h)line({x:0,y:S.oy},{x:S.w,y:S.oy},'#cdded2');
    if(S.ox>=0&&S.ox<=S.w)line({x:S.ox,y:0},{x:S.ox,y:S.h},'#cdded2');
    if(S.ox>0&&S.ox<S.w&&S.oy>0&&S.oy<S.h)label('0',S.ox-10,S.oy+14);
    // Fixed orientation glyph, independent of panning.
    line({x:28,y:S.h-27},{x:53,y:S.h-27},'#a3b9aa');line({x:28,y:S.h-27},{x:28,y:S.h-52},'#a3b9aa');
    ctx.fillStyle='#8ca996';ctx.font='9px ui-monospace,monospace';ctx.fillText('X',57,S.h-24);ctx.fillText('Y',25,S.h-59);
    for(const [index,contour] of S.contours.entries()){
      drawOutline(contour.points,true,false);
      if(!S.active&&index===S.highlighted){for(let i=0;i<contour.points.length;i++)line(screen(contour.points[i]),screen(contour.points[(i+1)%contour.points.length]),'#08774f',2.5);}
      if(contour.name){const anchor=interiorPoint(contour.points);if(anchor){const p=screen(anchor);label(contour.name,p.x,p.y,true);}}
    }
    drawRectangleReference();drawOutline(S.rect?rectPoints():S.points,!!S.rect,!!S.rect);
    if(S.active&&!T&&S.tool==='graphical'&&S.points.length&&S.hover){const a=screen(S.points.at(-1)),b=screen(S.hover);
      line(a,b,externalError([S.points.at(-1),S.hover])?'#b7473c':I.solution?'#6960a3':'#139768',1.5,[6,4]);dimensions(a,b,fmt(dist(S.points.at(-1),S.hover),2),!!S.dir||S.ortho);
    }
    S.points.map(screen).forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,i===0?3.3:2.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle='#139768';ctx.stroke();});
    drawInference();drawTemporary();

    // Full-canvas targeting crosshair at the resolved (snapped/constrained) point.
    if(S.hover&&(S.pointer||S.dir||S.rect)){
      const p=screen(S.hover),a=S.points.at(-1),aligned=S.active&&a&&(Math.abs(a.x-S.hover.x)<EPS||Math.abs(a.y-S.hover.y)<EPS);
      const color=aligned?'#6b9e83':'#7a9183';
      line({x:0,y:p.y},{x:S.w,y:p.y},color,.85);line({x:p.x,y:0},{x:p.x,y:S.h},color,.85);
      ctx.strokeStyle=S.closeSnap?'#08774f':'#658974';ctx.lineWidth=1;ctx.fillStyle='#fafcfb';ctx.fillRect(p.x-3,p.y-3,6,6);ctx.strokeRect(p.x-3,p.y-3,6,6);
      if(S.closeSnap){ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.stroke();}
    }
    drawRectangleRotation();
    if(document.activeElement!==$('zoomValue'))$('zoomValue').value=String(Number((S.scale/BASE_SCALE*100).toPrecision(6)));
  }
  // Temporary-point commands resolve one pending point. No helper is stored as BIM/model geometry.
  const TEMP_LABELS={area:'Точка пересечения',lines:'Точка пересечения двух линий',midpoint:'Средняя точка',twoPoints:'Точка + точка пополам',edge:'Точка на кромке'};
  function pairedGuides() {
    if(!I.edge||!I.points.length||!S.points.length)return [];
    const u=edgeDirection(I.edge),ref=I.points.at(-1).p;
    return [{p:S.points.at(-1),u,label:'Параллельно',kind:'parallel'},
      {p:ref,u:{x:-u.y,y:u.x},label:'Перпендикуляр от точки',kind:'point-perpendicular'}];
  }
  function hidePointMenu(focus=false) {
    $('pointMenu').hidden=true;
    if(focus){const target=menuReturnFocus;target&&target.isConnected&&target.offsetParent?target.focus({preventScroll:true}):canvas.focus({preventScroll:true});}
  }
  function openPointMenu(x,y) {
    if(S.page!=='editor'||!S.active||S.rect){message('Временные точки доступны во время выбора точки контура.');return;}
    clearPending();menuReturnFocus=document.activeElement;
    const r=canvas.getBoundingClientRect(),p=S.hover?screen(S.hover):{x:S.w/2,y:S.h/2};
    x=x??(r.left+p.x);y=y??(r.top+p.y);
    const menu=$('pointMenu');menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
    const b=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(innerWidth-b.width-8,x))+'px';
    menu.style.top=Math.max(8,Math.min(innerHeight-b.height-8,y))+'px';
    menu.querySelector('button:not(:disabled)').focus({preventScroll:true});
  }
  function menuKey(e) {
    const options=[...$('pointMenu').querySelectorAll('button:not(:disabled)')];
    const index=Math.max(0,options.indexOf(document.activeElement));
    if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[next].focus({preventScroll:true});
    }else if(e.key==='Enter'||e.code==='NumpadEnter'||e.key===' '){e.preventDefault();if(!e.repeat)options[index].click();}
    else if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();hidePointMenu(true);}
  }
  function temporaryHint() {
    if(!T)return '';
    const prefix=TEMP_LABELS[T.mode]+' · ';
    if(T.mode==='area')return prefix+(T.phase==='select'?'Выделите область рамкой · Esc — отмена':'Выберите подсвеченное пересечение · Enter — подтвердить');
    if(T.mode==='lines')return prefix+(T.edges.length?'Выберите вторую линию (продолжения учитываются)':'Выберите первую линию');
    if(T.mode==='midpoint')return prefix+'Выберите ребро: его середина станет точкой построения';
    if(T.mode==='twoPoints')return prefix+(T.points.length?'Выберите вторую точку':'Выберите первую точку');
    return prefix+(T.edges.length?'Точка движется по выбранному ребру · щелчок / Enter':'Выберите ребро');
  }
  function startTemporary(mode) {
    if(!TEMP_LABELS[mode]||!S.active||S.rect)return;
    hidePointMenu();cancelTemporary(false);
    const saved={dir:clone(S.dir),lineDraft:S.lineDraft,draftDir:clone(S.draftDir),value:$('lineLength').value};
    clearEntry();resetInference();
    T={mode,phase:'select',edges:[],points:[],candidate:null,candidates:[],areaStart:null,areaEnd:null,edgeHover:null,saved};
    sync();draw();canvas.focus({preventScroll:true});
  }
  function cancelTemporary(restore=true) {
    if(!T)return;const saved=T.saved;T=null;
    if(restore&&saved){S.dir=saved.dir;S.lineDraft=saved.lineDraft;S.draftDir=saved.draftDir;$('lineLength').value=saved.value;}
    sync();if(S.raw)preview(S.raw);draw();canvas.focus({preventScroll:true});
  }
  function pointForPick(raw) {
    const hit=nearby(raw)[0];if(hit)return {...hit.p};
    return S.snap?{x:Math.round(raw.x/S.step)*S.step,y:Math.round(raw.y/S.step)*S.step}:{...raw};
  }
  function edgeForPick(raw) {
    return nearby(raw).filter(hit=>hit.kind==='edge').sort((a,b)=>dist(raw,a.p)-dist(raw,b.p))[0]?.edge||null;
  }
  function edgeIntersection(a,b) {return intersection({p:a.a,u:edgeDirection(a)},{p:b.a,u:edgeDirection(b)});}
  function temporaryPreview(raw) {
    S.raw={...raw};S.closeSnap=false;I.solution=null;T.edgeHover=null;
    if(T.mode==='area'){
      T.candidate=T.phase==='choose'?T.candidates.filter(p=>dist(p,raw)*S.scale<=16).sort((a,b)=>dist(a,raw)-dist(b,raw))[0]||null:null;
    }else if(T.mode==='midpoint'){
      const edge=edgeForPick(raw);T.edgeHover=edge;T.candidate=edge?{x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2}:null;
    }else if(T.mode==='lines'){
      const edge=edgeForPick(raw);T.edgeHover=edge;
      T.candidate=T.edges.length&&edge&&edge.key!==T.edges[0].key?edgeIntersection(T.edges[0],edge):null;
    }else if(T.mode==='twoPoints'){
      const p=pointForPick(raw);T.candidate=T.points.length?{x:(T.points[0].x+p.x)/2,y:(T.points[0].y+p.y)/2}:null;T.probe=p;
    }else if(T.mode==='edge'){
      if(!T.edges.length){T.edgeHover=edgeForPick(raw);T.candidate=null;}
      else {const edge=T.edges[0],u=edgeDirection(edge),length=dist(edge.a,edge.b);
        let t=dot(sub(raw,edge.a),u);if(S.snap)t=Math.round(t/S.step)*S.step;
        // Endpoints win over step rounding; the point always remains on the segment.
        if(dist(raw,edge.a)*S.scale<=INFER_PX)t=0;if(dist(raw,edge.b)*S.scale<=INFER_PX)t=length;
        T.candidate=along(edge.a,u,Math.max(0,Math.min(length,t)));}
    }
    S.hover=T.candidate?{...T.candidate}:pointForPick(raw);coords(S.hover);
  }
  function commitTemporary(p) {
    if(!p||!finite(p.x)||!finite(p.y))return false;
    const state=T;T=null;
    const referenceEdge=state?.mode==='edge'?state.edges[0]:state?.mode==='midpoint'?state.edgeHover:null;
    if(!append(p,referenceEdge)){const error=$('commandHint').textContent;T=state;sync();message(error,true);draw();return false;}
    const q=screen(p);if(q.x<20||q.x>S.w-20||q.y<20||q.y>S.h-20){S.ox=S.w*.4-p.x*S.scale;S.oy=S.h*.6+p.y*S.scale;draw();}
    return true;
  }
  function temporaryClick(raw) {
    if(!T)return;temporaryPreview(raw);
    if(T.mode==='midpoint'){
      if(!T.candidate){message('Выберите существующее ребро.',true);return;}commitTemporary(T.candidate);
    }else if(T.mode==='twoPoints'){
      if(!T.points.length){T.points.push(pointForPick(raw));T.phase='second';announceState();draw();}
      else commitTemporary(T.candidate);
    }else if(T.mode==='lines'){
      const edge=T.edgeHover;if(!edge){message('Выберите существующее ребро.',true);return;}
      if(!T.edges.length){T.edges.push(clone(edge));T.phase='second';announceState();draw();}
      else if(edge.key===T.edges[0].key)message('Выберите другую линию.',true);
      else if(!T.candidate)message('У параллельных или совпадающих линий нет единственной точки пересечения.',true);
      else commitTemporary(T.candidate);
    }else if(T.mode==='edge'){
      if(!T.edges.length){if(!T.edgeHover){message('Выберите существующее ребро.',true);return;}
        T.edges.push(clone(T.edgeHover));T.phase='position';temporaryPreview(raw);announceState();draw();}
      else commitTemporary(T.candidate);
    }else if(T.mode==='area'){
      if(T.candidate)commitTemporary(T.candidate);else message('Щёлкните по одному из отмеченных пересечений или Esc — отмена.',true);
    }
  }
  function finishArea() {
    const a=T.areaStart,b=T.areaEnd;T.areaStart=null;T.areaEnd=null;
    const pad=dist(a,b)*S.scale<4?12/S.scale:0;
    const x0=Math.min(a.x,b.x)-pad,x1=Math.max(a.x,b.x)+pad,y0=Math.min(a.y,b.y)-pad,y1=Math.max(a.y,b.y)+pad;
    const edges=entities().edges,candidates=[];
    for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
      const p=edgeIntersection(edges[i],edges[j]);
      if(p&&onSegment(edges[i].a,edges[i].b,p)&&onSegment(edges[j].a,edges[j].b,p)&&p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1&&!candidates.some(q=>dist(p,q)<GEOM_TOL))candidates.push(p);
    }
    T.candidates=candidates;T.phase=candidates.length?'choose':'select';T.candidate=candidates.length===1?candidates[0]:null;
    if(T.candidate){S.hover={...T.candidate};coords(S.hover);}announceState();
    if(!candidates.length)message('В области нет пересечений отрезков. Выделите другую область.',true);
    draw();
  }
  function drawTemporary() {
    if(!T)return;const color='#6960a3';
    for(const edge of [...T.edges,...(T.edgeHover?[T.edgeHover]:[])])line(screen(edge.a),screen(edge.b),color,3);
    if(T.mode==='lines'&&T.candidate){
      for(const e of [...T.edges,...(T.edgeHover?[T.edgeHover]:[])]){
        const q=dist(e.a,T.candidate)<dist(e.b,T.candidate)?e.a:e.b;line(screen(q),screen(T.candidate),color,1,[5,5]);}
    }
    if(T.mode==='twoPoints'&&T.points.length&&T.probe)line(screen(T.points[0]),screen(T.probe),color,1,[5,5]);
    for(const p of [...T.points,...T.candidates]){const q=screen(p);ctx.beginPath();ctx.arc(q.x,q.y,4,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.stroke();}
    if(T.candidate){const q=screen(T.candidate);ctx.fillStyle='#f1eff9';ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(T.areaStart&&T.areaEnd){const a=screen(T.areaStart),b=screen(T.areaEnd);ctx.fillStyle='#6960a310';ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}
  }

  // Toolbar, modal and document actions.
  listen($('pointMenu'),'contextmenu',e=>e.preventDefault());
  root.querySelectorAll('[data-point]').forEach(button=>listen(button,'click',()=>startTemporary(button.dataset.point)));
  listen($('renameForm'),'submit',commitName);
  for(const id of ['cancelRename','closeRename'])listen($(id),'click',()=>$('renameDialog').close());
  listen($('renameDialog'),'close',()=>{renameIndex=-1;canvas.focus({preventScroll:true});});
  listen(document,'pointerdown',e=>{if(!$('pointMenu').hidden&&!$('pointMenu').contains(e.target))hidePointMenu();});
  listen(window,'resize',()=>hidePointMenu());
  listen($('save'),'click',save);listen($('undo'),'click',undo);listen($('redo'),'click',redo);
  listen($('contourTool'),'click',openMethods);listen($('beginContour'),'click',openMethods);
  listen($('graphicalTool'),'click',()=>activate('graphical'));listen($('rectangleTool'),'click',()=>activate('rectangle'));
  listen($('closeMethods'),'click',()=>$('methodDialog').close());
  listen($('originForm'),'submit',e=>{e.preventDefault();origin();});
  listen($('lineForm'),'submit',e=>{e.preventDefault();buildLength();});
  listen($('rectForm'),'submit',e=>{e.preventDefault();commitRectangle();});
  listen($('lineLength'),'input',()=>{if(S.points.length)preview(S.raw||S.points.at(-1));draw();});
  for(const side of ['width','height']){
    const input=$(RECT_FIELDS[side].id);listen(input,'focus',()=>{selectRectangleSide(side);input.select();});
    listen(input,'input',()=>editRectangleSide(side));
  }
  listen($('rectAngle'),'focus',()=>{$('rectAngle').select();syncRectangleFields();});
  listen($('rectAngle'),'input',editRectangleAngle);
  function toggle(key) {S[key]=!S[key];sync();if(S.raw)preview(S.raw);draw();}
  listen($('gridToggle'),'click',()=>toggle('grid'));
  listen($('snapToggle'),'click',()=>toggle('snap'));
  listen($('orthoToggle'),'click',()=>toggle('ortho'));
  function commitStep() {const n=parse($('gridStep').value);if(!positive(n)||!finite(n*S.scale)){$('gridStep').value=String(S.step);message('Шаг сетки должен быть положительным конечным числом.',true);return;}S.step=n;if(S.raw)preview(S.raw);draw();}
  listen($('angleStep'),'change',commitAngleStep);
  listen($('angleStep'),'keydown',e=>{if(e.key==='Enter'||e.code==='NumpadEnter'){
    e.preventDefault();if(commitAngleStep()){
      if(S.rect?.stage==='rotation'){$('rectAngle').focus({preventScroll:true});$('rectAngle').select();}
      else canvas.focus({preventScroll:true});
    }
  }});
  listen($('gridStep'),'change',commitStep);
  listen($('gridStep'),'keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitStep();canvas.focus({preventScroll:true});}});
  listen($('deviceMode'),'click',()=>{S.mode=S.mode==='mouse'?'trackpad':'mouse';const isMouse=S.mode==='mouse';
    $('deviceMouse').toggleAttribute('hidden',!isMouse);$('deviceTrackpad').toggleAttribute('hidden',isMouse);
    $('deviceMode').title=isMouse?'Мышь. Нажмите для переключения на тачпад':'Тачпад. Нажмите для переключения на мышь';
    $('deviceMode').setAttribute('aria-label',`Навигация: ${isMouse?'мышь. Переключить на тачпад':'тачпад. Переключить на мышь'}`);
    message(isMouse?'Мышь: колесо — масштаб · щелчок колесом — временные точки · перетаскивание — сдвиг':'Тачпад: два пальца — перемещение · щипок / Ctrl + прокрутка — масштаб');});
  listen($('fit'),'click',fit);listen($('zoomIn'),'click',()=>zoom(1.25));listen($('zoomOut'),'click',()=>zoom(.8));
  function commitZoom() {const n=parse($('zoomValue').value.replace('%',''));if(!positive(n)){message('Масштаб должен быть положительным числом.',true);$('zoomValue').value=String(S.scale/BASE_SCALE*100);return;}zoom(n/(S.scale/BASE_SCALE*100));}
  listen($('zoomValue'),'change',commitZoom);
  listen($('zoomValue'),'keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitZoom();canvas.focus({preventScroll:true});draw();}});
  listen(canvas,'pointerdown',e=>{
    if(!$('pointMenu').hidden&&(e.button===0||e.button===2)){e.preventDefault();dismissContext=e.button===2;hidePointMenu(true);return;}
    if(e.button===1){e.preventDefault();clearPending();S.middle={p:mouse(e),ox:S.ox,oy:S.oy,id:e.pointerId};canvas.setPointerCapture(e.pointerId);return;}
    if(e.button===0&&S.space){e.preventDefault();S.pan={p:mouse(e),ox:S.ox,oy:S.oy,id:e.pointerId};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';return;}
    if(e.button!==0)return;e.preventDefault();hidePointMenu();canvas.focus({preventScroll:true});S.pointer=true;
    if(!S.active)return;
    const raw=world(mouse(e));
    if(T){if(T.mode==='area'&&T.phase==='select'){T.areaStart=raw;T.areaEnd=raw;canvas.setPointerCapture(e.pointerId);draw();}else temporaryClick(raw);return;}
    if(e.altKey&&!S.rect){pinReference(raw);return;}
    if(S.rect){preview(raw);commitRectangle();return;}
    preview(raw);
    const referenceEdge=S.tool==='rectangle'&&!S.points.length&&['edge','midpoint'].includes(I.solution?.kind)?nearby(raw).find(h=>h.edge&&equal(h.p,S.hover))?.edge:null;
    append(S.hover,referenceEdge);
  });
  listen(canvas,'pointermove',e=>{
    S.pointer=true;const p=mouse(e);
    if(S.middle&&!S.pan&&dist(p,S.middle.p)>4){S.pan=S.middle;canvas.style.cursor='grabbing';}
    if(S.pan){S.ox=S.pan.ox+p.x-S.pan.p.x;S.oy=S.pan.oy+p.y-S.pan.p.y;draw();return;}
    if(!$('pointMenu').hidden)return;
    const raw=world(p);if(T?.areaStart){T.areaEnd=raw;draw();return;}
    S.highlighted=!S.active?contourAt(raw):-1;trackReference(raw);preview(raw);draw();
  });
  listen(canvas,'pointerleave',()=>{if(S.rect?.stage==='rotation')S.rect.rotationRef=null;S.pointer=false;S.highlighted=-1;clearPending();draw();});
  function stopPan(e) {
    const tap=e.type==='pointerup'&&S.middle&&!S.pan;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(S.pan&&S.rect?.stage==='rotation')S.rect.rotationRef=null;
    S.pan=null;S.middle=null;canvas.style.cursor=S.space?'grab':'none';
    if(tap)openPointMenu(e.clientX,e.clientY);
    if(T?.areaStart){if(e.type==='pointerup')finishArea();else{T.areaStart=null;T.areaEnd=null;draw();}}
  }
  listen(canvas,'pointerup',stopPan);listen(canvas,'pointercancel',stopPan);
  listen(canvas,'auxclick',e=>{if(e.button===1)e.preventDefault();});
  listen(canvas,'dblclick',e=>{e.preventDefault();renameContour(world(mouse(e)));});
  listen(canvas,'contextmenu',e=>{e.preventDefault();if(dismissContext){dismissContext=false;return;}if(T){cancelTemporary();return;}if(S.active&&S.tool==='graphical')closeContour();});
  listen(canvas,'wheel',e=>{e.preventDefault();const f=e.deltaMode===1?16:e.deltaMode===2?S.h:1;
    if(S.rect?.stage==='rotation')S.rect.rotationRef=null;
    if(S.mode==='trackpad'&&!e.ctrlKey&&!e.metaKey){S.ox-=e.deltaX*f;S.oy-=e.deltaY*f;draw();}
    else zoom(Math.exp(-e.deltaY*f*.0015),mouse(e));
  },{passive:false});
  function escape() {
    if(!$('pointMenu').hidden){hidePointMenu(true);return;}
    if(T){cancelTemporary();return;}
    if(S.rect&&cancelRectangleEdit())return;
    if(S.dir||S.lineDraft){clearEntry();if(S.raw)preview(S.raw);sync();draw();canvas.focus({preventScroll:true});return;}
    if(I.points.length||I.edge){resetInference();if(S.raw)preview(S.raw);sync();message('Направляющие сброшены. Продолжайте контур.');draw();canvas.focus({preventScroll:true});return;}
    if(S.active){S.active=false;clearEntry();resetInference();sync();draw();canvas.focus({preventScroll:true});}
  }
  function commitCommand() {
    if(!S.active)return;
    if(T){if(T.candidate)commitTemporary(T.candidate);return;}
    if(!S.points.length)origin();else if(S.rect)commitRectangle();else if(S.lineDraft||S.dir)buildLength();
  }
  // Explicit Enter routing: independent of implicit form submission and canvas focus.
  // Prevent the native submit once handled, so a key press commits exactly one step.
  listen(document,'keydown',e=>{
    if(S.page!=='editor'||document.querySelector('dialog[open]')||e.isComposing||e.keyCode===229)return;
    if(!$('pointMenu').hidden){menuKey(e);return;}
    const input=e.target.matches('input,textarea,[contenteditable="true"]');
    const drawingInput=['originX','originY','lineLength','rectW','rectH'].includes(e.target.id);
    const rectangleTarget=e.target===canvas||e.target===document.body||['rectW','rectH','rectAngle'].includes(e.target.id);
    if(S.active&&S.rect&&rectangleTarget&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      if(e.target.id==='rectAngle'&&(e.key==='Enter'||e.code==='NumpadEnter')){
        e.preventDefault();e.stopPropagation();if(!e.repeat)confirmRectangleAngle();return;
      }
      if(e.key==='Tab'){
        e.preventDefault();if(!e.repeat){
          if(!validRectangleAngle())return;
          if(S.rect.stage==='rotation')selectRectangleSide(e.shiftKey?'height':'width',true);
          else if(e.target.id==='rectAngle'){
            S.rect.angleDraft=null;S.rect.angleBefore=null;syncRectangleFields();canvas.focus({preventScroll:true});
          }else selectRectangleSide(otherSide(S.rect.stage),true);
        }return;
      }
      if(!input&&['a','ф'].includes(e.key.toLowerCase())){e.preventDefault();$('rectAngle').focus({preventScroll:true});$('rectAngle').select();return;}
    }

    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!input){e.preventDefault();e.shiftKey?redo():undo();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!input){e.preventDefault();redo();return;}
    if(e.key==='Escape'){e.preventDefault();escape();return;}
    if(e.key==='F8'){e.preventDefault();toggle('ortho');return;}
    const enter=e.key==='Enter'||e.code==='NumpadEnter';
    if(enter&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&S.active&&(drawingInput||e.target===canvas||e.target===document.body)){
      e.preventDefault();e.stopPropagation();if(!e.repeat)commitCommand();return;
    }
    if(!input&&['p','з'].includes(e.key.toLowerCase())&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openPointMenu();return;}
    if(T&&e.code!=='Space')return;
    if(dirs[e.key]&&(!input||e.target.id==='lineLength')&&S.active&&S.points.length&&S.tool==='graphical'){
      e.preventDefault();if(!e.repeat)setDirection(e.key);return;}
    if(input)return;
    if(e.code==='Space'){e.preventDefault();S.space=true;canvas.style.cursor='grab';return;}
    if(['f','а'].includes(e.key.toLowerCase())){e.preventDefault();fit();return;}
    if(['c','с'].includes(e.key.toLowerCase())&&S.active){e.preventDefault();closeContour();return;}
    if(e.key==='Backspace'){e.preventDefault();undo();return;}
    if(S.active&&/^[0-9.,+-]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault();let target;
      if(!S.points.length)target=$('originX');
      else if(S.rect)target=$(S.rect.stage==='rotation'?'rectAngle':S.rect.stage==='width'?'rectW':'rectH');
      else {S.draftDir=unitDirection();S.lineDraft=true;sync();target=$('lineLength');}
      target.focus({preventScroll:true});target.value=e.key;target.setSelectionRange(1,1);
      if(S.rect){if(S.rect.stage==='rotation')editRectangleAngle();else editRectangleSide(S.rect.stage);}else if(S.raw)preview(S.raw);draw();
    }
  },true);

  listen(document,'keyup',e=>{if(e.code==='Space'){S.space=false;canvas.style.cursor=S.pan?'grabbing':'none';}});
  listen(window,'blur',()=>{if(S.rect?.stage==='rotation')S.rect.rotationRef=null;S.space=false;S.pan=null;S.middle=null;clearPending();canvas.style.cursor='none';});
  const observer=new ResizeObserver(()=>resize());observer.observe($('stage'));
  Object.assign(S,{page:'editor',id:project.id,name:project.name,points:clone(project.points||[]),contours:clone(project.contours||[]),tool:project.draft?.tool==='rectangle'?'rectangle':'graphical',active:false});
  if(S.tool==='rectangle'&&S.points.length===1)S.rect=normalizeRectangle(project.draft?.rect);
  const settings=project.settings;
  if(settings){for(const key of ['grid','snap','ortho'])if(typeof settings[key]==='boolean')S[key]=settings[key];if(positive(settings.step))S.step=settings.step;if(positive(settings.angleStep)&&settings.angleStep<=360)S.angleStep=settings.angleStep;if(settings.mode==='trackpad')S.mode='trackpad';}
  $('deviceMouse').toggleAttribute('hidden',S.mode!=='mouse');$('deviceTrackpad').toggleAttribute('hidden',S.mode==='mouse');
  sync();resize(true);fit();
  listen(window,'beforeunload',e=>{if(S.dirty){e.preventDefault();e.returnValue='';}});
  return {
    destroy(){if(disposed)return;disposed=true;S.page='home';abort.abort();observer.disconnect();clearPending();timers.forEach(clearTimeout);stage.destroy();},
    getProject:projectData,isDirty:()=>S.dirty,save,
getState:()=>clone({
    version:1,page:S.page,id:S.id,name:S.name,active:S.active,tool:S.tool,points:S.points,contours:S.contours,closed:S.closed,rect:S.rect,rectanglePreview:rectPoints(),
    temporary:T?{mode:T.mode,phase:T.phase,points:T.points,edges:T.edges,candidate:T.candidate,candidates:T.candidates}:null,menuOpen:!$('pointMenu').hidden,grid:S.grid,snap:S.snap,ortho:S.ortho,step:S.step,angleStep:S.angleStep,angleHighlight:S.rect?.stage==='rotation'?specialRectangleAngle(S.rect.angle):null,mode:S.mode,dir:S.dir,hover:S.hover,
    scale:S.scale,ox:S.ox,oy:S.oy,w:S.w,h:S.h,history:S.history.length,future:S.future.length,
    area:S.contours.length?Math.abs(signedArea(S.contours.at(-1).points))/1e6:0,perimeter:S.contours.length?perimeter(S.contours.at(-1).points)/1000:0,dirty:S.dirty,
    inference:{points:I.points,edge:I.edge,kind:I.solution?.kind||null,guides:I.solution?.guides||[],label:I.solution?.label||null,pending:I.pending?.key||null},
    metrics:S.contours.map(c=>({name:c.name||'',area:Math.abs(signedArea(c.points))/1e6,perimeter:perimeter(c.points)/1000,sides:c.points.length}))
  }),geometryCheck:(a,b)=>({aError:validate(a),bError:validate(b),overlap:overlap(a,b)})
  };
}
