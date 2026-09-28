# features

One folder per vertical slice (standings, fantasy-teams, sports, auth, claims, results-admin, sync): its components, server actions and service. Features may use `data`, `integrations`, `domain`, `ui` and `lib`, but never each other; `app/` composes them.
