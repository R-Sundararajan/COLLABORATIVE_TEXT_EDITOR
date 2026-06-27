# Diagram Assets

This folder keeps editable Mermaid sources beside checked-in SVG renderings for Markdown viewers that do not execute Mermaid code fences. The root README embeds the SVG files, so its architecture and collaboration diagrams render without a VS Code extension.

| Source | Rendered asset | Used by |
| --- | --- | --- |
| `system-architecture.mmd` | `system-architecture.svg` | Root README system architecture |
| `collaboration-workflow.mmd` | `collaboration-workflow.svg` | Root README collaboration workflow |

Regenerate an asset with Mermaid CLI after changing its source:

```bash
npx @mermaid-js/mermaid-cli -i docs/diagrams/system-architecture.mmd -o docs/diagrams/system-architecture.svg -t neutral -b white -w 1200
npx @mermaid-js/mermaid-cli -i docs/diagrams/collaboration-workflow.mmd -o docs/diagrams/collaboration-workflow.svg -t neutral -b white -w 1200
```

The white background is intentional so labels remain readable in both light and dark Markdown previews.

Related: [project README](../../README.md), [engineering workflow](../../WORKFLOW.md).
