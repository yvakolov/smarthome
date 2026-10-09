export interface Point { x:number; y:number; }
export interface Contour { id:string; name:string; color?:string; points:Point[]; }
export interface RectangleDraft { w:number; h:number; angle:number; sx:number; sy:number; stage:string; [key:string]:unknown; }
export interface Project {
  id:string; name:string; sequence:number; points:Point[]; contours:Contour[]; closed:false;
  draft:{points:Point[];tool:'graphical'|'rectangle';rect:RectangleDraft|null};
  units:'mm';updatedAt:string;settings?:{grid:boolean;snap:boolean;ortho:boolean;step:number;angleStep:number;mode:'mouse'|'trackpad'};
}
export interface ContourChanges { name?:string;color?:string;width?:number;height?:number;angle?:number; }
export type ContourCommand = 'delete'|'edit'|'move'|'duplicate'|'rotate';
export interface ContourMenuPosition { id:string;x:number;y:number; }
export interface EditorHandle { destroy():void; getProject():Project; isDirty():boolean; save():Promise<void>; updateContour(id:string,changes:ContourChanges):string|null; startOperation(command:ContourCommand,id?:string):void; clearSelection():void; getState():any; }
