# ngx-mcp-apps-builder

An Angular CLI builder for [MCP Apps](https://github.com/umb0o/ngx-mcp-apps): user interfaces that run
inside an AI chat host and are delivered as **one self-contained HTML file**.

It runs Angular's official application builder (`@angular/build:application`), with the same options,
and then writes a single HTML file in which every local script and stylesheet of the built `index.html`
is inlined.

## Install

```bash
ng add ngx-mcp-apps-builder
```

It installs the builder as a dev dependency, adds the [ngx-mcp-apps](https://www.npmjs.com/package/ngx-mcp-apps)
library and switches the `build` target of your application to this builder.

| Option           |                                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| `--project`      | The application to set up. Needed only when the workspace has more than one. |
| `--single-file`  | Path of the HTML file. Default: `dist/<project>.html`.                       |
| `--skip-library` | Do not add `ngx-mcp-apps`.                                                   |

Or by hand:

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

`ng add` writes this for you. By hand: in `angular.json`, replace the builder of the `build` target and add the
`singleFile` option:

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

### Lazy loading is merged, web workers are not supported

One HTML file cannot fetch other chunks, and the Angular application builder always splits the code: a lazy
route (`loadComponent` / `loadChildren`), a `@defer` block or a dynamic `import()` becomes a separate file, and
the code shared with it becomes another. The builder puts them back together: it bundles the scripts of
`index.html` and every chunk they load into one module, with esbuild, the bundler Angular itself uses.

```text
Single file: 3 JavaScript chunks merged into the file (3 loaded on demand by lazy routes, @defer blocks or import()).
They are loaded with the app, not on demand: lazy loading still works, without its saving.
```

So an application written with lazy routes builds and runs as it is, and so does a dependency that loads part of
itself on demand (`provideAnimationsAsync()`, for example). What you do not get is what lazy loading is for: the
whole application is in the file and is loaded at once. If the file becomes too big, remove code, not `import()`.

A **web worker** (`new Worker(new URL(…, import.meta.url))`) is a separate script by nature and cannot be merged:
the build fails and names the file. Run that code in the page.

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
