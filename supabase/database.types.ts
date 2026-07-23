export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      feedback_submissions: {
        Row: {
          content: string;
          created_at: string;
          feedback_type: string;
          id: string;
          page_url: string | null;
          status: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          feedback_type: string;
          id?: string;
          page_url?: string | null;
          status?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          feedback_type?: string;
          id?: string;
          page_url?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      building_facilities: {
        Row: {
          building_id: number | null;
          created_at: string | null;
          description: string | null;
          description_en: string | null;
          description_zh: string | null;
          facility_code: string | null;
          floor_info: string | null;
          floor_info_en: string | null;
          floor_info_zh: string | null;
          id: string;
          is_installed: boolean | null;
          lat: number | null;
          lng: number | null;
          name: string | null;
          name_en: string | null;
          name_zh: string | null;
          translation_status: string;
          video_caption: string | null;
          video_caption_en: string | null;
          video_caption_zh: string | null;
          video_url: string | null;
          updated_at: string;
        };
        Insert: {
          building_id?: number | null;
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          description_zh?: string | null;
          facility_code?: string | null;
          floor_info?: string | null;
          floor_info_en?: string | null;
          floor_info_zh?: string | null;
          id?: string;
          is_installed?: boolean | null;
          lat?: number | null;
          lng?: number | null;
          name?: string | null;
          name_en?: string | null;
          name_zh?: string | null;
          translation_status?: string;
          video_caption?: string | null;
          video_caption_en?: string | null;
          video_caption_zh?: string | null;
          video_url?: string | null;
          updated_at?: string;
        };
        Update: {
          building_id?: number | null;
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          description_zh?: string | null;
          facility_code?: string | null;
          floor_info?: string | null;
          floor_info_en?: string | null;
          floor_info_zh?: string | null;
          id?: string;
          is_installed?: boolean | null;
          lat?: number | null;
          lng?: number | null;
          name?: string | null;
          name_en?: string | null;
          name_zh?: string | null;
          translation_status?: string;
          video_caption?: string | null;
          video_caption_en?: string | null;
          video_caption_zh?: string | null;
          video_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "building_facilities_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "building_facilities_facility_code_fkey";
            columns: ["facility_code"];
            isOneToOne: false;
            referencedRelation: "facility_types";
            referencedColumns: ["code"];
          },
        ];
      };
      building_photos: {
        Row: {
          building_id: number;
          caption: string | null;
          caption_en: string | null;
          caption_zh: string | null;
          created_at: string | null;
          id: number;
          url: string;
        };
        Insert: {
          building_id: number;
          caption?: string | null;
          caption_en?: string | null;
          caption_zh?: string | null;
          created_at?: string | null;
          id?: number;
          url: string;
        };
        Update: {
          building_id?: number;
          caption?: string | null;
          caption_en?: string | null;
          caption_zh?: string | null;
          created_at?: string | null;
          id?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "building_photos_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      buildings: {
        Row: {
          campus: string | null;
          college_id: number | null;
          created_at: string | null;
          deleted_at: string | null;
          geojson: Json | null;
          id: number;
          is_deleted: boolean | null;
          last_updated: string | null;
          name: string | null;
          name_en: string | null;
        };
        Insert: {
          campus?: string | null;
          college_id?: number | null;
          created_at?: string | null;
          deleted_at?: string | null;
          geojson?: Json | null;
          id: number;
          is_deleted?: boolean | null;
          last_updated?: string | null;
          name?: string | null;
          name_en?: string | null;
        };
        Update: {
          campus?: string | null;
          college_id?: number | null;
          created_at?: string | null;
          deleted_at?: string | null;
          geojson?: Json | null;
          id?: number;
          is_deleted?: boolean | null;
          last_updated?: string | null;
          name?: string | null;
          name_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "buildings_college_id_fkey";
            columns: ["college_id"];
            isOneToOne: false;
            referencedRelation: "colleges";
            referencedColumns: ["id"];
          },
        ];
      };
      colleges: {
        Row: {
          id: number;
          name: string;
          name_en: string | null;
          name_zh: string | null;
        };
        Insert: {
          id?: number;
          name: string;
          name_en?: string | null;
          name_zh?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          name_en?: string | null;
          name_zh?: string | null;
        };
        Relationships: [];
      };
      facility_types: {
        Row: {
          code: string;
          icon: string | null;
          label: string | null;
          label_en: string | null;
          label_zh: string | null;
        };
        Insert: {
          code: string;
          icon?: string | null;
          label?: string | null;
          label_en?: string | null;
          label_zh?: string | null;
        };
        Update: {
          code?: string;
          icon?: string | null;
          label?: string | null;
          label_en?: string | null;
          label_zh?: string | null;
        };
        Relationships: [];
      };
      landmarks: {
        Row: {
          created_at: string | null;
          description: string | null;
          description_en: string | null;
          description_zh: string | null;
          icon: string;
          id: string;
          image_url: string | null;
          lat: number;
          lng: number;
          name: string;
          name_en: string | null;
          name_zh: string | null;
          photo_url: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          description_zh?: string | null;
          icon: string;
          id?: string;
          image_url?: string | null;
          lat: number;
          lng: number;
          name: string;
          name_en?: string | null;
          name_zh?: string | null;
          photo_url?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          description_zh?: string | null;
          icon?: string;
          id?: string;
          image_url?: string | null;
          lat?: number;
          lng?: number;
          name?: string;
          name_en?: string | null;
          name_zh?: string | null;
          photo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      slope_segments: {
        Row: {
          created_at: string | null;
          gpx_file: string | null;
          id: string;
          name: string;
          segments: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string | null;
          gpx_file?: string | null;
          id?: string;
          name: string;
          segments: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string | null;
          gpx_file?: string | null;
          id?: string;
          name?: string;
          segments?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_admin_building_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          missing_facility_count: number;
          missing_location_count: number;
          missing_photo_count: number;
          registered_facility_count: number;
          stale_update_count: number;
          translation_needed_count: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
