# Il builder

Un builder dell'Angular CLI per le [MCP Apps](https://umb0o.github.io/ngx-mcp-apps/): costruisce un'applicazione
Angular in **un unico file HTML autosufficiente**, la forma che un host di chat carica.

Esegue il builder ufficiale delle applicazioni Angular (`@angular/build:application`), con le stesse opzioni, e poi
scrive un unico file HTML in cui ogni script e foglio di stile locale dell'`index.html` costruito è inserito inline.
Documentazione dell'intero progetto, con esempi dal vivo:
[umb0o.github.io/ngx-mcp-apps](https://umb0o.github.io/ngx-mcp-apps/).

## Installazione

```bash
ng add ngx-mcp-apps-builder
```

Installa il builder come dev dependency, aggiunge la libreria [ngx-mcp-apps](https://www.npmjs.com/package/ngx-mcp-apps)
e fa usare questo builder al target `build` della tua applicazione.

| Opzione          |                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------- |
| `--project`      | L'applicazione da configurare. Serve solo quando il workspace ne contiene più di una. |
| `--single-file`  | Percorso del file HTML. Predefinito: `dist/<project>.html`.                           |
| `--skip-library` | Non aggiunge `ngx-mcp-apps`.                                                          |

Oppure a mano:

```bash
npm install -D ngx-mcp-apps-builder
```

## Uso

`ng add` lo scrive per te. A mano: in `angular.json`, sostituisci il builder del target `build` e aggiungi
l'opzione `singleFile`:

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

Poi fai la build come al solito:

```bash
ng build
```

```text
Single file: public/app.html (212.4 kB)
```

Tutte le altre opzioni sono quelle documentate per
l'[application builder](https://angular.dev/reference/configs/workspace-config): vengono validate e passate così come
sono. `ng build --watch` riscrive il file dopo ogni nuova build.

## L'opzione `singleFile`

`singleFile` è un percorso relativo alla radice del workspace, per esempio `"public/app.html"`. Le cartelle mancanti
vengono create. Senza questa opzione il builder si comporta esattamente come quello ufficiale.

Quando è impostata, l'inlining del CSS critico (`optimization.styles.inlineCritical`) viene disattivato per la
build: in un file unico ogni stile è già inline, e la copia critica incorporerebbe due volte i font e le immagini
della prima schermata. Il resto di `optimization` viene usato come l'hai scritto.

L'output normale della build in `outputPath` viene comunque scritto.

## Cosa viene unito e cosa fallisce

### Script, stili, font e immagini

Dopo ogni build riuscita il builder legge l'`index.html` costruito e:

- sostituisce ogni `<script src="…">` locale con uno `<script>` inline che contiene il file
  (`type="module"` resta, uno script classico dell'opzione `scripts` resta classico), facendo l'escape di
  `</script` così il codice non può chiudere il tag;
- sostituisce ogni `<link rel="stylesheet" href="…">` locale con uno `<style>` inline;
- sostituisce ogni `url(…)` locale del CSS con un URL `data:` che contiene il file: i font di `@font-face`, le
  immagini di sfondo, gli `url(…)` dentro `image-set(…)`. Questo vale per gli stili globali, gli elementi `<style>`
  di `index.html` e gli stili dei componenti (che Angular tiene nel JavaScript). I percorsi vengono risolti a partire
  dalla cartella del foglio di stile, e vengono letti solo i file dell'output della build;
- rimuove `<link rel="modulepreload">` e i link di preload e di icona che puntano a file locali;
- lascia invariati gli URL `http://`, `https://`, `//host`, `data:` e `#fragment`.

```text
Single file: public/app.html (2121.5 kB), with 40 font or image files embedded as data: URLs (800.9 kB before base64)
```

Se un foglio di stile fa riferimento a un file locale che non è nell'output della build, la build **fallisce** e
indica il file e il foglio di stile.

### Il lazy loading viene unito

Un unico file HTML non può scaricare altri chunk, e l'application builder di Angular divide sempre il codice: una
route lazy (`loadComponent` / `loadChildren`), un blocco `@defer` o un `import()` dinamico diventa un file separato,
e il codice condiviso con esso ne diventa un altro. Il builder li rimette insieme: unisce in un solo modulo gli script
di `index.html` e tutti i chunk che caricano, con esbuild, il bundler che usa Angular stesso.

```text
Single file: 3 JavaScript chunks merged into the file (3 loaded on demand by lazy routes, @defer blocks or import()).
They are loaded with the app, not on demand: lazy loading still works, without its saving.
```

Quindi un'applicazione scritta con route lazy fa la build e funziona così com'è, e lo stesso vale per una dipendenza
che carica una parte di sé su richiesta (`provideAnimationsAsync()`, per esempio). Quello che non ottieni è lo scopo
del lazy loading: l'intera applicazione è nel file e viene caricata tutta in una volta. Se il file diventa troppo
grande, togli codice, non `import()`.

Un **web worker** (`new Worker(new URL(…, import.meta.url))`) è per natura uno script separato e non può essere
unito: la build fallisce e indica il file. Esegui quel codice nella pagina.

### Dimensioni

Il base64 rende un file incorporato più grande di circa un terzo, e ogni file a cui fa riferimento il CSS viene
incorporato, che la pagina lo usi o no. Un pacchetto di font che elenca molti subset e due formati per ogni peso pesa
parecchio: un'applicazione con Angular Material, `material-icons` e due pesi di `@fontsource/roboto` è passata da
1,0 MB a 2,1 MB, per 40 file di font e immagini da 0,8 MB. Importa solo quello che ti serve (per esempio
`@fontsource/roboto/latin-400.css` invece di `400.css`).

### Avvisi

La build riesce comunque, e il log elenca ciò che il file unico non contiene:

- **URL remoti** che il documento carica: `<script src="https://…">`, `<link href="https://…">`,
  `url(https://…)` nel CSS (anche i file dei font che l'inlining dei font di Angular lascia su
  `fonts.gstatic.com`). Non vengono scaricati né rimossi. Dentro un host MCP si caricano solo se il server MCP
  dichiara i loro domini nella CSP della risorsa UI (`_meta.ui.csp.resourceDomains`); l'avviso finisce con l'elenco
  dei domini.
- **File dell'output della build nominati dal codice dell'applicazione**, come `logo.png` per
  `<img src="logo.png">` in un template con il file in `public/`. Non vengono incorporati.
- **Riferimenti locali dell'`index.html` statico** che non vengono inseriti inline: `<img src>`, `<video>`,
  `<link rel="manifest">` e simili.

## Compatibilità

Angular 18, 19, 20, 21 e 22, le stesse versioni della libreria `ngx-mcp-apps`
(`@angular/build` `>=18.0.0 <23.0.0`, `@angular-devkit/architect` `>=0.1800.0 <0.2300.0`).

Il builder ha bisogno del pacchetto `@angular/build`. Un'applicazione creata con Angular 20 o successivo lo ha già;
in un'applicazione Angular 18 o 19 viene installato insieme a `@angular-devkit/build-angular`.

In un'applicazione Angular 18 o 19, indica `@angular/build` con la tua major nel comando di installazione.
Altrimenti npm prova ad aggiungere l'ultima versione di `@angular/build` per la peer dependency e si ferma con
`ERESOLVE` (visto con npm 12 su una nuova applicazione Angular 18):

```bash
npm install -D @angular/build@18 ngx-mcp-apps-builder
```

L'elenco delle opzioni accettate è quello dell'application builder di Angular 22. Un'opzione aggiunta dopo la tua
versione di Angular (per esempio `outputMode` su Angular 18) supera la validazione, ma la tua versione di
`@angular/build` non la conosce.

**Host.** Provato con Claude: claude.ai sul web e l'app Claude per Android. La libreria segue la specifica MCP Apps (protocollo 2026-01-26), quindi altri host che la implementano dovrebbero funzionare, ma non sono stati provati.

## Limitazioni

### Le immagini dei template non vengono incorporate

Viene incorporato solo `url(…)` nel CSS. Un file a cui si fa riferimento da un template o dal codice
(`<img src="logo.png">`, `[src]="path"`, `fetch('data.json')`) resta fuori dal file unico e non si carica. Il
builder avvisa quando il codice contiene il nome di un file dell'output della build; non può vedere un percorso
calcolato a runtime. Mostra un'immagine del genere con il CSS (`background-image: url(…)`), incorporala come URL
`data:`, oppure caricala da un URL `https://` che il server MCP dichiara.

### Altri limiti

- Un percorso scritto in `image-set("a.png" 1x)` senza `url(…)` non viene incorporato (nemmeno Angular copia quel
  file nell'output della build).
- Gli attributi `style="…"` inline di `index.html` non vengono elaborati.
- Un foglio di stile o uno script remoto non viene mai scaricato dentro il file.

## Usare direttamente le funzioni

Il builder è fatto di semplici funzioni, esportate dal pacchetto, per un tuo script di build:

- `inlineHtml(html, { readFile, readBinaryFile?, outputFiles?, merged? })` restituisce il documento unico, con gli
  elenchi di ciò che è stato inserito inline, incorporato, lasciato remoto o solo segnalato con un avviso. Lancia
  `SingleFileError` quando il JavaScript ha ancora bisogno di un file che non è nel documento, o quando il CSS nomina
  un file locale mancante.
- `inlineCssUrls(css, cssPath, options)` incorpora gli `url(…)` di un foglio di stile come URL `data:`.
- `findSplit(html, { readFile, outputFiles })` dice di quali file JavaScript ha bisogno il documento senza caricarli
  direttamente, e di che tipo sono: lazy (`dynamic`), `shared` o `worker`.
- `bundleModules(directory, entries, minify)` unisce in un solo modulo gli script module e i chunk che caricano, con
  esbuild; passa il risultato a `inlineHtml` come `merged`.
- `writeSingleFile(options, context)` fa tutto questo su una build finita, come fa il builder.

## Licenza

MIT
