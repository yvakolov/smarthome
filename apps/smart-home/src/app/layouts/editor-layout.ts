import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideCornerDownRight,LucideFilePlus2,LucideFolderOpen,LucideGrid2x2,LucideMagnet,LucideMouse,LucideRectangleHorizontal,LucideRedo2,LucideRotateCcw,LucideSave,LucideScan,LucideScanLine,LucideTouchpad,LucideUndo2,LucideX } from '@lucide/angular';
import { HlmButton, HlmInput } from '../ui/primitives';
import { HlmCardImports } from '../ui/card';
import { ContourInspector } from '../ui/contour-inspector';
import { ContourMenu } from '../ui/contour-menu';
import { ProjectsStore } from '../core/projects.store';
import { Contour, ContourChanges, ContourCommand, ContourMenuPosition, EditorHandle, Project } from '../core/models';
import { mountEditor } from '../editor/controller.js';

@Component({selector:'sh-editor-layout',imports:[HlmButton,HlmInput,HlmCardImports,ContourInspector,ContourMenu,LucideCornerDownRight,LucideFilePlus2,LucideFolderOpen,LucideGrid2x2,LucideMagnet,LucideMouse,LucideRectangleHorizontal,LucideRedo2,LucideRotateCcw,LucideSave,LucideScan,LucideScanLine,LucideTouchpad,LucideUndo2,LucideX],templateUrl:'./editor-layout.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class EditorLayout implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(ProjectsStore);
  private readonly zone = inject(NgZone);
  @ViewChild('saveDialog', {static:true}) private saveDialog!: ElementRef<HTMLDialogElement>;
  private handle?: EditorHandle;
  private destroyed = false;
  private pending?: {project: Project; resolve: (project: Project | null) => void};
  readonly selectedContour = signal<Contour | null>(null);
  readonly inspectorHidden = signal(false);
  readonly inspectorWidth = signal(240);
  readonly inspectorError = signal('');
  readonly contextMenu = signal<ContourMenuPosition|null>(null);
  readonly projectName = signal('');
  readonly saveError = signal('');
  readonly saving = signal(false);

  async ngAfterViewInit(): Promise<void> {
    try {
      const project = await this.store.get(this.route.snapshot.paramMap.get('id') || '');
      if(this.destroyed)return;
      if(!project){void this.router.navigate(['/projects']);return;}
      this.zone.runOutsideAngular(() => {
        this.handle = mountEditor(this.element.nativeElement, project, {
          save: p => this.zone.run(() => this.requestSave(p)),
          selectContour: c => this.zone.run(() => {if(this.selectedContour()?.id!==c?.id)this.inspectorHidden.set(false);this.selectedContour.set(c);this.inspectorError.set('');}),
          contextMenu: m => this.zone.run(() => this.contextMenu.set(m)),
        });
      });
      if(isDevMode())(window as any).smartHomeEditor = this.handle;
    } catch {if(!this.destroyed)void this.router.navigate(['/projects']);}
  }
  private requestSave(project: Project): Promise<Project | null> {
    if (this.store.hasSaved(project.id)) return this.store.persist(project);
    this.projectName.set(project.name); this.saveError.set('');
    return new Promise(resolve => {
      this.pending = {project: structuredClone(project), resolve};
      this.saveDialog.nativeElement.showModal();
      const field=this.element.nativeElement.querySelector<HTMLInputElement>('#projectName');
      // Angular will keep the same value on its next render; set it now for immediate selection.
      if(field){field.value=project.name;field.focus();field.select();}
    });
  }
  setProjectName(event: Event): void {this.projectName.set((event.target as HTMLInputElement).value);this.saveError.set('');}
  cancelNaming(event?: Event): void {
    event?.preventDefault(); if(this.saving())return;
    this.saveDialog.nativeElement.close();
    const pending=this.pending;this.pending=undefined;pending?.resolve(null);
  }
  async confirmNaming(event: Event): Promise<void> {
    event.preventDefault();if(!this.pending||this.saving())return;
    const name=this.projectName().trim();
    if(!name){this.saveError.set('Введите название проекта.');return;}
    if(name.length>120){this.saveError.set('Название не должно превышать 120 символов.');return;}
    const pending=this.pending;this.saving.set(true);this.saveError.set('');
    try {
      const saved=await this.store.persist({...pending.project,name});
      if(this.destroyed)return;
      this.pending=undefined;this.saveDialog.nativeElement.close();pending.resolve(saved);
    } catch(error) {
      if(!this.destroyed)this.saveError.set(error instanceof Error?error.message:'Не удалось сохранить проект. Повторите попытку.');
    } finally {this.saving.set(false);}
  }
  editOnCanvas():void {const c=this.selectedContour();if(c){this.handle?.startOperation('edit',c.id);if(window.innerWidth<800)this.inspectorHidden.set(true);}}
  clearSelection(): void {this.handle?.clearSelection();}
  updateContour(changes:ContourChanges):void {
    const contour=this.selectedContour();if(contour)this.inspectorError.set(this.handle?.updateContour(contour.id,changes)||'');
  }
  runContourCommand(command:ContourCommand):void {const menu=this.contextMenu();this.contextMenu.set(null);if(menu)this.handle?.startOperation(command,menu.id);}
  closeContextMenu():void {this.contextMenu.set(null);this.element.nativeElement.querySelector<HTMLElement>('#canvas')?.focus({preventScroll:true});}
  ngOnDestroy(): void {
    this.destroyed=true;
    const pending=this.pending;this.pending=undefined;pending?.resolve(null);
    if(this.handle){this.store.remember(this.handle.getProject());this.handle.destroy();}
    if(isDevMode())delete (window as any).smartHomeEditor;
  }
}
