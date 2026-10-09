import { Component,ChangeDetectionStrategy,ElementRef,inject,AfterViewInit,OnDestroy,NgZone,isDevMode } from '@angular/core';
import { ActivatedRoute,Router } from '@angular/router';
import { LucideCornerDownRight,LucideFilePlus2,LucideFolderOpen,LucideGrid2x2,LucideMagnet,LucideMouse,LucideRectangleHorizontal,LucideRedo2,LucideRotateCcw,LucideSave,LucideScan,LucideScanLine,LucideTouchpad,LucideUndo2,LucideX } from '@lucide/angular';
import { HlmButton,HlmInput } from '../ui/primitives';
import { ProjectsStore } from '../core/projects.store';
import { EditorHandle } from '../core/models';
import { mountEditor } from '../editor/controller.js';
@Component({selector:'sh-editor-layout',imports:[HlmButton,HlmInput,LucideCornerDownRight,LucideFilePlus2,LucideFolderOpen,LucideGrid2x2,LucideMagnet,LucideMouse,LucideRectangleHorizontal,LucideRedo2,LucideRotateCcw,LucideSave,LucideScan,LucideScanLine,LucideTouchpad,LucideUndo2,LucideX],templateUrl:'./editor-layout.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class EditorLayout implements AfterViewInit,OnDestroy {
  private readonly element=inject(ElementRef<HTMLElement>);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly store=inject(ProjectsStore);private readonly zone=inject(NgZone);private handle?:EditorHandle;
  ngAfterViewInit():void {
    const project=this.store.get(this.route.snapshot.paramMap.get('id')||'');if(!project){void this.router.navigate(['/projects']);return;}
    this.zone.runOutsideAngular(()=>{this.handle=mountEditor(this.element.nativeElement,project,{save:p=>this.zone.run(()=>this.store.persist(p))});});
    // Development-only observability for deterministic geometry and browser tests.
    if(isDevMode())(window as any).smartHomeEditor=this.handle;
  }
  ngOnDestroy():void {if(this.handle){this.store.remember(this.handle.getProject());this.handle.destroy();}if(isDevMode())delete (window as any).smartHomeEditor;}
}
