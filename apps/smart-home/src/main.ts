import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { App } from './app/app';
import { routes } from './app/app.routes';
bootstrapApplication(App, { providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withHashLocation())] })
  .catch(error => console.error('Smart Home could not start', error));
