# Game Studio

Mobile games Claude builds, playtests and polishes for Game Quarry, one loop at a time.

**Play them:** https://gamequarryllc.github.io/game-studio/ (open on your phone, tap Play, turn the phone sideways)

| | |
|---|---|
| `queue.json` | Every game, in build order, with its status |
| `STUDIO.md` | How the loop works, the polish bar, Alex's feedback log |
| `games/<slug>/` | One Godot 4.4 project per game, with its own `NOTES.md` |
| `.github/workflows/web.yml` | Builds every game for the web on each push to `main` and publishes them to GitHub Pages |
| `tools/build_site.py` | Makes the play-links page and `status.json` |

## Run a game on a computer

1. Download **Godot 4.4.x (Standard)** from https://godotengine.org/download.
2. Open Godot, click **Import**, pick `games/<slug>/project.godot`.
3. Press **F5**.

## Feedback

Tell Claude in the studio conversation ("forest: fire spreads too slowly"). Feedback goes to the top of the queue.
