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

It needs `@angular/build` 22.3 or later, which an Angular 22 application already has.

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

When it is set, after each successful build the builder reads the built `index.html` and:

- replaces each local `<script src="…">` with an inline `<script>` holding the file content
  (`type="module"` is kept), escaping `</script` so the code cannot close the tag;
- replaces each local `<link rel="stylesheet" href="…">` with an inline `<style>`;
- removes `<link rel="modulepreload">`, preload and icon links that point to local files;
- leaves `http://` and `https://` URLs untouched.

The normal build output in `outputPath` is still written.

## Limitation: no lazy loading

One HTML file cannot fetch other chunks, so the application must end up in the scripts that
`index.html` loads directly. If the build emits other JavaScript files that those scripts need, the
build **fails** with an error that lists them, instead of writing a file that breaks at runtime.

Use static imports only: no `loadComponent` / `loadChildren`, no `@defer` blocks, no dynamic `import()`.

Images and fonts referenced from CSS or templates are not inlined either: embed them as `data:` URLs or
load them from an absolute `https://` URL.

## License

MIT
