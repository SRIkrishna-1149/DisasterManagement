export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_acknowledgements: {
        Row: {
          acknowledged_at: string
          alert_id: string
          id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          alert_id: string
          id?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          alert_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_acknowledgements_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          approval_required: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          area_name: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          delivery_status: string
          disaster_type: string | null
          expires_at: string | null
          id: string
          incident_id: string | null
          issued_at: string
          latitude: number | null
          level: Database["public"]["Enums"]["alert_level"]
          longitude: number | null
          message: string
          radius_km: number | null
          reason: string | null
          recommended_action: string | null
          risk_score: number | null
          title: string
        }
        Insert: {
          approval_required?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          area_name?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_status?: string
          disaster_type?: string | null
          expires_at?: string | null
          id?: string
          incident_id?: string | null
          issued_at?: string
          latitude?: number | null
          level?: Database["public"]["Enums"]["alert_level"]
          longitude?: number | null
          message: string
          radius_km?: number | null
          reason?: string | null
          recommended_action?: string | null
          risk_score?: number | null
          title: string
        }
        Update: {
          approval_required?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          area_name?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_status?: string
          disaster_type?: string | null
          expires_at?: string | null
          id?: string
          incident_id?: string | null
          issued_at?: string
          latitude?: number | null
          level?: Database["public"]["Enums"]["alert_level"]
          longitude?: number | null
          message?: string
          radius_km?: number | null
          reason?: string | null
          recommended_action?: string | null
          risk_score?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "disaster_events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_state: Json | null
          previous_state: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          incident_id: string | null
          latitude: number | null
          longitude: number | null
          report_type: string
          severity: Database["public"]["Enums"]["severity_level"]
          user_id: string | null
          verification_status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string | null
          latitude?: number | null
          longitude?: number | null
          report_type: string
          severity?: Database["public"]["Enums"]["severity_level"]
          user_id?: string | null
          verification_status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string | null
          latitude?: number | null
          longitude?: number | null
          report_type?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          user_id?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "disaster_events"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          category: string
          enabled: boolean
          id: string
          last_error: string | null
          last_successful_update: string | null
          mode: string
          name: string
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_successful_update?: string | null
          mode?: string
          name: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_successful_update?: string | null
          mode?: string
          name?: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      disaster_events: {
        Row: {
          active: boolean
          area_name: string | null
          created_at: string
          disaster_type: string
          ended_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          radius_km: number | null
          severity: Database["public"]["Enums"]["severity_level"]
          started_at: string
          title: string
        }
        Insert: {
          active?: boolean
          area_name?: string | null
          created_at?: string
          disaster_type: string
          ended_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          radius_km?: number | null
          severity?: Database["public"]["Enums"]["severity_level"]
          started_at?: string
          title: string
        }
        Update: {
          active?: boolean
          area_name?: string | null
          created_at?: string
          disaster_type?: string
          ended_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          radius_km?: number | null
          severity?: Database["public"]["Enums"]["severity_level"]
          started_at?: string
          title?: string
        }
        Relationships: []
      }
      emergency_resources: {
        Row: {
          address: string | null
          capacity: number | null
          contact_phone: string | null
          created_at: string
          id: string
          last_verified_at: string | null
          latitude: number
          longitude: number
          name: string
          occupancy: number | null
          resource_type: string
          status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
          verification_source: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          last_verified_at?: string | null
          latitude: number
          longitude: number
          name: string
          occupancy?: number | null
          resource_type: string
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
          verification_source?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          last_verified_at?: string | null
          latitude?: number
          longitude?: number
          name?: string
          occupancy?: number | null
          resource_type?: string
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
          verification_source?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rescue_teams: {
        Row: {
          capacity: number
          contact_phone: string | null
          created_at: string
          current_mission_id: string | null
          equipment: string[]
          id: string
          latitude: number | null
          location_updated_at: string | null
          longitude: number | null
          name: string
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
        }
        Insert: {
          capacity?: number
          contact_phone?: string | null
          created_at?: string
          current_mission_id?: string | null
          equipment?: string[]
          id?: string
          latitude?: number | null
          location_updated_at?: string | null
          longitude?: number | null
          name: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          contact_phone?: string | null
          created_at?: string
          current_mission_id?: string | null
          equipment?: string[]
          id?: string
          latitude?: number | null
          location_updated_at?: string | null
          longitude?: number | null
          name?: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Relationships: []
      }
      risk_assessments: {
        Row: {
          area_name: string
          confidence: string | null
          created_at: string
          data_quality: string
          disaster_type: string
          engine: string
          factors: Json
          id: string
          latitude: number
          longitude: number
          risk_level: string
          risk_score: number
          valid_until: string | null
        }
        Insert: {
          area_name: string
          confidence?: string | null
          created_at?: string
          data_quality?: string
          disaster_type?: string
          engine?: string
          factors?: Json
          id?: string
          latitude: number
          longitude: number
          risk_level: string
          risk_score: number
          valid_until?: string | null
        }
        Update: {
          area_name?: string
          confidence?: string | null
          created_at?: string
          data_quality?: string
          disaster_type?: string
          engine?: string
          factors?: Json
          id?: string
          latitude?: number
          longitude?: number
          risk_level?: string
          risk_score?: number
          valid_until?: string | null
        }
        Relationships: []
      }
      sos_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          new_status: Database["public"]["Enums"]["sos_status"] | null
          notes: string | null
          previous_status: Database["public"]["Enums"]["sos_status"] | null
          reason: string | null
          sos_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_status?: Database["public"]["Enums"]["sos_status"] | null
          notes?: string | null
          previous_status?: Database["public"]["Enums"]["sos_status"] | null
          reason?: string | null
          sos_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_status?: Database["public"]["Enums"]["sos_status"] | null
          notes?: string | null
          previous_status?: Database["public"]["Enums"]["sos_status"] | null
          reason?: string | null
          sos_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_events_sos_id_fkey"
            columns: ["sos_id"]
            isOneToOne: false
            referencedRelation: "sos_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_requests: {
        Row: {
          assigned_team_id: string | null
          category: string
          client_created_at: string | null
          created_at: string
          description: string | null
          dismissed_reason: string | null
          has_medical_emergency: boolean
          has_vulnerable_people: boolean
          id: string
          idempotency_key: string
          incident_id: string | null
          landmark: string | null
          latitude: number | null
          location_accuracy_m: number | null
          location_source: Database["public"]["Enums"]["location_source"]
          longitude: number | null
          medical_needs: string | null
          merged_into_id: string | null
          people_count: number
          priority_breakdown: Json
          priority_score: number
          reference: number
          reporter_name: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["sos_status"]
          updated_at: string
          user_id: string | null
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        Insert: {
          assigned_team_id?: string | null
          category: string
          client_created_at?: string | null
          created_at?: string
          description?: string | null
          dismissed_reason?: string | null
          has_medical_emergency?: boolean
          has_vulnerable_people?: boolean
          id?: string
          idempotency_key: string
          incident_id?: string | null
          landmark?: string | null
          latitude?: number | null
          location_accuracy_m?: number | null
          location_source?: Database["public"]["Enums"]["location_source"]
          longitude?: number | null
          medical_needs?: string | null
          merged_into_id?: string | null
          people_count?: number
          priority_breakdown?: Json
          priority_score?: number
          reference?: number
          reporter_name?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["sos_status"]
          updated_at?: string
          user_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Update: {
          assigned_team_id?: string | null
          category?: string
          client_created_at?: string | null
          created_at?: string
          description?: string | null
          dismissed_reason?: string | null
          has_medical_emergency?: boolean
          has_vulnerable_people?: boolean
          id?: string
          idempotency_key?: string
          incident_id?: string | null
          landmark?: string | null
          latitude?: number | null
          location_accuracy_m?: number | null
          location_source?: Database["public"]["Enums"]["location_source"]
          longitude?: number | null
          medical_needs?: string | null
          merged_into_id?: string | null
          people_count?: number
          priority_breakdown?: Json
          priority_score?: number
          reference?: number
          reporter_name?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: Database["public"]["Enums"]["sos_status"]
          updated_at?: string
          user_id?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sos_requests_assigned_team_id_fkey"
            columns: ["assigned_team_id"]
            isOneToOne: false
            referencedRelation: "rescue_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_requests_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "disaster_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_requests_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "sos_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_team_to_sos: {
        Args: { _override?: boolean; _sos_id: string; _team_id: string }
        Returns: {
          assigned_team_id: string | null
          category: string
          client_created_at: string | null
          created_at: string
          description: string | null
          dismissed_reason: string | null
          has_medical_emergency: boolean
          has_vulnerable_people: boolean
          id: string
          idempotency_key: string
          incident_id: string | null
          landmark: string | null
          latitude: number | null
          location_accuracy_m: number | null
          location_source: Database["public"]["Enums"]["location_source"]
          longitude: number | null
          medical_needs: string | null
          merged_into_id: string | null
          people_count: number
          priority_breakdown: Json
          priority_score: number
          reference: number
          reporter_name: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          status: Database["public"]["Enums"]["sos_status"]
          updated_at: string
          user_id: string | null
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sos_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_operator: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      alert_level: "INFO" | "WATCH" | "WARNING" | "CRITICAL"
      app_role: "community" | "rescue" | "admin"
      location_source: "GPS" | "MANUAL_PIN" | "LANDMARK"
      resource_status:
        | "ACTIVE"
        | "INACTIVE"
        | "FULL"
        | "UNKNOWN"
        | "TEMPORARILY_UNAVAILABLE"
      severity_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      sos_status:
        | "UNVERIFIED"
        | "VALIDATED"
        | "REJECTED"
        | "NEEDS_MORE_INFORMATION"
        | "ASSIGNED"
        | "DISPATCHED"
        | "EN_ROUTE"
        | "ARRIVED"
        | "RESCUE_IN_PROGRESS"
        | "RESOLVED"
        | "CANCELLED"
        | "DUPLICATE"
      team_status: "AVAILABLE" | "DEPLOYED" | "OFFLINE"
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
  public: {
    Enums: {
      alert_level: ["INFO", "WATCH", "WARNING", "CRITICAL"],
      app_role: ["community", "rescue", "admin"],
      location_source: ["GPS", "MANUAL_PIN", "LANDMARK"],
      resource_status: [
        "ACTIVE",
        "INACTIVE",
        "FULL",
        "UNKNOWN",
        "TEMPORARILY_UNAVAILABLE",
      ],
      severity_level: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      sos_status: [
        "UNVERIFIED",
        "VALIDATED",
        "REJECTED",
        "NEEDS_MORE_INFORMATION",
        "ASSIGNED",
        "DISPATCHED",
        "EN_ROUTE",
        "ARRIVED",
        "RESCUE_IN_PROGRESS",
        "RESOLVED",
        "CANCELLED",
        "DUPLICATE",
      ],
      team_status: ["AVAILABLE", "DEPLOYED", "OFFLINE"],
    },
  },
} as const
