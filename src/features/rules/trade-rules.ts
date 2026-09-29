import { TRADE_WINDOW_HOURS } from "@/domain/trades";
import type { RuleNote } from "./tie-rules";

/** How trades work, in the same plain-language shape as the tie notes. The number comes from the domain. */
export const TRADE_NOTES: RuleNote[] = [
  {
    title: "Same sport, player for player",
    body: "A trade swaps one player for one player in the same sport. One trade can cover several sports at once.",
  },
  {
    title: "Two ways to trade",
    body: "Put your players on the trading block for everyone to see, or send a team a direct offer.",
  },
  {
    title: `${TRADE_WINDOW_HOURS} hours to decide`,
    body: `Offers stay open for ${TRADE_WINDOW_HOURS} hours, and any owner can make a competing offer. The owner can accept any offer at any time before it closes.`,
  },
  {
    title: "Earned points stay put",
    body: "Points a player already earned stay with the team that earned them. The new team only gets what the player scores after the trade.",
  },
  {
    title: "No trades after the season",
    body: "A sport can't be traded once its season is over.",
  },
];
