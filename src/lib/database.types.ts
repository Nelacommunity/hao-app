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
          nationality: string | null;
          home_city: string | null;
          university: string | null;
          city: string | null;
          share_visits: boolean;
          traveller_type: 'student' | 'tourist' | null;
          is_admin: boolean;
          loves: string[];
          wants: string[];
          experiences: string[];
          twin_completed_at: string | null;
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
          nationality?: string | null;
          home_city?: string | null;
          university?: string | null;
          city?: string | null;
          share_visits?: boolean;
          traveller_type?: 'student' | 'tourist' | null;
          is_admin?: boolean;
          loves?: string[];
          wants?: string[];
          experiences?: string[];
          twin_completed_at?: string | null;
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
          nationality?: string | null;
          home_city?: string | null;
          university?: string | null;
          city?: string | null;
          share_visits?: boolean;
          traveller_type?: 'student' | 'tourist' | null;
          is_admin?: boolean;
          loves?: string[];
          wants?: string[];
          experiences?: string[];
          twin_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      places: {
        Row: {
          id: string;
          amap_poi_id: string | null;
          name: string;
          name_zh: string;
          category: string;
          lat: number;
          lng: number;
          address: string;
          tags: string[];
          amap_rating: number | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          amap_poi_id?: string | null;
          name: string;
          name_zh?: string;
          category: string;
          lat: number;
          lng: number;
          address?: string;
          tags?: string[];
          amap_rating?: number | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          amap_poi_id?: string | null;
          name?: string;
          name_zh?: string;
          category?: string;
          lat?: number;
          lng?: number;
          address?: string;
          tags?: string[];
          amap_rating?: number | null;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      visits: {
        Row: {
          id: string;
          user_id: string;
          place_id: string;
          visited_at: string;
          source: string;
          status: string;
          rating: number | null;
          tags: string[];
          note: string | null;
          photo_path: string | null;
          prompted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          place_id: string;
          visited_at?: string;
          source: string;
          status?: string;
          rating?: number | null;
          tags?: string[];
          note?: string | null;
          photo_path?: string | null;
          prompted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          place_id?: string;
          visited_at?: string;
          source?: string;
          status?: string;
          rating?: number | null;
          tags?: string[];
          note?: string | null;
          photo_path?: string | null;
          prompted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visits_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
        ];
      };
      place_country_stats: {
        Row: {
          place_id: string;
          nationality: string;
          visitor_count: number;
          like_count: number;
          dislike_count: number;
          updated_at: string;
        };
        Insert: {
          place_id?: string;
          nationality?: string;
          visitor_count?: number;
          like_count?: number;
          dislike_count?: number;
          updated_at?: string;
        };
        Update: {
          place_id?: string;
          nationality?: string;
          visitor_count?: number;
          like_count?: number;
          dislike_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'place_country_stats_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
        ];
      };
      region_stats: {
        Row: {
          place_id: string;
          region: string;
          visitor_count: number;
          like_count: number;
          dislike_count: number;
          updated_at: string;
        };
        Insert: {
          place_id?: string;
          region?: string;
          visitor_count?: number;
          like_count?: number;
          dislike_count?: number;
          updated_at?: string;
        };
        Update: {
          place_id?: string;
          region?: string;
          visitor_count?: number;
          like_count?: number;
          dislike_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'region_stats_place_id_fkey';
            columns: ['place_id'];
            isOneToOne: false;
            referencedRelation: 'places';
            referencedColumns: ['id'];
          },
        ];
      };
      country_groups: {
        Row: { nationality: string; region: string };
        Insert: { nationality: string; region: string };
        Update: { nationality?: string; region?: string };
        Relationships: [];
      };
      seeded_likes: {
        Row: { place_id: string; nationality: string; likes: number; created_at: string };
        Insert: { place_id: string; nationality: string; likes: number; created_at?: string };
        Update: { place_id?: string; nationality?: string; likes?: number; created_at?: string };
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
      chats: {
        Row: {
          id: string;
          user_id: string;
          mode: string;
          title: string;
          data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          mode: string;
          title?: string;
          data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          mode?: string;
          title?: string;
          data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      place_cache: {
        Row: {
          id: string;
          place: Json;
          fetched_at: string;
        };
        Insert: {
          id: string;
          place: Json;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          place?: Json;
          fetched_at?: string;
        };
        Relationships: [];
      };
      place_translations: {
        Row: {
          place_id: string;
          lang: string;
          name: string;
          address: string;
          type: string;
          tags: string[];
          source_name: string;
          updated_at: string;
        };
        Insert: {
          place_id: string;
          lang: string;
          name: string;
          address: string;
          type: string;
          tags?: string[];
          source_name: string;
          updated_at?: string;
        };
        Update: {
          place_id?: string;
          lang?: string;
          name?: string;
          address?: string;
          type?: string;
          tags?: string[];
          source_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      place_search_cache: {
        Row: {
          key: string;
          ids: string[];
          fetched_at: string;
        };
        Insert: {
          key: string;
          ids: string[];
          fetched_at?: string;
        };
        Update: {
          key?: string;
          ids?: string[];
          fetched_at?: string;
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
      stories: {
        Row: {
          id: string;
          type: string;
          city: string | null;
          nationality: string | null;
          audience: 'student' | 'tourist' | 'all';
          language: string;
          title: string;
          slides: Json;
          action: Json;
          place_id: string | null;
          topics: string[];
          sources: Json;
          status: 'draft' | 'approved' | 'rejected' | 'expired';
          valid_from: string;
          valid_until: string | null;
          generated_by_model: string;
          attribution: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          city?: string | null;
          nationality?: string | null;
          audience?: 'student' | 'tourist' | 'all';
          language?: string;
          title: string;
          slides: Json;
          action: Json;
          place_id?: string | null;
          topics?: string[];
          sources?: Json;
          status?: 'draft' | 'approved' | 'rejected' | 'expired';
          valid_from?: string;
          valid_until?: string | null;
          generated_by_model?: string;
          attribution?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          city?: string | null;
          nationality?: string | null;
          audience?: 'student' | 'tourist' | 'all';
          language?: string;
          title?: string;
          slides?: Json;
          action?: Json;
          place_id?: string | null;
          topics?: string[];
          sources?: Json;
          status?: 'draft' | 'approved' | 'rejected' | 'expired';
          valid_from?: string;
          valid_until?: string | null;
          generated_by_model?: string;
          attribution?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      story_events: {
        Row: {
          id: number;
          user_id: string;
          story_id: string;
          event: 'view' | 'complete' | 'skip' | 'save' | 'action_tap' | 'ask_more' | 'hide';
          slide_index: number | null;
          dwell_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string;
          story_id: string;
          event: 'view' | 'complete' | 'skip' | 'save' | 'action_tap' | 'ask_more' | 'hide';
          slide_index?: number | null;
          dwell_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          story_id?: string;
          event?: 'view' | 'complete' | 'skip' | 'save' | 'action_tap' | 'ask_more' | 'hide';
          slide_index?: number | null;
          dwell_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      saved_stories: {
        Row: {
          user_id: string;
          story_id: string;
          saved_at: string;
        };
        Insert: {
          user_id?: string;
          story_id: string;
          saved_at?: string;
        };
        Update: {
          user_id?: string;
          story_id?: string;
          saved_at?: string;
        };
        Relationships: [];
      };
      discover_likes: {
        Row: {
          user_id: string;
          item_key: string;
          created_at: string;
        };
        Insert: {
          user_id?: string;
          item_key: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          item_key?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      muted_story_topics: {
        Row: {
          user_id: string;
          topic: string;
          created_at: string;
        };
        Insert: {
          user_id?: string;
          topic: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          topic?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      story_topics: {
        Row: {
          id: string;
          category: string;
          label: string;
          enabled: boolean;
          wikipedia: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          category: string;
          label: string;
          enabled?: boolean;
          wikipedia?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          category?: string;
          label?: string;
          enabled?: boolean;
          wikipedia?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      story_cities: {
        Row: {
          city: string;
          city_zh: string;
          adcode: string;
          lat: number;
          lng: number;
          languages: string[];
          enabled: boolean;
        };
        Insert: {
          city: string;
          city_zh: string;
          adcode: string;
          lat: number;
          lng: number;
          languages?: string[];
          enabled?: boolean;
        };
        Update: {
          city?: string;
          city_zh?: string;
          adcode?: string;
          lat?: number;
          lng?: number;
          languages?: string[];
          enabled?: boolean;
        };
        Relationships: [];
      };
      holidays: {
        Row: {
          id: string;
          starts_on: string;
          ends_on: string;
          name: string;
          name_zh: string;
          kind: 'public_holiday' | 'festival' | 'observance';
          about: string;
          closures: string;
          crowds: string;
        };
        Insert: {
          id: string;
          starts_on: string;
          ends_on: string;
          name: string;
          name_zh: string;
          kind: 'public_holiday' | 'festival' | 'observance';
          about: string;
          closures?: string;
          crowds?: string;
        };
        Update: {
          id?: string;
          starts_on?: string;
          ends_on?: string;
          name?: string;
          name_zh?: string;
          kind?: 'public_holiday' | 'festival' | 'observance';
          about?: string;
          closures?: string;
          crowds?: string;
        };
        Relationships: [];
      };
      story_generation_runs: {
        Row: {
          id: string;
          trigger: 'cron' | 'admin';
          started_at: string;
          finished_at: string | null;
          created_count: number;
          rejected_count: number;
          model_calls: number;
          stopped_reason: string | null;
          errors: Json;
        };
        Insert: {
          id?: string;
          trigger: 'cron' | 'admin';
          started_at?: string;
          finished_at?: string | null;
          created_count?: number;
          rejected_count?: number;
          model_calls?: number;
          stopped_reason?: string | null;
          errors?: Json;
        };
        Update: {
          id?: string;
          trigger?: 'cron' | 'admin';
          started_at?: string;
          finished_at?: string | null;
          created_count?: number;
          rejected_count?: number;
          model_calls?: number;
          stopped_reason?: string | null;
          errors?: Json;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      delete_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      discover_like_counts: { Args: { item_keys: string[] }; Returns: { item_key: string; likes: number }[] };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      confirm_visit: {
        Args: { visit_id: string; visit_rating?: number | null; visit_tags?: string[] };
        Returns: Database['public']['Tables']['visits']['Row'];
      };
      get_place_social_proof: {
        Args: { place_ids: string[]; nationality: string };
        Returns: { place_id: string; scope: string; region: string | null; visitor_count: number; like_count: number; dislike_count: number }[];
      };
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
