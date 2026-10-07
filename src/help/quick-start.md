# Quick start

1. **Open a folder** with the folder button (or a shortcut like Downloads). Arch-ade only ever touches files inside folders you open or pick as a destination.
2. **Browse.** Click a column header to sort. Use the filters to narrow by kind, source, size and age. Arrow keys move through files; the preview updates as you go.
3. **Select** with click, Shift-click (range) and Cmd/Ctrl-click (add or remove).
4. **Change things** with Rename, Move or Trash. Every change is shown as a plan first.
5. **Dry run** is on when you start. Plans are shown but nothing is changed. Turn it off in the header when you're happy with what you see.
6. **Undo / Redo** work across everything you applied, even after restarting the app. History shows the full list.
7. **Rules** (Cmd/Ctrl+Shift+L) sort files for you. Add a template such as *Organize Downloads*, tick **On**, and use **Run on open folder** to see the plan. Tick **Auto** and watch a folder (like Downloads) to run rules on new files once they finish downloading. **Activity** lists everything rules did.
8. **Categorize** (Cmd/Ctrl+Shift+K) suggests a folder and a clean name for each selected file. Edit or untick suggestions, then **Review plan**. It works without AI (music/video tags, your past choices, and simple keyword rules); turn on the local AI in **Settings > Local AI and categories** for smarter suggestions.
9. **File by File** (Cmd/Ctrl+Shift+F) shows one file at a time. Press **K** keep, **M** move (or **1** to **9** for a quick folder), **R** rename, **T** trash, **→** skip, **←** back, **Cmd/Ctrl+Z** undo. Pick a **Skin** at the top for Volcano or Space animations.
10. **Sound** (Cmd/Ctrl+Shift+S) picks a music station, plays or pauses it, and mutes the music or the skins' sound effects separately. Put your own music files in the folder **My music folder > Show** opens.

## Rule paths

| Token | Means |
| --- | --- |
| `{home}`, `{downloads}`, `{desktop}`, `{documents}`, `{pictures}` | Your usual folders |
| `{kind}`, `{ext}` | The file's kind (Image, PDF, …) and extension |
| `{domain}`, `{app}` | Where it was downloaded from, and by which app |
| `{year}`, `{month}`, `{day}` | The file's modified date |

A plain name like `PDFs` means a folder inside the folder being organized.

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
