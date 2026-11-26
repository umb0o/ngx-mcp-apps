# ngx-mcp-apps-builder

An Angular CLI builder for [MCP Apps](https://github.com/umb0o/ngx-mcp-apps): user interfaces that run
inside an AI chat host and are delivered as **one self-contained HTML file**.

It runs Angular's official application builder (`@angular/build:application`), with the same options,
and then writes a single HTML file in which every local script and stylesheet of the built `index.html`
is inlined.

## Install

```bash
npm install -D ngx-mcp-apps-builder
```

## Compatibility

Angular 18, 19, 20, 21 and 22, the same versions as the `ngx-mcp-apps` library
(`@angular/build` `>=18.0.0 <23.0.0`, `@angular-devkit/architect` `>=0.1800.0 <0.2300.0`).

The builder needs the `@angular/build` package. An application created with Angular 20 or later already
has it; in an Angular 18 or 19 application it is installed together with `@angular-devkit/build-angular`.

In an Angular 18 or 19 application, name `@angular/build` with your major in the install command.
Otherwise npm tries to add the latest `@angular/build` for the peer dependency and stops with
`ERESOLVE` (seen with npm 12 on a new Angular 18 application):

```bash
npm install -D @angular/build@18 ngx-mcp-apps-builder
```

The list of accepted options is the one of the Angular 22 application builder. An option that was added
after your Angular version (for example `outputMode` on Angular 18) passes the validation, but your
version of `@angular/build` does not know it.

## Use

In `angular.json`, replace the builder of the `build` target and add the `singleFile` option:

```json
{
  "projects": {
    "my-app": {
      "architect": {
        "build": {
          "builder": "ngx-mcp-apps-builder:application",
          "options": {
            "browser": "src/main.ts",
            "tsConfig": "tsconfig.app.json",
            "styles": ["src/styles.css"],
            "singleFile": "public/app.html"
          }
        }
      }
    }
  }
}
```

Then build as usual:

```bash
ng build
```

```text
Single file: public/app.html (212.4 kB)
```

Every other option is the one documented for the
[application builder](https://angular.dev/reference/configs/workspace-config): they are validated and
passed through unchanged. `ng build --watch` rewrites the file after each rebuild.

## The `singleFile` option

`singleFile` is a path relative to the workspace root, for example `"public/app.html"`. Missing folders
are created. Without it the builder behaves exactly like the official one.

When it is set, critical CSS inlining (`optimization.styles.inlineCritical`) is turned off for the
build: in a single file every style is inline already, and the critical copy would embed the fonts and
images of the first screen twice. The rest of `optimization` is used as you wrote it.

The normal build output in `outputPath` is still written.

## What is inlined

After each successful build the builder reads the built `index.html` and:

- replaces each local `<script src="…">` with an inline `<script>` holding the file content
  (`type="module"` is kept, a classic script of the `scripts` option stays classic), escaping
  `</script` so the code cannot close the tag;
- replaces each local `<link rel="stylesheet" href="…">` with an inline `<style>`;
- replaces each local `url(…)` of the CSS with a `data:` URL that holds the file: the fonts of
  `@font-face`, background images, `url(…)` inside `image-set(…)`. This covers the global styles, the
  `<style>` elements of `index.html` and the component styles (which Angular keeps in the JavaScript).
  Paths are resolved from the folder of the stylesheet, and only files of the build output are read;
- removes `<link rel="modulepreload">`, preload and icon links that point to local files;
- leaves `http://`, `https://`, `//host`, `data:` and `#fragment` URLs untouched.

```text
Single file: public/app.html (2121.5 kB), with 40 font or image files embedded as data: URLs (800.9 kB before base64)
```

If a stylesheet references a local file that is not in the build output, the build **fails** and names
the file and the stylesheet.

### Size

Base64 makes an embedded file about one third larger, and every file that the CSS references is
embedded, whether the page uses it or not. A font package that lists many subsets and two formats per
font weighs a lot: an application with Angular Material, `material-icons` and two weights of
`@fontsource/roboto` went from 1.0 MB to 2.1 MB, for 40 font and image files of 0.8 MB. Import only
what you need (for example `@fontsource/roboto/latin-400.css` instead of `400.css`).

## Warnings

The build still succeeds, and the log lists what the single file does not contain:

- **Remote URLs** that the document loads: `<script src="https://…">`, `<link href="https://…">`,
  `url(https://…)` in CSS (also the font files that Angular's font inlining leaves on
  `fonts.gstatic.com`). They are not downloaded and not removed. Inside an MCP host they load only if
  the MCP server declares their domains in the CSP of the UI resource (`_meta.ui.csp.resourceDomains`);
  the warning ends with the list of domains.
- **Files of the build output that the application code names**, such as `logo.png` for
  `<img src="logo.png">` in a template with the file in `public/`. They are not embedded.
- **Local references of the static `index.html`** that are not inlined: `<img src>`, `<video>`,
  `<link rel="manifest">` and the like.

## Limitations

### No lazy loading, no other JavaScript file

One HTML file cannot fetch other chunks, so the application must end up in the scripts that
`index.html` loads directly. If the build emits other JavaScript files that those scripts need, the
build **fails** with an error that lists them by kind, instead of writing a file that breaks at runtime:

- files loaded with a dynamic `import()`: lazy loading. Use static imports only: no `loadComponent` /
  `loadChildren`, no `@defer` blocks, no dynamic `import()`. A dependency can be the cause as well:
  `provideAnimationsAsync()` loads the animations with a dynamic import;
- shared chunks that the initial scripts import statically. Angular creates them to hold the code used
  both by the initial scripts and by a lazy chunk, so they come together with the files above and go
  away with them. The application builder has no public option to turn code splitting off, and the
  builder does not try to merge chunks;
- web worker scripts (`new Worker(new URL(…, import.meta.url))`).

An application with one `browser` entry, `polyfills`, `scripts` and no dynamic import is built without
extra chunks.

### Images of templates are not embedded

Only `url(…)` in CSS is embedded. A file referenced from a template or from code (`<img src="logo.png">`,
`[src]="path"`, `fetch('data.json')`) stays outside of the single file and does not load. The builder
warns when the code contains the name of a file of the build output; it cannot see a path that is
computed at runtime. Show such an image with CSS (`background-image: url(…)`), embed it as a `data:`
URL, or load it from an `https://` URL that the MCP server declares.

### Other limits

- A path written in `image-set("a.png" 1x)` without `url(…)` is not embedded (Angular does not copy
  that file to the build output either).
- Inline `style="…"` attributes of `index.html` are not processed.
- A remote stylesheet or script is never downloaded into the file.

## License

MIT
