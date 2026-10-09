import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, OnDestroy, Output, computed, effect, input, signal } from '@angular/core';
import { LucideX, LucideCheck, LucideRotateCcw } from '@lucide/angular';
import { Contour, ContourChanges } from '../core/models';
import { contourFrame } from '../editor/contour-transform.js';
import { HlmButton, HlmInput } from './primitives';
import { HlmCardImports } from './card';

@Component({
  selector: 'sh-contour-inspector',
  imports: [HlmButton, HlmInput, HlmCardImports, LucideX, LucideCheck, LucideRotateCcw],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {role: 'complementary', 'aria-label': 'Контур', class: 'contour-inspector'},
  template: `
    <div class="inspector-resize" role="separator" tabindex="0" aria-label="Изменить ширину инспектора"
      aria-orientation="vertical" aria-controls="inspectorContent" aria-valuemin="240"
      [attr.aria-valuemax]="maximum()" [attr.aria-valuenow]="width()"
      (pointerdown)="startResize($event)" (pointermove)="resize($event)"
      (pointerup)="stopResize()" (pointercancel)="stopResize()" (lostpointercapture)="stopResize()"
      (keydown)="resizeByKey($event)"></div>
    <form hlmCard class="inspector-card" (submit)="apply($event)">
      <header hlmCardHeader class="inspector-header"><h2 hlmCardTitle>Контур</h2>
        <button hlmBtn class="icon-button" type="button" aria-label="Закрыть инспектор" (click)="closed.emit()"><svg lucideX [size]="18" /></button>
      </header>
      <div hlmCardContent class="inspector-content" id="inspectorContent">
        <label for="inspectorName">Название</label>
        <input hlmInput id="inspectorName" [value]="name()" (input)="name.set(value($event))" placeholder="Дом, терраса…" maxlength="80" autocomplete="off">
        <p class="field-note">Форма редактируется на холсте: вершины, рёбра и точки + на сторонах.</p>
        <button hlmBtn type="button" class="secondary" (click)="editRequested.emit()">Редактировать на холсте</button>
        <label for="inspectorColor">Цвет контура</label>
        <div class="contour-color-field"><input id="inspectorColor" type="color" [value]="color()" aria-label="Цвет контура" (input)="color.set(value($event))"><span>{{color()}}</span></div>
        <dl class="contour-metrics"><dt>Площадь</dt><dd>{{number(metrics()?.area)}} м²</dd><dt>Периметр</dt><dd>{{number(metrics()?.perimeter)}} м</dd></dl>
        @if(localError() || error()){<p class="form-error" role="alert">{{localError() || error()}}</p>}
      </div>
      <footer hlmCardFooter class="inspector-footer">
        <button hlmBtn type="button" class="icon-button" aria-label="Сбросить изменения полей" title="Сбросить изменения полей" (click)="reset()"><svg lucideRotateCcw [size]="16" /></button>
        <button hlmBtn type="submit" class="secondary primary"><svg lucideCheck [size]="16" />Применить</button>
      </footer>
    </form>`,
})
export class ContourInspector implements OnDestroy {
  readonly contour = input<Contour | null>(null);
  readonly error = input('');
  readonly width = signal(240);
  readonly maximum = signal(Math.max(240, Math.floor(window.innerWidth * .3)));
  readonly name=signal('');readonly color=signal('#139768');readonly length=signal('');readonly breadth=signal('');readonly angle=signal('');readonly localError=signal('');
  readonly metrics=computed(()=>{const c=this.contour();return c?contourFrame(c.points):null;});
  @Output() readonly editRequested = new EventEmitter<void>();
  @Output() readonly changed = new EventEmitter<ContourChanges>();
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly widthChanged = new EventEmitter<number>();
  private drag: {x:number;width:number;id:number;target:HTMLElement}|null=null;
  private signature='';
  constructor(){effect(()=>{const c=this.contour(),signature=JSON.stringify(c);if(signature!==this.signature){this.signature=signature;this.reset();}});}
  value(event:Event):string{return (event.target as HTMLInputElement).value;}
  number(n:number|undefined):string{return n===undefined?'—':n.toLocaleString('ru-RU',{maximumFractionDigits:2});}
  reset():void{const c=this.contour(),m=this.metrics();this.name.set(c?.name||'');this.color.set(c?.color||'#139768');this.length.set(m?String(Number(m.width.toFixed(6))):'');this.breadth.set(m?String(Number(m.height.toFixed(6))):'');this.angle.set(m?String(Number(m.angle.toFixed(6))):'');this.localError.set('');}
  apply(event:Event):void{
    event.preventDefault();this.localError.set('');
    this.changed.emit({name:this.name().trim(),color:this.color()});
  }

  private setWidth(value:number):void{this.width.set(Math.min(this.maximum(),Math.max(240,Math.round(value))));this.widthChanged.emit(this.width());}
  startResize(event:PointerEvent):void{
    if(event.button!==0||window.innerWidth<800)return;event.preventDefault();event.stopPropagation();
    const target=event.currentTarget as HTMLElement;this.drag={x:event.clientX,width:this.width(),id:event.pointerId,target};target.setPointerCapture(event.pointerId);document.body.classList.add('resizing-inspector');
  }
  resize(event:PointerEvent):void{if(this.drag&&event.pointerId===this.drag.id)this.setWidth(this.drag.width+this.drag.x-event.clientX);}
  @HostListener('window:blur') stopResize():void{const drag=this.drag;this.drag=null;if(drag?.target.hasPointerCapture(drag.id))drag.target.releasePointerCapture(drag.id);document.body.classList.remove('resizing-inspector');}
  @HostListener('window:resize') viewportChanged():void{this.stopResize();this.maximum.set(Math.max(240,Math.floor(window.innerWidth*.3)));this.setWidth(this.width());}
  resizeByKey(event:KeyboardEvent):void{
    if(window.innerWidth<800||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?48:16;
    this.setWidth(event.key==='Home'?240:event.key==='End'?this.maximum():this.width()+(event.key==='ArrowLeft'?step:-step));
  }
  ngOnDestroy():void{this.stopResize();}
}
