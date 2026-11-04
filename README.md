# FtF-mod

A [FeedTheFamily](https://feedthefamily.app) pane for Claude Code. It sits beside the chat and shows:

- **This week:** each day's dinners with their photos, your own star rating (press a star to change it) and how many meals are in the freezer.
- **Menu:** your family's dishes as cards grouped by cuisine, with ratings, price and dietary tags, and a search box.

Every dish links to its page in the app.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install FtF-mod --marketplace islandhopper81/FtF-mod
```

Answer `y` to add the marketplace, then pick a scope (the user scope is first; press Enter).

From a shell:

```bash
claude plugin install FtF-mod --marketplace islandhopper81/FtF-mod
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `islandhopper81/FtF-mod`, then Add plugin.

## Set up

The pane reads these environment variables:

| Variable | Needed | What it is |
|---|---|---|
| `FTF_MCP_TOKEN` | Yes | Your MCP token, from the Integrations page in FeedTheFamily |
| `FTF_API_URL` | No | The FeedTheFamily server; `https://feedthefamily.app` when unset |
| `FTF_APP_URL` | No | Where the pane's links open; the server's address when unset (`http://localhost:3001` opens `http://localhost:3000`) |
| `FTF_TIMEZONE` | No | Your time zone, such as `America/New_York`, for which day is today |

Set them where Claude Code can read them (your user environment variables, or the `env` block of `~/.claude/settings.json`), then fully quit Claude and reopen it.

## Use

Run `/this-week` to open the pane. Press **w** for This week, **m** for Menu, and **Refresh** to load again.

Photos in the week view and the stars you have already given need a FeedTheFamily server recent enough to have them; with an older one the week shows dish names and the stars start empty.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

## License

MIT, see [LICENSE](LICENSE). The FeedTheFamily name and logo are not covered by it.
