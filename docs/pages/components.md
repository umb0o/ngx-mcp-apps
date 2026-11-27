# Components

Code to copy. These files are not part of the npm package: pick one, copy it into your application and change it
as you like. Each has no dependency other than `ngx-mcp-apps` and Angular, and is compiled and used on this site,
so what you copy is code that runs.

## Start from a whole app

One file that is the entire application, written for Angular 22. Its page runs it live. The chart of
[The example](example.html) is another whole app in one file.

<!-- list: one-file -->

## Or take the pieces

Nine small files, one job each, for when the app grows. They work from Angular 18 and take their colours from
the text around them, so they follow your theme without a stylesheet.

<!-- list: pieces -->

## How to use a piece

Put the file in a folder such as `src/app/mcp/` and import the class where you use it:

```ts
import { McpStatus } from './mcp/mcp-status';

@Component({
  imports: [McpStatus],
  template: `<mcp-status />`,
})
export class App {}
```

From Angular 19 you can delete the line `standalone: true` of a piece: it is the default.
