/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: live Supabase project zpciertrkqwzuuektzpj
 * Generated: 2026-06-27T10:32:57.954Z
 * Generator: scripts/generate-types.mjs (after scripts/introspect-schema.mjs)
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      amb_activities: {
        Row: {
          id: string;
          title: string;
          description: string;
          points: number;
          submission_deadline: string;
          cover_image_url: string | null;
          is_active: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          points: number;
          submission_deadline: string;
          cover_image_url?: string | null;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          points?: number;
          submission_deadline?: string;
          cover_image_url?: string | null;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_chat_messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          body?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_events: {
        Row: {
          id: string;
          title: string;
          body: string;
          cover_image_url: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          cover_image_url?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          cover_image_url?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_gallery: {
        Row: {
          id: string;
          image_url: string;
          caption: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          image_url: string;
          caption?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          image_url?: string;
          caption?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_orders: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          points_used: number;
          inr_paid: number;
          payment_status: string;
          payment_ref: string | null;
          fulfillment_status: string;
          admin_notes: string | null;
          created_at: string;
          razorpay_order_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          points_used: number;
          inr_paid?: number;
          payment_status: string;
          payment_ref?: string | null;
          fulfillment_status?: string;
          admin_notes?: string | null;
          created_at?: string;
          razorpay_order_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          points_used?: number;
          inr_paid?: number;
          payment_status?: string;
          payment_ref?: string | null;
          fulfillment_status?: string;
          admin_notes?: string | null;
          created_at?: string;
          razorpay_order_id?: string | null;
        };
        Relationships: [];
      };
      amb_points_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          reference_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: string;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          delta?: number;
          reason?: string;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_products: {
        Row: {
          id: string;
          type: string;
          name: string;
          description: string;
          image_url: string | null;
          points_cost: number;
          inr_cost: number;
          stock: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          name: string;
          description?: string;
          image_url?: string | null;
          points_cost: number;
          inr_cost: number;
          stock?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          name?: string;
          description?: string;
          image_url?: string | null;
          points_cost?: number;
          inr_cost?: number;
          stock?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          role: string;
          status: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          college: string;
          city: string;
          student_id_url: string | null;
          avatar_url: string | null;
          application_data: Json;
          created_at: string;
          approved_at: string | null;
          rejected_at: string | null;
          referral_code: string | null;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          role?: string;
          status?: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          college: string;
          city: string;
          student_id_url?: string | null;
          avatar_url?: string | null;
          application_data?: Json;
          created_at?: string;
          approved_at?: string | null;
          rejected_at?: string | null;
          referral_code?: string | null;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          role?: string;
          status?: string;
          first_name?: string;
          last_name?: string;
          email?: string;
          phone?: string;
          college?: string;
          city?: string;
          student_id_url?: string | null;
          avatar_url?: string | null;
          application_data?: Json;
          created_at?: string;
          approved_at?: string | null;
          rejected_at?: string | null;
          referral_code?: string | null;
        };
        Relationships: [];
      };
      amb_submission_files: {
        Row: {
          id: string;
          submission_id: string;
          storage_path: string;
          file_type: string;
          file_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          storage_path: string;
          file_type: string;
          file_size: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          storage_path?: string;
          file_type?: string;
          file_size?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_submissions: {
        Row: {
          id: string;
          activity_id: string;
          user_id: string;
          text_content: string | null;
          status: string;
          awarded_points: number | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          activity_id: string;
          user_id: string;
          text_content?: string | null;
          status?: string;
          awarded_points?: number | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          activity_id?: string;
          user_id?: string;
          text_content?: string | null;
          status?: string;
          awarded_points?: number | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      amb_tiers: {
        Row: {
          rank: number;
          name: string;
          threshold_points: number;
          points_to_inr_rate: number;
          updated_at: string;
        };
        Insert: {
          rank: number;
          name: string;
          threshold_points: number;
          points_to_inr_rate: number;
          updated_at?: string;
        };
        Update: {
          rank?: number;
          name?: string;
          threshold_points?: number;
          points_to_inr_rate?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      yuvaah_quiz_attempts: {
        Row: {
          id: string;
          round_id: string;
          profile_id: string;
          status: string;
          assigned_question_ids: Json;
          answers: Json;
          score: number | null;
          correct_count: number | null;
          wrong_count: number | null;
          unanswered_count: number | null;
          started_at: string;
          completed_at: string | null;
          points_ledger_id: string | null;
        };
        Insert: {
          id?: string;
          round_id: string;
          profile_id: string;
          status?: string;
          assigned_question_ids: Json;
          answers?: Json;
          score?: number | null;
          correct_count?: number | null;
          wrong_count?: number | null;
          unanswered_count?: number | null;
          started_at?: string;
          completed_at?: string | null;
          points_ledger_id?: string | null;
        };
        Update: {
          id?: string;
          round_id?: string;
          profile_id?: string;
          status?: string;
          assigned_question_ids?: Json;
          answers?: Json;
          score?: number | null;
          correct_count?: number | null;
          wrong_count?: number | null;
          unanswered_count?: number | null;
          started_at?: string;
          completed_at?: string | null;
          points_ledger_id?: string | null;
        };
        Relationships: [];
      };
      yuvaah_quiz_questions: {
        Row: {
          id: string;
          round_id: string;
          category: string | null;
          question: string;
          option_a: string;
          option_b: string;
          option_c: string;
          option_d: string;
          correct_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          category?: string | null;
          question: string;
          option_a: string;
          option_b: string;
          option_c: string;
          option_d: string;
          correct_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          round_id?: string;
          category?: string | null;
          question?: string;
          option_a?: string;
          option_b?: string;
          option_c?: string;
          option_d?: string;
          correct_index?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      yuvaah_quiz_rounds: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: string;
          time_limit_seconds: number | null;
          points_per_correct: number;
          questions_per_attempt: number;
          created_by: string | null;
          created_at: string;
          activated_at: string | null;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: string;
          time_limit_seconds?: number | null;
          points_per_correct?: number;
          questions_per_attempt?: number;
          created_by?: string | null;
          created_at?: string;
          activated_at?: string | null;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          status?: string;
          time_limit_seconds?: number | null;
          points_per_correct?: number;
          questions_per_attempt?: number;
          created_by?: string | null;
          created_at?: string;
          activated_at?: string | null;
          closed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      amb_v_leaderboard: {
        Row: {
          user_id: string | null;
          first_name: string | null;
          last_name: string | null;
          total_earned: number | null;
        };
        Relationships: [];
      };
      amb_v_user_balances: {
        Row: {
          user_id: string | null;
          balance: number | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
