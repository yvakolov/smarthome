import { Injectable, signal } from '@angular/core';
import { Project, Point } from './models';
const KEY='smart-home.projects.v1';
const copy=<T>(value:T):T=>structuredClone(value);
const points=(ps:unknown):ps is Point[]=>Array.isArray(ps)&&ps.length<=10000&&ps.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
export function decodeProjects(raw:string|null):Project[] {
  if(!raw)return [];
  const data=JSON.parse(raw);
  if(data?.format!=='smart-home'||data?.version!==1||!Array.isArray(data.projects))throw new Error('Unknown project format');
  if(!data.projects.every((p:any)=>p&&typeof p.id==='string'&&typeof p.name==='string'&&points(p.points)&&Array.isArray(p.contours)&&p.contours.length<=2000&&p.contours.every((c:any)=>c&&typeof c.id==='string'&&typeof c.name==='string'&&points(c.points)&&c.points.length>=3)))throw new Error('Invalid project geometry');
  return data.projects;
}
@Injectable({providedIn:'root'})
export class ProjectsStore {
  readonly warning=signal('');readonly projects=signal<Project[]>(this.load());
  private load():Project[] {try{return decodeProjects(localStorage.getItem(KEY));}catch{this.warning.set('Не удалось прочитать локальное хранилище. Сохранения не удалены.');return [];}}
  create():Project {
    const sequence=Math.max(0,...this.projects().map(p=>p.sequence||0))+1;
    const project:Project={id:crypto.randomUUID(),name:`Дом ${sequence}`,sequence,points:[],contours:[],closed:false,draft:{points:[],tool:'graphical',rect:null},units:'mm',updatedAt:new Date().toISOString()};
    this.remember(project);this.persist(project);return project;
  }
  get(id:string):Project|undefined {const p=this.projects().find(p=>p.id===id);return p?copy(p):undefined;}
  remember(project:Project):void {const all=this.projects();const at=all.findIndex(p=>p.id===project.id);this.projects.set(at<0?[...all,copy(project)]:all.map((p,i)=>i===at?copy(project):p));}
  persist(project:Project):boolean {
    this.remember(project);
    try {const disk=decodeProjects(localStorage.getItem(KEY));const saved=disk.filter(p=>p.id!==project.id).concat(copy(project));
      localStorage.setItem(KEY,JSON.stringify({format:'smart-home',version:1,projects:saved}));this.warning.set('');return true;
    }catch{this.warning.set('Локальное хранилище недоступно. Сохраните копию проекта в JSON.');return false;}
  }
}
