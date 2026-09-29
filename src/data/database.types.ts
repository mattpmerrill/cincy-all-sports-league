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
          fantasy_team_id: string
          id: string
          participant_id: string
          sport_id: string
        }
        Insert: {
          fantasy_team_id: string
          id?: string
          participant_id: string
          sport_id: string
        }
        Update: {
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
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          weekly_email_opt_in: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          weekly_email_opt_in?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          weekly_email_opt_in?: boolean
        }
        Relationships: []
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
          espn_season: number
          major_points_cap: number | null
          season_id: string
          sport_id: string
          starts_on: string
        }
        Insert: {
          espn_season: number
          major_points_cap?: number | null
          season_id: string
          sport_id: string
          starts_on: string
        }
        Update: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_team_claim: { Args: { claim_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      owns_team: { Args: never; Returns: boolean }
      reject_team_claim: { Args: { claim_id: string }; Returns: undefined }
    }
    Enums: {
      claim_status: "pending" | "approved" | "rejected"
      message_kind: "member" | "league"
      participant_kind: "team" | "athlete"
      playoff_scoring_mode: "cumulative" | "highest_only"
      reaction_emoji: "fire" | "laugh" | "skull" | "clap" | "goat"
      result_source: "espn" | "manual"
      scoring_rule_kind:
        | "per_win"
        | "per_tie"
        | "playoff_milestone"
        | "major_finish"
        | "final_rank_band"
      sync_status: "running" | "succeeded" | "failed" | "skipped"
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
      claim_status: ["pending", "approved", "rejected"],
      message_kind: ["member", "league"],
      participant_kind: ["team", "athlete"],
      playoff_scoring_mode: ["cumulative", "highest_only"],
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
      user_role: ["member", "admin"],
    },
  },
} as const

