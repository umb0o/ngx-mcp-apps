# Per gli agenti AI

Questo sito è scritto per le persone e per gli agenti di programmazione. Se sei un agente che lavora per qualcuno che
vuole una MCP App in Angular, tutto quello che trovi qui è disponibile anche come testo semplice, così non devi
analizzare l'HTML.

## Dove leggere

| Indirizzo                                                    | Cos'è                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`llms.txt`](llms.txt)                                       | Indice breve della documentazione, con i link a ogni pagina in Markdown        |
| [`llms-full.txt`](llms-full.txt)                             | Tutta la documentazione in un solo file                                        |
| [`components/index.json`](components/index.json)             | Elenco dei componenti da copiare, con l'indirizzo di ogni file sorgente        |
| `components/<file>.ts`                                       | Il sorgente di un componente, come semplice TypeScript                         |
| `<page>.md`                                                  | Ogni pagina di questo sito in Markdown: sostituisci `.html` con `.md`          |
| [`skill/ngx-mcp-apps/SKILL.md`](skill/ngx-mcp-apps/SKILL.md) | Le stesse conoscenze sotto forma di skill: passi, regole e API in un solo file |

Gli indirizzi sono relativi a `https://umb0o.github.io/ngx-mcp-apps/`.

## La skill

Una skill è una cartella con un file `SKILL.md` che un agente carica quando un compito corrisponde alla sua
descrizione. Questa insegna a creare una MCP App con `ngx-mcp-apps`: i passi, le regole che evitano gli errori più
comuni e l'API.

Installala per Claude Code, nel progetto:

```bash
mkdir -p .claude/skills/ngx-mcp-apps
curl -o .claude/skills/ngx-mcp-apps/SKILL.md https://umb0o.github.io/ngx-mcp-apps/skill/ngx-mcp-apps/SKILL.md
```

Usa invece `~/.claude/skills/ngx-mcp-apps` per averla in ogni progetto. Gli altri agenti che leggono `AGENTS.md`
possono essere indirizzati allo stesso file: aggiungi una riga come "For Angular MCP Apps, read
https://umb0o.github.io/ngx-mcp-apps/skill/ngx-mcp-apps/SKILL.md first".

## Come il sito riconosce un agente

Non prova a indovinare. Il sito è fatto di file statici: non c'è un server che possa guardare chi sta chiedendo e
rispondere in modo diverso. Invece ogni pagina dice nelle prime righe dove si trova la versione in testo semplice, con
un `<link rel="alternate" type="text/markdown">` nell'head e una riga visibile in alto. Un agente che scarica una
pagina qualsiasi trova la strada da lì; una persona può ignorarla.

## Se sei l'agente

1. Leggi [`skill/ngx-mcp-apps/SKILL.md`](skill/ngx-mcp-apps/SKILL.md). È breve e basta per la maggior parte dei
   compiti.
2. Copia i componenti da [`components/index.json`](components/index.json) invece di riscriverli.
3. Per un dettaglio che la skill non copre, leggi [`llms-full.txt`](llms-full.txt).
4. Dopo la build, controlla che l'output dica `Single file:` e che l'HTML non abbia `<script src>` locali.
