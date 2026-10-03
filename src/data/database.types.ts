export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      banked_scores: {
        Row: {
          championships: number
          created_at: string
          fantasy_team_id: string
          free_agent_move_id: string | null
          id: string
          participant_id: string
          points: number
          postseason_points: number
          source: Database["public"]["Enums"]["banked_source"]
          sport_id: string
          trade_offer_id: string | null
        }
        Insert: {
          championships: number
          created_at?: string
          fantasy_team_id: string
          free_agent_move_id?: string | null
          id?: string
          participant_id: string
          points: number
          postseason_points: number
          source?: Database["public"]["Enums"]["banked_source"]
          sport_id: string
          trade_offer_id?: string | null
        }
        Update: {
          championships?: number
          created_at?: string
          fantasy_team_id?: string
          free_agent_move_id?: string | null
          id?: string
          participant_id?: string
          points?: number
          postseason_points?: number
          source?: Database["public"]["Enums"]["banked_source"]
          sport_id?: string
          trade_offer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banked_scores_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banked_scores_free_agent_move_id_fkey"
            columns: ["free_agent_move_id"]
            isOneToOne: false
            referencedRelation: "free_agent_moves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banked_scores_participant_id_sport_id_fkey"
            columns: ["participant_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "sport_id"]
          },
          {
            foreignKeyName: "banked_scores_trade_offer_id_fkey"
            columns: ["trade_offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_sends: {
        Row: {
          recipient_count: number
          sent_at: string
          status: string
          week_start: string
        }
        Insert: {
          recipient_count: number
          sent_at?: string
          status: string
          week_start: string
        }
        Update: {
          recipient_count?: number
          sent_at?: string
          status?: string
          week_start?: string
        }
        Relationships: []
      }
      fantasy_teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string | null
          season_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          season_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          season_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fantasy_teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fantasy_teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      free_agent_moves: {
        Row: {
          added_participant_id: string
          created_at: string
          created_by: string | null
          dropped_participant_id: string
          fantasy_team_id: string
          id: string
          season_id: string
          sport_id: string
        }
        Insert: {
          added_participant_id: string
          created_at?: string
          created_by?: string | null
          dropped_participant_id: string
          fantasy_team_id: string
          id?: string
          season_id: string
          sport_id: string
        }
        Update: {
          added_participant_id?: string
          created_at?: string
          created_by?: string | null
          dropped_participant_id?: string
          fantasy_team_id?: string
          id?: string
          season_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "free_agent_moves_added_fkey"
            columns: ["added_participant_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "sport_id"]
          },
          {
            foreignKeyName: "free_agent_moves_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_moves_dropped_fkey"
            columns: ["dropped_participant_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "sport_id"]
          },
          {
            foreignKeyName: "free_agent_moves_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_moves_team_fkey"
            columns: ["fantasy_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id", "season_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: Database["public"]["Enums"]["reaction_emoji"]
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: Database["public"]["Enums"]["reaction_emoji"]
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: Database["public"]["Enums"]["reaction_emoji"]
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          parent_id: string | null
          payload: Json
          season_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["message_kind"]
          parent_id?: string | null
          payload?: Json
          season_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          parent_id?: string | null
          payload?: Json
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_records: {
        Row: {
          created_at: string
          losses: number
          ot_losses: number
          participant_id: string
          season_id: string
          ties: number
          updated_at: string
          wins: number
        }
        Insert: {
          created_at?: string
          losses?: number
          ot_losses?: number
          participant_id: string
          season_id: string
          ties?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          created_at?: string
          losses?: number
          ot_losses?: number
          participant_id?: string
          season_id?: string
          ties?: number
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "participant_records_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_records_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_results: {
        Row: {
          created_at: string
          event_label: string
          id: string
          is_locked: boolean
          participant_id: string
          quantity: number
          scoring_rule_id: string
          season_id: string
          source: Database["public"]["Enums"]["result_source"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          event_label?: string
          id?: string
          is_locked?: boolean
          participant_id: string
          quantity?: number
          scoring_rule_id: string
          season_id: string
          source?: Database["public"]["Enums"]["result_source"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          event_label?: string
          id?: string
          is_locked?: boolean
          participant_id?: string
          quantity?: number
          scoring_rule_id?: string
          season_id?: string
          source?: Database["public"]["Enums"]["result_source"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_results_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_results_scoring_rule_id_season_id_fkey"
            columns: ["scoring_rule_id", "season_id"]
            isOneToOne: false
            referencedRelation: "scoring_rules"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "participant_results_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          created_at: string
          espn_id: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          short_name: string
          sport_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          espn_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          short_name: string
          sport_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          espn_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          short_name?: string
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      picks: {
        Row: {
          acquired_at: string | null
          baseline_championships: number
          baseline_points: number
          baseline_postseason_points: number
          fantasy_team_id: string
          id: string
          participant_id: string
          sport_id: string
        }
        Insert: {
          acquired_at?: string | null
          baseline_championships?: number
          baseline_points?: number
          baseline_postseason_points?: number
          fantasy_team_id: string
          id?: string
          participant_id: string
          sport_id: string
        }
        Update: {
          acquired_at?: string | null
          baseline_championships?: number
          baseline_points?: number
          baseline_postseason_points?: number
          fantasy_team_id?: string
          id?: string
          participant_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picks_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_participant_id_sport_id_fkey"
            columns: ["participant_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "sport_id"]
          },
          {
            foreignKeyName: "picks_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          push_feed: boolean
          push_scores: boolean
          push_trades: boolean
          role: Database["public"]["Enums"]["user_role"]
          trade_emails: boolean
          updated_at: string
          weekly_email_opt_in: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          push_feed?: boolean
          push_scores?: boolean
          push_trades?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          trade_emails?: boolean
          updated_at?: string
          weekly_email_opt_in?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          push_feed?: boolean
          push_scores?: boolean
          push_trades?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          trade_emails?: boolean
          updated_at?: string
          weekly_email_opt_in?: boolean
        }
        Relationships: []
      }
      push_sends: {
        Row: {
          created_at: string
          dedupe_key: string
          recipient_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          recipient_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_sends_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string
          endpoint: string
          failure_count: number
          id: string
          last_registered_at: string
          last_success_at: string | null
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_registered_at?: string
          last_success_at?: string | null
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_registered_at?: string
          last_success_at?: string | null
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          code: string
          id: string
          is_championship: boolean
          kind: Database["public"]["Enums"]["scoring_rule_kind"]
          label: string
          points: number
          rank_from: number | null
          rank_to: number | null
          season_id: string
          sort_order: number
          sport_id: string
        }
        Insert: {
          code: string
          id?: string
          is_championship?: boolean
          kind: Database["public"]["Enums"]["scoring_rule_kind"]
          label: string
          points: number
          rank_from?: number | null
          rank_to?: number | null
          season_id: string
          sort_order?: number
          sport_id: string
        }
        Update: {
          code?: string
          id?: string
          is_championship?: boolean
          kind?: Database["public"]["Enums"]["scoring_rule_kind"]
          label?: string
          points?: number
          rank_from?: number | null
          rank_to?: number | null
          season_id?: string
          sort_order?: number
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_season_id_sport_id_fkey"
            columns: ["season_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "season_sports"
            referencedColumns: ["season_id", "sport_id"]
          },
        ]
      }
      season_sports: {
        Row: {
          ends_on: string | null
          espn_season: number
          major_points_cap: number | null
          season_id: string
          sport_id: string
          starts_on: string
        }
        Insert: {
          ends_on?: string | null
          espn_season: number
          major_points_cap?: number | null
          season_id: string
          sport_id: string
          starts_on: string
        }
        Update: {
          ends_on?: string | null
          espn_season?: number
          major_points_cap?: number | null
          season_id?: string
          sport_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_sports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_sports_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_active: boolean
          name: string
          playoff_scoring_mode: Database["public"]["Enums"]["playoff_scoring_mode"]
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_active?: boolean
          name: string
          playoff_scoring_mode?: Database["public"]["Enums"]["playoff_scoring_mode"]
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_active?: boolean
          name?: string
          playoff_scoring_mode?: Database["public"]["Enums"]["playoff_scoring_mode"]
          starts_on?: string
        }
        Relationships: []
      }
      sports: {
        Row: {
          allows_duplicate_picks: boolean
          code: string
          espn_league: string
          espn_sport: string
          id: string
          name: string
          participant_kind: Database["public"]["Enums"]["participant_kind"]
          sort_order: number
        }
        Insert: {
          allows_duplicate_picks?: boolean
          code: string
          espn_league: string
          espn_sport: string
          id?: string
          name: string
          participant_kind: Database["public"]["Enums"]["participant_kind"]
          sort_order?: number
        }
        Update: {
          allows_duplicate_picks?: boolean
          code?: string
          espn_league?: string
          espn_sport?: string
          id?: string
          name?: string
          participant_kind?: Database["public"]["Enums"]["participant_kind"]
          sort_order?: number
        }
        Relationships: []
      }
      standings_snapshots: {
        Row: {
          fantasy_team_id: string
          rank: number
          season_id: string
          snapshot_date: string
          total_points: number
        }
        Insert: {
          fantasy_team_id: string
          rank: number
          season_id: string
          snapshot_date: string
          total_points: number
        }
        Update: {
          fantasy_team_id?: string
          rank?: number
          season_id?: string
          snapshot_date?: string
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_snapshots_fantasy_team_id_season_id_fkey"
            columns: ["fantasy_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id", "season_id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          finished_at: string | null
          id: string
          sport_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          summary: Json
        }
        Insert: {
          finished_at?: string | null
          id?: string
          sport_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          summary?: Json
        }
        Update: {
          finished_at?: string | null
          id?: string
          sport_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      team_claims: {
        Row: {
          created_at: string
          fantasy_team_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fantasy_team_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fantasy_team_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_claims_fantasy_team_id_fkey"
            columns: ["fantasy_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_claims_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_listing_items: {
        Row: {
          listing_id: string
          participant_id: string
          sport_id: string
        }
        Insert: {
          listing_id: string
          participant_id: string
          sport_id: string
        }
        Update: {
          listing_id?: string
          participant_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_listing_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "trade_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_listing_items_participant_id_sport_id_fkey"
            columns: ["participant_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "sport_id"]
          },
        ]
      }
      trade_listings: {
        Row: {
          accepted_offer_id: string | null
          closes_at: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["trade_listing_kind"]
          owner_team_id: string
          resolved_at: string | null
          season_id: string
          status: Database["public"]["Enums"]["trade_listing_status"]
        }
        Insert: {
          accepted_offer_id?: string | null
          closes_at: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["trade_listing_kind"]
          owner_team_id: string
          resolved_at?: string | null
          season_id: string
          status?: Database["public"]["Enums"]["trade_listing_status"]
        }
        Update: {
          accepted_offer_id?: string | null
          closes_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["trade_listing_kind"]
          owner_team_id?: string
          resolved_at?: string | null
          season_id?: string
          status?: Database["public"]["Enums"]["trade_listing_status"]
        }
        Relationships: [
          {
            foreignKeyName: "trade_listings_accepted_offer_id_id_fkey"
            columns: ["accepted_offer_id", "id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id", "listing_id"]
          },
          {
            foreignKeyName: "trade_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_listings_owner_team_id_season_id_fkey"
            columns: ["owner_team_id", "season_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id", "season_id"]
          },
        ]
      }
      trade_offer_legs: {
        Row: {
          listing_id: string
          offer_id: string
          participant_id: string
          sport_id: string
        }
        Insert: {
          listing_id: string
          offer_id: string
          participant_id: string
          sport_id: string
        }
        Update: {
          listing_id?: string
          offer_id?: string
          participant_id?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_offer_legs_listing_id_sport_id_fkey"
            columns: ["listing_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "trade_listing_items"
            referencedColumns: ["listing_id", "sport_id"]
          },
          {
            foreignKeyName: "trade_offer_legs_offer_id_listing_id_fkey"
            columns: ["offer_id", "listing_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id", "listing_id"]
          },
          {
            foreignKeyName: "trade_offer_legs_participant_id_sport_id_fkey"
            columns: ["participant_id", "sport_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "sport_id"]
          },
        ]
      }
      trade_offers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          listing_id: string
          note: string | null
          offering_team_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["trade_offer_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          listing_id: string
          note?: string | null
          offering_team_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["trade_offer_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          listing_id?: string
          note?: string | null
          offering_team_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["trade_offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "trade_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_offering_team_id_fkey"
            columns: ["offering_team_id"]
            isOneToOne: false
            referencedRelation: "fantasy_teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_trade_offer: {
        Args: {
          p_actor: string
          p_offer_id: string
          p_post_body: string
          p_post_payload: Json
          p_scores: Json
        }
        Returns: undefined
      }
      approve_team_claim: { Args: { claim_id: string }; Returns: undefined }
      cancel_trade_listing: {
        Args: { p_actor: string; p_listing_id: string }
        Returns: undefined
      }
      create_trade_listing: {
        Args: {
          p_actor: string
          p_post_body: string
          p_post_payload: Json
          p_sport_codes: string[]
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      make_free_agent_move: {
        Args: {
          p_actor: string
          p_add_participant_id: string
          p_drop_participant_id: string
          p_post_body: string
          p_post_payload: Json
          p_scores: Json
          p_sport_code: string
        }
        Returns: string
      }
      make_trade_offer: {
        Args: {
          p_actor: string
          p_listing_id: string
          p_note: string
          p_post_body: string
          p_post_payload: Json
          p_sport_codes: string[]
        }
        Returns: string
      }
      owns_team: { Args: never; Returns: boolean }
      pending_trade_decisions: { Args: never; Returns: number }
      propose_direct_trade: {
        Args: {
          p_actor: string
          p_note: string
          p_post_body: string
          p_post_payload: Json
          p_sport_codes: string[]
          p_target_team_id: string
        }
        Returns: {
          listing_id: string
          offer_id: string
        }[]
      }
      push_targets: {
        Args: {
          p_topic: Database["public"]["Enums"]["push_topic"]
          p_user_ids: string[]
        }
        Returns: {
          auth: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }[]
      }
      record_push_failure: {
        Args: { p_id: string; p_max: number }
        Returns: string
      }
      register_push_subscription: {
        Args: {
          p_actor: string
          p_auth: string
          p_device_label: string
          p_endpoint: string
          p_p256dh: string
        }
        Returns: string
      }
      reject_team_claim: { Args: { claim_id: string }; Returns: undefined }
      reject_trade_offer: {
        Args: { p_actor: string; p_offer_id: string }
        Returns: undefined
      }
      trade_actor_team: {
        Args: { p_actor: string }
        Returns: {
          created_at: string
          id: string
          name: string
          owner_id: string | null
          season_id: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fantasy_teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trade_assert_unlisted: {
        Args: { p_participant_ids: string[]; p_team_id: string }
        Returns: undefined
      }
      trade_live_score: {
        Args: { p_participant_id: string; p_scores: Json }
        Returns: {
          championships: number
          points: number
          postseason_points: number
        }[]
      }
      trade_locked_picks: {
        Args: { p_sport_ids: string[]; p_team_ids: string[] }
        Returns: {
          acquired_at: string | null
          baseline_championships: number
          baseline_points: number
          baseline_postseason_points: number
          fantasy_team_id: string
          id: string
          participant_id: string
          sport_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "picks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      trade_post: {
        Args: {
          p_body: string
          p_listing_id: string
          p_payload: Json
          p_season_id: string
        }
        Returns: undefined
      }
      trade_resolve_sports: {
        Args: { p_sport_codes: string[] }
        Returns: string[]
      }
      withdraw_trade_offer: {
        Args: { p_actor: string; p_offer_id: string }
        Returns: undefined
      }
    }
    Enums: {
      banked_source: "trade" | "free_agent"
      claim_status: "pending" | "approved" | "rejected"
      message_kind: "member" | "league"
      participant_kind: "team" | "athlete"
      playoff_scoring_mode: "cumulative" | "highest_only"
      push_topic: "trades" | "feed" | "scores"
      reaction_emoji: "fire" | "laugh" | "skull" | "clap" | "goat"
      result_source: "espn" | "manual"
      scoring_rule_kind:
        | "per_win"
        | "per_tie"
        | "playoff_milestone"
        | "major_finish"
        | "final_rank_band"
      sync_status: "running" | "succeeded" | "failed" | "skipped"
      trade_listing_kind: "block" | "direct"
      trade_listing_status: "open" | "accepted" | "cancelled"
      trade_offer_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "withdrawn"
        | "void"
      user_role: "member" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      banked_source: ["trade", "free_agent"],
      claim_status: ["pending", "approved", "rejected"],
      message_kind: ["member", "league"],
      participant_kind: ["team", "athlete"],
      playoff_scoring_mode: ["cumulative", "highest_only"],
      push_topic: ["trades", "feed", "scores"],
      reaction_emoji: ["fire", "laugh", "skull", "clap", "goat"],
      result_source: ["espn", "manual"],
      scoring_rule_kind: [
        "per_win",
        "per_tie",
        "playoff_milestone",
        "major_finish",
        "final_rank_band",
      ],
      sync_status: ["running", "succeeded", "failed", "skipped"],
      trade_listing_kind: ["block", "direct"],
      trade_listing_status: ["open", "accepted", "cancelled"],
      trade_offer_status: [
        "pending",
        "accepted",
        "rejected",
        "withdrawn",
        "void",
      ],
      user_role: ["member", "admin"],
    },
  },
} as const

