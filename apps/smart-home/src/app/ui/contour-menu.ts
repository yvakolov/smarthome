import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Output, inject, input } from '@angular/core';
import { LucideTrash2, LucidePencil, LucideMove, LucideCopy, LucideRotateCcw } from '@lucide/angular';
import { ContourCommand, ContourMenuPosition } from '../core/models';
import { HlmDropdownMenu } from './menu/hlm-dropdown-menu';
import { HlmDropdownMenuItem } from './menu/hlm-dropdown-menu-item';
@Component({selector:'sh-contour-menu',imports:[HlmDropdownMenu,HlmDropdownMenuItem,LucideTrash2,LucidePencil,LucideMove,LucideCopy,LucideRotateCcw],changeDetection:ChangeDetectionStrategy.OnPush,
  host:{'data-context-menu':'',class:'contour-context','[style.left.px]':'left()','[style.top.px]':'top()'},
  template:`<div hlmDropdownMenu aria-label="Действия с контуром" (contextmenu)="$event.preventDefault()" (keydown.escape)="close($event)">
    <button hlmDropdownMenuItem variant="destructive" (triggered)="choose('delete')"><svg lucideTrash2 [size]="16" />Удалить</button>
    <button hlmDropdownMenuItem (triggered)="choose('edit')"><svg lucidePencil [size]="16" />Редактировать</button>
    <div role="separator" class="menu-separator"></div>
    <button hlmDropdownMenuItem (triggered)="choose('move')"><svg lucideMove [size]="16" />Переместить</button>
    <button hlmDropdownMenuItem (triggered)="choose('duplicate')"><svg lucideCopy [size]="16" />Дублировать</button>
    <button hlmDropdownMenuItem (triggered)="choose('rotate')"><svg lucideRotateCcw [size]="16" />Повернуть</button>
  </div>`})
export class ContourMenu implements AfterViewInit{
  readonly position=input.required<ContourMenuPosition>();private readonly element=inject<ElementRef<HTMLElement>>(ElementRef);
  @Output()readonly command=new EventEmitter<ContourCommand>();@Output()readonly dismissed=new EventEmitter<void>();
  left():number{return Math.max(8,Math.min(window.innerWidth-228,this.position().x));}
  top():number{return Math.max(8,Math.min(window.innerHeight-210,this.position().y));}
  ngAfterViewInit():void{this.element.nativeElement.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}
  choose(command:ContourCommand):void{this.command.emit(command);}
  close(event:Event):void{event.preventDefault();event.stopPropagation();this.dismissed.emit();}
  @HostListener('document:pointerdown',['$event'])outside(event:PointerEvent):void{if(!this.element.nativeElement.contains(event.target as Node))this.dismissed.emit();}
  @HostListener('window:resize')resized():void{this.dismissed.emit();}
}
