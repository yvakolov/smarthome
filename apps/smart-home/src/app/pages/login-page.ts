import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideHouse, LucideArrowRight, LucideEye, LucideEyeOff } from '@lucide/angular';
import { AuthService } from '../core/auth';
import { HlmButton,HlmInput } from '../ui/primitives';
@Component({selector:'sh-login-page',imports:[ReactiveFormsModule,HlmButton,HlmInput,LucideHouse,LucideArrowRight,LucideEye,LucideEyeOff],changeDetection:ChangeDetectionStrategy.OnPush,template:`
<section class="login-card">
  <div class="login-brand"><svg lucideHouse [size]="30" [strokeWidth]="1.5"></svg><span>Smart Home</span></div>
  <h1>Ваше пространство для дома</h1><p class="login-description">Войдите, чтобы продолжить работу.</p>
  <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
    <label for="login">Логин</label><input hlmInput id="login" formControlName="login" autocomplete="username" autofocus autocapitalize="none" spellcheck="false" placeholder="Логин">
    <label for="password">Пароль</label><div class="password-field"><input hlmInput id="password" formControlName="password" [type]="showPassword()?'text':'password'" autocomplete="current-password" placeholder="Пароль"><button hlmBtn type="button" class="icon-button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword()?'Скрыть пароль':'Показать пароль'">@if(showPassword()){<svg lucideEyeOff [size]="18"></svg>}@else{<svg lucideEye [size]="18"></svg>}</button></div>
    @if(error()){<p class="auth-error" role="alert">{{error()}}</p>}
    <button hlmBtn class="login-submit" type="submit">Войти<svg lucideArrowRight [size]="18"></svg></button>
  </form><p class="demo-note">Демонстрационный доступ. Данные хранятся в вашем браузере.</p>
</section>`})
export class LoginPage {
  private readonly auth=inject(AuthService);private readonly router=inject(Router);private readonly route=inject(ActivatedRoute);
  readonly showPassword=signal(false);readonly error=signal('');
  readonly form=new FormGroup({login:new FormControl('',{nonNullable:true,validators:[Validators.required]}),password:new FormControl('',{nonNullable:true,validators:[Validators.required]})});
  submit():void {this.error.set('');const value=this.form.getRawValue();if(!this.auth.signIn(value.login,value.password)){this.error.set('Неверный логин или пароль.');return;}
    const url=this.route.snapshot.queryParamMap.get('returnUrl');void this.router.navigateByUrl(url?.startsWith('/')&&!url.startsWith('//')&&!url.startsWith('/auth')?url:'/projects');}
}
