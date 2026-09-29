"use client";

import { Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { MoveSideEffects } from "@/domain/free-agents";
import type { ParticipantKind, SportCode } from "@/domain/sports/sports";
import { Button } from "@/ui/button";
import { FlashSlot } from "@/ui/flash-slot";
import { Input } from "@/ui/input";
import { EmptyState } from "@/ui/page";
import { PAGE_SIZE, filterByName } from "../search";
import type { FreeAgentRow, MyPickView } from "../free-agents.service";
import { FreeAgentListItem } from "./free-agent-row";
import type { MoveAction } from "./move-dialog";

/**
 * Every free agent in a sport, searchable by name. The server sends the whole pool (a few hundred
 * small rows at most), so searching is instant and "Show more" reveals rows without a request.
 * The list sits in a `FlashSlot` because a successful move removes its own row and dialog, and the
 * confirmation has to survive that.
 */
export function FreeAgentList({
  sport,
  sportName,
  kind,
  rows,
  dropped,
  sideEffects,
  action,
}: {
  sport: SportCode;
  sportName: string;
  kind: ParticipantKind;
  rows: FreeAgentRow[];
  /** The viewer's current pick in this sport; null when they cannot make a move. */
  dropped: MyPickView | null;
  sideEffects: MoveSideEffects;
  action: MoveAction;
}) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();

  const matches = filterByName(rows, query);
  const visible = matches.slice(0, shown);
  const noun = kind === "athlete" ? "player" : "team";
  const searching = query.trim() !== "";

  const move = dropped
    ? { sport, dropped, sideEffects, action, onMoved: () => searchRef.current?.focus() }
    : null;

  return (
    <FlashSlot>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={searchId} className="text-sm font-medium">
            Search {sportName} free agents
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              autoComplete="off"
              className="h-11 pl-9"
              onChange={(event) => {
                setQuery(event.target.value);
                setShown(PAGE_SIZE);
              }}
            />
          </div>
          <p aria-live="polite" className="text-sm text-text-muted">
            {matches.length === 1 ? "1 free agent" : `${matches.length} free agents`}
            {searching ? " match" : ""}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState title={`Every ${sportName} ${noun} is taken.`} />
        ) : matches.length === 0 ? (
          <EmptyState title={`No free agents match '${query.trim()}'.`} />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line/70 rounded-2xl border border-line bg-surface px-4">
              {visible.map((row) => (
                <FreeAgentListItem key={row.id} row={row} kind={kind} move={move} />
              ))}
            </ul>
            {matches.length > visible.length ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 self-center px-6"
                onClick={() => setShown((count) => count + PAGE_SIZE)}
              >
                Show more ({matches.length - visible.length} left)
              </Button>
            ) : null}
          </>
        )}
      </div>
    </FlashSlot>
  );
}
