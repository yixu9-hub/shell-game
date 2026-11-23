# Shell Game: Find the Ball

A small 3D browser shell game built with Three.js and Vite. It includes five increasingly difficult levels, stable cup identities, sequential random swaps, and a click-based guessing phase.

## Requirements

- Node.js 18 or newer
- A modern browser with WebGL enabled

## Install

```powershell
npm install
```

## Run

```powershell
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

For a production build:

```powershell
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings** > **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push any commit to `main` to run `.github/workflows/deploy.yml`.
5. Open the website URL shown by the `github-pages` deployment environment.

The included Vite configuration uses relative asset paths, so the game can also work from a repository subpath such as `https://username.github.io/repository-name/`.

## Play

1. Click **Start**.
2. Watch the cup lift to reveal the red ball.
3. Watch the cups exchange positions.
4. Click the cup where you think the ball is located.
5. A correct guess adds 100 points and enables **Next Level**.
6. An incorrect guess does not add points and enables **Retry Level** for the current level.
7. Complete all five levels to reach the victory screen.

Use **Restart** at any time to return to Level 1 with a score of 0.

## Levels

| Level | Cups | Swaps | Simultaneous pairs | Duration per swap |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | 3 | 1 | 1.2 seconds |
| 2 | 3 | 5 | 1 | 0.9 seconds |
| 3 | 5 | 7 | 1 | 0.7 seconds |
| 4 | 5 | 9 | 2 | 0.55 seconds |
| 5 | 6 | 12 | 3 | 0.4 seconds |

## Architecture

The application uses one Three.js scene, a fixed elevated camera, Raycaster pointer detection, and a game-state machine. Each cup retains a stable ID and is never recreated. A cup's current array position is separate from its identity, and the ball is logically associated with the same cup ID throughout every swap. Swap animations run sequentially with requestAnimationFrame, and pointer guesses are accepted only in the GUESSING state.
