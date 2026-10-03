-- Where a game stands. Mirrors GAME_STATUSES in src/domain/schedule/types.ts, which owns the list;
-- the ESPN adapter maps the vendor's states onto it.
--
-- scheduled: not started (including a start time still to be set). in_progress: being played now.
-- final: over, with a result. postponed: will be played later at a time not yet known; the vendor
-- usually moves the same event id to its new date. canceled: will not be played.
create type public.game_status as enum (
  'scheduled',
  'in_progress',
  'final',
  'postponed',
  'canceled'
);
