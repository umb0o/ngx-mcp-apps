// Entry point that loads the application lazily: the single-file build must refuse it.
import { bootstrapApplication } from '@angular/platform-browser';

import('./app').then(({ App }) => bootstrapApplication(App)).catch((error) => console.error(error));
