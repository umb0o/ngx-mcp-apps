import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideMcpApp } from 'ngx-mcp-apps';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    // A short timeout: opened as a plain page, the example shows its standalone state quickly
    provideMcpApp({ name: 'ngx-mcp-apps-example', version: '1.0.0', connectTimeout: 1500 }),
  ],
}).catch((e) => console.error(e));
