-- Facts about participants (wins, milestones reached, finishes, ranks). Points are never stored;
-- the domain layer computes them from these rows plus scoring_rules.

create table public.participant_results (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  participant_id uuid not null references public.participants (id) on delete cascade,
  scoring_rule_id uuid not null,
  -- Wins/ties: the count. Milestones and finishes: 1. Rank bands: the actual rank.
  quantity numeric(7, 2) not null default 1 check (quantity >= 0),
  -- Empty except for major_finish rows ("US Open"); not null so the unique key below works.
  event_label text not null default '',
  source public.result_source not null default 'espn',
  -- A locked manual override that sync must not overwrite.
  is_locked boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The natural key sync upserts against, which keeps sync idempotent.
  unique (season_id, participant_id, scoring_rule_id, event_label),
  foreign key (scoring_rule_id, season_id)
    references public.scoring_rules (id, season_id) on delete cascade
);

create index participant_results_participant_id_idx on public.participant_results (participant_id);
create index participant_results_scoring_rule_id_idx on public.participant_results (scoring_rule_id);

-- Cross-table rules a CHECK cannot express, plus provenance for human edits.
create function public.enforce_result_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rule public.scoring_rules;
  participant_sport uuid;
begin
  select * into rule from public.scoring_rules where id = new.scoring_rule_id;
  select sport_id into participant_sport from public.participants where id = new.participant_id;

  if rule.sport_id is distinct from participant_sport then
    raise exception 'rule and participant belong to different sports'
      using errcode = 'check_violation';
  end if;
  if rule.kind = 'playoff_milestone' and new.quantity <> 1 then
    raise exception 'a playoff milestone is reached once (quantity 1)'
      using errcode = 'check_violation';
  end if;
  if rule.kind = 'major_finish' and new.event_label = '' then
    raise exception 'a major finish needs an event_label'
      using errcode = 'check_violation';
  end if;
  if rule.kind = 'final_rank_band' and new.quantity < 1 then
    raise exception 'a final rank is at least 1' using errcode = 'check_violation';
  end if;

  -- Anything written through a user session (not the service key) is an admin edit.
  if (select auth.uid()) is not null then
    new.source := 'manual';
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger participant_results_enforce_consistency
  before insert or update on public.participant_results
  for each row execute function public.enforce_result_consistency();

create trigger participant_results_set_updated_at
  before update on public.participant_results
  for each row execute function public.set_updated_at();
