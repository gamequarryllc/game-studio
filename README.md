# Game Studio

Mobile games Claude builds, playtests and polishes for Game Quarry, one loop at a time.

**Play them:** https://gamequarryllc.github.io/game-studio/ (open on your phone, tap Play, turn the phone sideways)

| | |
|---|---|
| `queue.json` | Every game, in build order, with its status |
| `STUDIO.md` | How the loop works, the polish bar, the owner's feedback log |
| `games/<slug>/` | One Godot project per game (4.4.1, or the version in its `godot_version.txt`), with its own `NOTES.md` |
| `.github/workflows/web.yml` | Builds every game for the web on each push to `main` and publishes them to GitHub Pages |
| `tools/build_site.py` | Makes the play-links page and `status.json` |
| `site/`, `tools/site_pages.py` | The privacy policy and support pages every App Store listing links to |
| `store/<slug>/` | Each game's App Store listing and build settings (`store/README.md` has the owner's steps) |

## Run a game on a computer

1. Download **Godot (Standard)** from https://godotengine.org/download: 4.4.x, or the version in the game's `godot_version.txt` when it has one.
2. Open Godot, click **Import**, pick `games/<slug>/project.godot`.
3. Press **F5**.

## Feedback

Tell Claude in the studio conversation ("forest: fire spreads too slowly"). Feedback goes to the top of the queue.
