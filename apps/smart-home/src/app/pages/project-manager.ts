import { Component,ChangeDetectionStrategy,inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucidePlus,LucideScanLine } from '@lucide/angular';
import { HlmButton } from '../ui/primitives';
import { Project } from '../core/models';
import { ProjectsStore } from '../core/projects.store';
@Component({selector:'sh-project-manager',imports:[HlmButton,LucidePlus,LucideScanLine],changeDetection:ChangeDetectionStrategy.OnPush,template:`
<main class="manager" aria-label="Проекты"><div class="project-grid">
<button hlmBtn class="new-project-card" (click)="create()"><svg lucidePlus [size]="30" [strokeWidth]="1.3"></svg><span>Новый проект</span></button>
@for(project of store.projects();track project.id){
  <button hlmBtn class="project-card" (click)="open(project.id)" [attr.aria-label]="'Открыть '+project.name">
    <div class="card-preview">@if(project.contours.length||project.points.length){<svg viewBox="0 0 260 130" aria-label="Превью контуров">
    @for(shape of preview(project);track $index){<polyline [attr.points]="shape.points" [attr.fill]="shape.closed?'#e7f4ec':'none'" stroke="#139768" stroke-width="1.5" stroke-linejoin="round" />}
    </svg>}@else{<svg lucideScanLine [size]="32" [strokeWidth]="1" class="empty-preview"></svg>}</div><div class="card-name">{{project.name}}</div>
  </button>
}
</div>@if(store.warning()){<p class="storage-warning" role="status">{{store.warning()}}</p>}</main>`})
export class ProjectManager {
  readonly store=inject(ProjectsStore);private readonly router=inject(Router);
  create():void{this.open(this.store.create().id);}open(id:string):void{void this.router.navigate(['/project',id]);}
  preview(project:Project):{points:string;closed:boolean}[]{
    const shapes=[...project.contours.map(c=>({points:c.points,closed:true})),...(project.points.length?[{points:project.points,closed:false}]:[])];
    const ps=shapes.flatMap(s=>s.points);if(!ps.length)return [];
    const minX=Math.min(...ps.map(p=>p.x)),maxX=Math.max(...ps.map(p=>p.x)),minY=Math.min(...ps.map(p=>p.y)),maxY=Math.max(...ps.map(p=>p.y));const w=maxX-minX,h=maxY-minY,k=Math.min(220/Math.max(w,1),104/Math.max(h,1));
    return shapes.map(s=>({closed:s.closed,points:[...s.points,...(s.closed?[s.points[0]]:[])].map(q=>`${(q.x-minX)*k+(260-w*k)/2},${130-((q.y-minY)*k+(130-h*k)/2)}`).join(' ')}));
  }
}
