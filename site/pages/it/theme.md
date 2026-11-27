# Tema

Una MCP App viene mostrata dentro una conversazione chiara o scura, e deve sembrarne parte. L'app ha tre riferimenti,
in quest'ordine: il tema indicato dall'host, le variabili di stile inviate dall'host e, quando l'host non dice nulla,
l'impostazione del sistema.

L'anteprima qui sotto è il pezzo da copiare [Tema dell'host](component-mcp-theme.html) in azione. Cambia il tema di
questa pagina con il pulsante nel menu: questa pagina è l'host, lo comunica all'app, e l'app si adegua. Il riquadro è
disegnato solo con variabili inviate dall'host.

<!-- preview: mcp-theme -->

## 1. Il tema dell'host

L'host mette il suo tema nell'host context. `mcp.theme()` è un signal con valore `'light'`, `'dark'` o `undefined`.
Il pezzo lo scrive sull'elemento `<html>` come `data-theme`, così un foglio di stile può usarlo:

```css
:root[data-theme='dark'] .card {
  border-color: #3a4a66;
}
```

## 2. Le variabili di stile dell'host

Un host può anche inviare variabili CSS con i propri colori e font, in `mcp.hostContext()?.styles?.variables`.
Claude per Android, per esempio, ne ha inviate 76 (protocollo 2026-01-26), come queste:

```css
--color-text-primary: light-dark(rgba(20, 20, 19, 1), rgba(250, 249, 245, 1));
--color-background-primary: light-dark(rgba(255, 255, 255, 1), rgba(48, 48, 46, 1));
```

I valori sono scritti con `light-dark()`, quindi ognuno contiene entrambi i colori e il browser ne sceglie uno in base
al `color-scheme` dell'elemento che lo usa. Il pezzo copia le variabili sull'elemento `<html>`. Usale con un
fallback, perché un altro host potrebbe inviare nomi diversi o nessuno:

```css
.card {
  color: var(--color-text-primary, light-dark(#16203a, #e6eaf5));
  border: 1px solid var(--color-border-primary, currentColor);
}
```

La libreria controlla che le variabili siano stringhe e le passa avanti. Non le applica: lo fa il pezzo, e puoi
leggerlo per vedere esattamente cosa viene scritto nella pagina.

## 3. L'impostazione del sistema

Fuori da un host, o con un host che non invia un tema, `mcp.theme()` vale `undefined`. Allora lascia scegliere al
browser: `color-scheme: light dark` segue l'impostazione del sistema, e i colori `light-dark()` la seguono di
conseguenza. Quando il codice ha bisogno di un sì o di un no, chiedi `matchMedia('(prefers-color-scheme: dark)').matches`.

## Imposta lo schema di colori sulla pagina, non su un componente

`color-scheme` va impostato sulla radice del documento dell'app, l'elemento `<html>`. Un browser dipinge un frame con
uno sfondo opaco quando lo schema di colori del frame è diverso da quello della pagina che lo contiene. Quindi se solo
un componente dice "dark", il documento resta chiaro, e in un host scuro il frame diventa bianco: il testo chiaro sopra
non si legge. È stato visto su un host reale, e impostarlo sulla radice ha risolto.

Per lo stesso motivo, non dare uno sfondo alla pagina. Lo disegna l'host, e un frame trasparente prende il colore della
conversazione.

```css
body {
  margin: 0;
  background: transparent;
}
```

## Il tema può cambiare mentre l'app è aperta

Quando l'utente cambia tema, l'host invia `ui/notifications/host-context-changed`. `mcp.theme()` e
`mcp.hostContext()` sono signal, quindi un `effect` che li legge viene rieseguito. Non serve altro: l'hai visto
succedere nell'anteprima qui sopra.

## Senza il pezzo

Se ti serve solo il tema, bastano due righe nel componente radice:

```ts
constructor() {
  const mcp = inject(McpApp);
  effect(() => (document.documentElement.style.colorScheme = mcp.theme() ?? 'light dark'));
}
```

Così ogni colore scritto con `light-dark()` segue l'host, e il sistema quando l'host tace. Il
[pezzo](component-mcp-theme.html) aggiunge `data-theme` e le variabili dell'host.
