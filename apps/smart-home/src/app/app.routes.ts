import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth';
export const routes: Routes = [
  { path:'auth', canActivate:[guestGuard], loadComponent:()=>import('./layouts/auth-layout').then(m=>m.AuthLayout), children:[
    {path:'',pathMatch:'full',redirectTo:'login'},
    {path:'login',title:'Вход — Smart Home',loadComponent:()=>import('./pages/login-page').then(m=>m.LoginPage)}
  ]},
  { path:'',canActivate:[authGuard],loadComponent:()=>import('./layouts/shell-layout').then(m=>m.ShellLayout),children:[
    {path:'',pathMatch:'full',redirectTo:'projects'},
    {path:'projects',title:'Smart Home',loadComponent:()=>import('./pages/project-manager').then(m=>m.ProjectManager)},
    {path:'project/:id',loadComponent:()=>import('./layouts/editor-layout').then(m=>m.EditorLayout)}
  ]},
  {path:'**',redirectTo:'projects'}
];
