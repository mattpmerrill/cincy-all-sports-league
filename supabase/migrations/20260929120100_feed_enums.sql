-- Enums for the league feed. Reactions store names, not glyphs: the UI owns the emoji mapping, so
-- a font or design change never needs a data migration.

-- member: written by a team owner; league: automatic post written with the secret key.
create type public.message_kind as enum ('member', 'league');

create type public.reaction_emoji as enum ('fire', 'laugh', 'skull', 'clap', 'goat');
