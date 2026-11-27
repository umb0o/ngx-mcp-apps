# Components

Code to copy: a whole MCP App in one file, then nine small pieces that most apps need. They are not part of the npm
package: copy the file you want into your application and change it as you like.

- Each one is a single file with no dependency other than `ngx-mcp-apps` and Angular.
- They are compiled and used by [the example](example.html), so the code on this page is code that runs.
- They take their colours from the text colour around them (`currentColor`), so they follow your theme, light or
  dark, without a stylesheet.
- The one-file app is written for Angular 22 and uses what is new there. The nine pieces work from Angular 18; from
  Angular 19 you can delete their line `standalone: true`, which is the default.

Put the files in a folder such as `src/app/mcp/` and import the class where you use it:

```ts
import { McpStatus } from './mcp/mcp-status';

@Component({
  imports: [McpStatus],
  template: `<mcp-status />`,
})
export class App {}
```

<!-- one-file -->

## The same things, as separate pieces

When the app grows, one file is no longer the right size. Each piece below does one of the things the file above
does, and can be dropped into any component.

<!-- components -->
