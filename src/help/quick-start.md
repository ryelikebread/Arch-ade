# Quick start

1. **Open a folder** with the folder button (or a shortcut like Downloads). Arch-ade only ever touches files inside folders you open or pick as a destination.
2. **Browse.** Click a column header to sort. Use the filters to narrow by kind, source, size and age. Arrow keys move through files; the preview updates as you go.
3. **Select** with click, Shift-click (range) and Cmd/Ctrl-click (add or remove).
4. **Change things** with Rename, Move or Trash. Every change is shown as a plan first.
5. **Dry run** is on when you start. Plans are shown but nothing is changed. Turn it off in the header when you're happy with what you see.
6. **Undo / Redo** work across everything you applied, even after restarting the app. History shows the full list.

## Rename patterns

| Token | Means |
| --- | --- |
| `{n}` | Sequence number (follows the table order) |
| `{n:03}` | Number padded to 3 digits: 001, 002, … |
| `{date}` | File date as 2026-03-09 |
| `{date:%Y%m%d}` | Custom date format (strftime) |
| `{original}` | Original name without extension |
| `{ext}` | Original extension |

If the pattern has no `{ext}`, the extension is kept. Use `{{` and `}}` for literal braces.
