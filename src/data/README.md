# data

Repositories, the only place database queries are built, plus the mappers that turn rows into domain types. Server-only, with one exception: a repository that only reads public rows or calls functions granted to `authenticated` (for example `pending-trades`, `profiles` reads) may be built from the browser client, and says so in its header.
