import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
const SESSION_KEY='smart-home.demo-session.v1';
@Injectable({providedIn:'root'})
export class AuthService {
  readonly authenticated=signal(this.readSession());
  private readSession():boolean {try{return sessionStorage.getItem(SESSION_KEY)==='juralab';}catch{return false;}}
  signIn(login:string,password:string):boolean {
    // Demo-only credentials requested for this static application, not a security boundary.
    if(login!=='juralab'||password!=='juralab')return false;
    this.authenticated.set(true);try{sessionStorage.setItem(SESSION_KEY,'juralab');}catch{/* Memory-only session. */}return true;
  }
  signOut():void {this.authenticated.set(false);try{sessionStorage.removeItem(SESSION_KEY);}catch{/* Already removed in memory. */}}
}
export const authGuard:CanActivateFn=(_,state)=>inject(AuthService).authenticated()||inject(Router).createUrlTree(['/auth/login'],{queryParams:{returnUrl:state.url}});
export const guestGuard:CanActivateFn=()=>!inject(AuthService).authenticated()||inject(Router).createUrlTree(['/projects']);
