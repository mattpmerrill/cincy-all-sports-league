# domain

Pure TypeScript: scoring rules, standings and tiebreakers, the sport catalog, the wording and ports for push alerts (`push/`), and weekly matchups (`matchups/`: pairing, scoring, the matchup table and the Monday rollover rules; bragging rights only, so scoring and standings never import it). Imports only other domain modules (no React, Next, Supabase or Node APIs) so every rule is unit-testable in isolation.
