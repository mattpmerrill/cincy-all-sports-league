# integrations

One adapter per outside vendor (today: `espn/`). Handles timeouts, bounded retries and schema validation, and returns domain types so vendor shapes never leak. Only `features` may import from here.
