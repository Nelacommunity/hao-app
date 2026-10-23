// Mirrors supabase/migrations. Regenerate with `npm run db:types` after changing the schema.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          language_code: string;
          language_name: string;
          preferences: Json;
          memory_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          language_code?: string;
          language_name?: string;
          preferences?: Json;
          memory_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          language_code?: string;
          language_name?: string;
          preferences?: Json;
          memory_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memories: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          content: string;
          source: string;
          happened_at: string;
          created_at: string;
          search: unknown;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kind: string;
          content: string;
          source?: string;
          happened_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          content?: string;
          source?: string;
          happened_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ui_translations: {
        Row: {
          lang: string;
          language_name: string;
          strings: Json;
          catalog_hash: string;
          updated_at: string;
        };
        Insert: {
          lang: string;
          language_name: string;
          strings?: Json;
          catalog_hash?: string;
          updated_at?: string;
        };
        Update: {
          lang?: string;
          language_name?: string;
          strings?: Json;
          catalog_hash?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_places: {
        Row: {
          user_id: string;
          place_id: string;
          created_at: string;
        };
        Insert: {
          user_id?: string;
          place_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          place_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      delete_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      search_memories: {
        Args: { q: string; max_results?: number };
        Returns: Database['public']['Tables']['memories']['Row'][];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
