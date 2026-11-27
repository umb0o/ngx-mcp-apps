# Components

Nine small pieces that most MCP Apps need. They are not part of the npm package: copy the file you want into
your application and change it as you like.

- Each one is a single file with no dependency other than `ngx-mcp-apps` and Angular.
- They are compiled and used by [the example](example.html), so the code on this page is code that runs.
- They take their colours from the text colour around them (`currentColor`), so they follow your theme, light or
  dark, without a stylesheet.
- They work from Angular 18. From Angular 19 you can delete the line `standalone: true`: it is the default.

Put the files in a folder such as `src/app/mcp/` and import the class where you use it:

```ts
import { McpStatus } from './mcp/mcp-status';

@Component({
  imports: [McpStatus],
  template: `<mcp-status />`,
})
export class App {}
```

<!-- components -->
