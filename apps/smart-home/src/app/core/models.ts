export interface Point { x:number; y:number; }
export interface Contour { id:string; name:string; points:Point[]; }
export interface RectangleDraft { w:number; h:number; angle:number; sx:number; sy:number; stage:string; [key:string]:unknown; }
export interface Project {
  id:string; name:string; sequence:number; points:Point[]; contours:Contour[]; closed:false;
  draft:{points:Point[];tool:'graphical'|'rectangle';rect:RectangleDraft|null};
  units:'mm';updatedAt:string;settings?:{grid:boolean;snap:boolean;ortho:boolean;step:number;angleStep:number;mode:'mouse'|'trackpad'};
}
export interface EditorHandle { destroy():void; getProject():Project; isDirty():boolean; save():void; getState():any; }
