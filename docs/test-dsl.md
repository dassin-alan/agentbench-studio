# Test DSL

Every test case links to one requirement and contains ordered, validated steps. Supported actions are `goto`, `click`, `fill`, `press`, `waitFor`, `expectVisible`, `expectHidden`, `expectText`, `expectUrl`, `expectCount`, `screenshot` and `wait`.

```json
[
  { "action": "goto", "path": "/" },
  { "action": "fill", "selector": "[data-testid=search]", "value": "Cursor" },
  { "action": "expectCount", "selector": "[data-testid=tool-card]", "count": 1 },
  { "action": "screenshot", "name": "search-result", "fullPage": true }
]
```

Selectors are passed to Playwright as selectors. Values are data only. JavaScript and shell execution are intentionally unsupported.
