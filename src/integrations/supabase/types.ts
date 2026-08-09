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
      account_payments: {
        Row: {
          account_id: string
          amount_cents: number
          created_at: string
          id: string
          method: string
          note: string | null
          recorded_by: string | null
          reference: string | null
          settled_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          recorded_by?: string | null
          reference?: string | null
          settled_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          recorded_by?: string | null
          reference?: string | null
          settled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          access_code_hash: string | null
          active: boolean
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          credit_limit_cents: number | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          access_code_hash?: string | null
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          credit_limit_cents?: number | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          access_code_hash?: string | null
          active?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          credit_limit_cents?: number | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          terminal: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          terminal?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          terminal?: string | null
        }
        Relationships: []
      }
      bank_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author: string | null
          body_md: string
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published: boolean
          published_at: string | null
          slug: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          body_md?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          body_md?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          active: boolean
          body: string
          created_at: string
          cta_label: string | null
          cta_url: string | null
          id: string
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          close_time: string
          closed: boolean
          day_of_week: number
          id: string
          open_time: string
        }
        Insert: {
          close_time?: string
          closed?: boolean
          day_of_week: number
          id?: string
          open_time?: string
        }
        Update: {
          close_time?: string
          closed?: boolean
          day_of_week?: number
          id?: string
          open_time?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          accepting_orders: boolean
          allow_preorder_when_closed: boolean
          closed_message: string | null
          delivery_close_time: string
          delivery_fee_cents: number
          delivery_minutes: number
          delivery_open_time: string
          delivery_origin_postcode: string
          delivery_radius_m: number
          free_delivery_threshold_cents: number | null
          id: string
          min_order_cents: number
          name: string
          prep_minutes: number
          site_id: string
          updated_at: string
          vat_number: string | null
          vat_registered: boolean
        }
        Insert: {
          accepting_orders?: boolean
          allow_preorder_when_closed?: boolean
          closed_message?: string | null
          delivery_close_time?: string
          delivery_fee_cents?: number
          delivery_minutes?: number
          delivery_open_time?: string
          delivery_origin_postcode?: string
          delivery_radius_m?: number
          free_delivery_threshold_cents?: number | null
          id?: string
          min_order_cents?: number
          name?: string
          prep_minutes?: number
          site_id?: string
          updated_at?: string
          vat_number?: string | null
          vat_registered?: boolean
        }
        Update: {
          accepting_orders?: boolean
          allow_preorder_when_closed?: boolean
          closed_message?: string | null
          delivery_close_time?: string
          delivery_fee_cents?: number
          delivery_minutes?: number
          delivery_open_time?: string
          delivery_origin_postcode?: string
          delivery_radius_m?: number
          free_delivery_threshold_cents?: number | null
          id?: string
          min_order_cents?: number
          name?: string
          prep_minutes?: number
          site_id?: string
          updated_at?: string
          vat_number?: string | null
          vat_registered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_completions: {
        Row: {
          business_date: string
          checklist_id: string
          completed_at: string
          completed_by: string
          id: string
          note: string | null
        }
        Insert: {
          business_date?: string
          checklist_id: string
          completed_at?: string
          completed_by: string
          id?: string
          note?: string | null
        }
        Update: {
          business_date?: string
          checklist_id?: string
          completed_at?: string
          completed_by?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_completions_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "operational_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      code_attempts: {
        Row: {
          created_at: string
          id: string
          ident: string
          kind: string
          ok: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          ident: string
          kind: string
          ok?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          ident?: string
          kind?: string
          ok?: boolean
        }
        Relationships: []
      }
      customer_discounts: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          label: string | null
          percent: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          label?: string | null
          percent?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          label?: string | null
          percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_favourites: {
        Row: {
          created_at: string
          customer_id: string
          menu_item_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          menu_item_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          menu_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favourites_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedback: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          order_id: string
          rating: number
          status: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id: string
          rating: number
          status?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string
          rating?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_control_summaries: {
        Row: {
          account_sales_cents: number
          business_date: string
          card_sales_cents: number
          cash_sales_cents: number
          discounts_cents: number
          generated_at: string
          generated_by: string | null
          gross_sales_cents: number
          id: string
          net_sales_cents: number
          order_count: number
          refunds_cents: number
          signed_off_at: string | null
          signed_off_by: string | null
          site_id: string
          till_variance_cents: number
          voucher_cents: number
          waste_value_cents: number
        }
        Insert: {
          account_sales_cents?: number
          business_date: string
          card_sales_cents?: number
          cash_sales_cents?: number
          discounts_cents?: number
          generated_at?: string
          generated_by?: string | null
          gross_sales_cents?: number
          id?: string
          net_sales_cents?: number
          order_count?: number
          refunds_cents?: number
          signed_off_at?: string | null
          signed_off_by?: string | null
          site_id: string
          till_variance_cents?: number
          voucher_cents?: number
          waste_value_cents?: number
        }
        Update: {
          account_sales_cents?: number
          business_date?: string
          card_sales_cents?: number
          cash_sales_cents?: number
          discounts_cents?: number
          generated_at?: string
          generated_by?: string | null
          gross_sales_cents?: number
          id?: string
          net_sales_cents?: number
          order_count?: number
          refunds_cents?: number
          signed_off_at?: string | null
          signed_off_by?: string | null
          site_id?: string
          till_variance_cents?: number
          voucher_cents?: number
          waste_value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_control_summaries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_id: string
          heading: number | null
          lat: number
          lng: number
          order_id: string
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_id: string
          heading?: number | null
          lat: number
          lng: number
          order_id: string
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_id?: string
          heading?: number | null
          lat?: number
          lng?: number
          order_id?: string
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_status: {
        Row: {
          detail: string | null
          healthy: boolean
          key: string
          last_seen_at: string
          updated_at: string
        }
        Insert: {
          detail?: string | null
          healthy?: boolean
          key: string
          last_seen_at?: string
          updated_at?: string
        }
        Update: {
          detail?: string | null
          healthy?: boolean
          key?: string
          last_seen_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          active: boolean
          allergens: string[]
          barcode: string | null
          cost_per_unit_cents: number
          created_at: string
          id: string
          name: string
          par_level: number
          quantity_on_hand: number
          reorder_level: number
          site_id: string
          sku: string
          supplier_code: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string[]
          barcode?: string | null
          cost_per_unit_cents?: number
          created_at?: string
          id?: string
          name: string
          par_level?: number
          quantity_on_hand?: number
          reorder_level?: number
          site_id: string
          sku: string
          supplier_code?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string[]
          barcode?: string | null
          cost_per_unit_cents?: number
          created_at?: string
          id?: string
          name?: string
          par_level?: number
          quantity_on_hand?: number
          reorder_level?: number
          site_id?: string
          sku?: string
          supplier_code?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      juror_attendance_challenges: {
        Row: {
          consumed_at: string | null
          consumed_voucher_holder_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          room: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_voucher_holder_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          room: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          consumed_voucher_holder_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          room?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "juror_attendance_challenges_consumed_voucher_holder_id_fkey"
            columns: ["consumed_voucher_holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      juror_attendance_consumptions: {
        Row: {
          challenge_id: string
          consumed_at: string
          holder_id: string
        }
        Insert: {
          challenge_id: string
          consumed_at?: string
          holder_id: string
        }
        Update: {
          challenge_id?: string
          consumed_at?: string
          holder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "juror_attendance_consumptions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "juror_attendance_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "juror_attendance_consumptions_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      juror_daily_presence: {
        Row: {
          challenge_id: string | null
          for_date: string
          holder_id: string
          id: string
          room: string
          verified_at: string
        }
        Insert: {
          challenge_id?: string | null
          for_date?: string
          holder_id: string
          id?: string
          room: string
          verified_at?: string
        }
        Update: {
          challenge_id?: string | null
          for_date?: string
          holder_id?: string
          id?: string
          room?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "juror_daily_presence_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "juror_attendance_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "juror_daily_presence_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_stations: {
        Row: {
          active: boolean
          code: string
          colour: string
          id: string
          name: string
          site_id: string
          sort_order: number
          target_seconds: number
        }
        Insert: {
          active?: boolean
          code: string
          colour?: string
          id?: string
          name: string
          site_id: string
          sort_order?: number
          target_seconds?: number
        }
        Update: {
          active?: boolean
          code?: string
          colour?: string
          id?: string
          name?: string
          site_id?: string
          sort_order?: number
          target_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "kds_stations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          site_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          site_id?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          site_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          allergens: string[]
          barcode: string | null
          category_id: string | null
          cost_cents: number
          created_at: string
          description: string | null
          dietary_tags: string[]
          group_label: string | null
          id: string
          image_url: string | null
          is_beverage: boolean
          is_veg: boolean
          juror_menu: boolean
          loyalty_drink: boolean
          name: string
          needs_cooking: boolean
          portion_note: string | null
          prep_seconds: number
          price_cents: number
          site_id: string
          sort_order: number
          station_code: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string[]
          barcode?: string | null
          category_id?: string | null
          cost_cents?: number
          created_at?: string
          description?: string | null
          dietary_tags?: string[]
          group_label?: string | null
          id?: string
          image_url?: string | null
          is_beverage?: boolean
          is_veg?: boolean
          juror_menu?: boolean
          loyalty_drink?: boolean
          name: string
          needs_cooking?: boolean
          portion_note?: string | null
          prep_seconds?: number
          price_cents: number
          site_id?: string
          sort_order?: number
          station_code?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string[]
          barcode?: string | null
          category_id?: string | null
          cost_cents?: number
          created_at?: string
          description?: string | null
          dietary_tags?: string[]
          group_label?: string | null
          id?: string
          image_url?: string | null
          is_beverage?: boolean
          is_veg?: boolean
          juror_menu?: boolean
          loyalty_drink?: boolean
          name?: string
          needs_cooking?: boolean
          portion_note?: string | null
          prep_seconds?: number
          price_cents?: number
          site_id?: string
          sort_order?: number
          station_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_modifiers: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          description: string | null
          group_name: string | null
          group_type: string
          id: string
          is_exclusive: boolean
          item_id: string | null
          max_selections: number | null
          min_selections: number
          name: string
          price_cents: number
          required: boolean
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          group_name?: string | null
          group_type?: string
          id?: string
          is_exclusive?: boolean
          item_id?: string | null
          max_selections?: number | null
          min_selections?: number
          name: string
          price_cents?: number
          required?: boolean
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          group_name?: string | null
          group_type?: string
          id?: string
          is_exclusive?: boolean
          item_id?: string | null
          max_selections?: number | null
          min_selections?: number
          name?: string
          price_cents?: number
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_modifiers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_modifiers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_checklists: {
        Row: {
          active: boolean
          cadence: string
          created_at: string
          description: string | null
          id: string
          site_id: string
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          cadence: string
          created_at?: string
          description?: string | null
          id?: string
          site_id: string
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          cadence?: string
          created_at?: string
          description?: string | null
          id?: string
          site_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_checklists_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category_label: string | null
          created_at: string
          id: string
          menu_item_id: string | null
          name: string
          notes: string | null
          order_id: string
          qty: number
          unit_price_cents: number
        }
        Insert: {
          category_label?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string | null
          name: string
          notes?: string | null
          order_id: string
          qty: number
          unit_price_cents: number
        }
        Update: {
          category_label?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string | null
          name?: string
          notes?: string | null
          order_id?: string
          qty?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          method: string
          order_id: string
          payment_attempt_id: string | null
          provider: string | null
          provider_transaction_id: string | null
          received_by: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          method: string
          order_id: string
          payment_attempt_id?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          received_by?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          payment_attempt_id?: string | null
          provider?: string | null
          provider_transaction_id?: string | null
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount_cents: number
          card_amount_cents: number
          cash_amount_cents: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          order_id: string
          provider: string | null
          provider_transaction_id: string | null
          reason: string
          requested_by: string
          status: string
        }
        Insert: {
          amount_cents: number
          card_amount_cents?: number
          cash_amount_cents?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          order_id: string
          provider?: string | null
          provider_transaction_id?: string | null
          reason: string
          requested_by: string
          status?: string
        }
        Update: {
          amount_cents?: number
          card_amount_cents?: number
          cash_amount_cents?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          order_id?: string
          provider?: string | null
          provider_transaction_id?: string | null
          reason?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        Insert: {
          abandoned_at?: string | null
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          deliveroo_order_id?: string | null
          delivery_fee_cents?: number
          delivery_notes?: string | null
          discount_cents?: number
          driver_id?: string | null
          guest_token?: string
          id?: string
          idempotency_key?: string | null
          inventory_posted_at?: string | null
          juror_discount_cents?: number
          jury_room?: string | null
          loyalty_awarded?: boolean
          loyalty_free_drinks_used?: number
          loyalty_stamps_pending?: number
          operator_id?: string | null
          order_number?: number
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          picked_up_at?: string | null
          points_earned?: number
          pos_terminal?: string | null
          postcode?: string | null
          promo_code?: string | null
          promo_discount_cents?: number
          ready_at?: string | null
          refunded_cents?: number
          schedule_mode?: string
          scheduled_for?: string | null
          site_id?: string
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          sumup_checkout_id?: string | null
          sumup_order_ref?: string | null
          sumup_reference?: string | null
          sumup_transaction_id?: string | null
          table_number?: string | null
          till_shift_id?: string | null
          total_cents?: number
          tracking_token_hash?: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          void_reason?: string | null
          voucher_cents?: number
          voucher_holder_id?: string | null
        }
        Update: {
          abandoned_at?: string | null
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          deliveroo_order_id?: string | null
          delivery_fee_cents?: number
          delivery_notes?: string | null
          discount_cents?: number
          driver_id?: string | null
          guest_token?: string
          id?: string
          idempotency_key?: string | null
          inventory_posted_at?: string | null
          juror_discount_cents?: number
          jury_room?: string | null
          loyalty_awarded?: boolean
          loyalty_free_drinks_used?: number
          loyalty_stamps_pending?: number
          operator_id?: string | null
          order_number?: number
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          picked_up_at?: string | null
          points_earned?: number
          pos_terminal?: string | null
          postcode?: string | null
          promo_code?: string | null
          promo_discount_cents?: number
          ready_at?: string | null
          refunded_cents?: number
          schedule_mode?: string
          scheduled_for?: string | null
          site_id?: string
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          sumup_checkout_id?: string | null
          sumup_order_ref?: string | null
          sumup_reference?: string | null
          sumup_transaction_id?: string | null
          table_number?: string | null
          till_shift_id?: string | null
          total_cents?: number
          tracking_token_hash?: string | null
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          void_reason?: string | null
          voucher_cents?: number
          voucher_holder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_till_shift_id_fkey"
            columns: ["till_shift_id"]
            isOneToOne: false
            referencedRelation: "till_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_voucher_holder_id_fkey"
            columns: ["voucher_holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          cash_component_cents: number
          client_transaction_id: string | null
          created_at: string
          created_by: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          provider: string
          provider_reference: string
          provider_transaction_id: string | null
          reader_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cash_component_cents?: number
          client_transaction_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id: string
          provider?: string
          provider_reference: string
          provider_transaction_id?: string | null
          reader_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cash_component_cents?: number
          client_transaction_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id?: string
          provider?: string
          provider_reference?: string
          provider_transaction_id?: string | null
          reader_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_devices: {
        Row: {
          active: boolean
          created_at: string
          device_ref: string
          id: string
          name: string
          side: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          device_ref: string
          id?: string
          name: string
          side: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          device_ref?: string
          id?: string
          name?: string
          side?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          drink_stamps: number
          email: string | null
          free_drinks_available: number
          free_drinks_redeemed: number
          full_name: string | null
          id: string
          lifetime_points: number
          loyalty_points: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          drink_stamps?: number
          email?: string | null
          free_drinks_available?: number
          free_drinks_redeemed?: number
          full_name?: string | null
          id: string
          lifetime_points?: number
          loyalty_points?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          drink_stamps?: number
          email?: string | null
          free_drinks_available?: number
          free_drinks_redeemed?: number
          full_name?: string | null
          id?: string
          lifetime_points?: number
          loyalty_points?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_banners: {
        Row: {
          active: boolean
          badge: string | null
          bg_color: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          bg_color?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          bg_color?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          applies_to: string
          code: string
          created_at: string
          description: string | null
          discount_type: Database["public"]["Enums"]["promo_discount_type"]
          discount_value: number
          expires_at: string | null
          first_order_only: boolean
          id: string
          max_uses: number | null
          min_subtotal_cents: number
          starts_at: string | null
          uses: number
        }
        Insert: {
          active?: boolean
          applies_to?: string
          code: string
          created_at?: string
          description?: string | null
          discount_type?: Database["public"]["Enums"]["promo_discount_type"]
          discount_value?: number
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          max_uses?: number | null
          min_subtotal_cents?: number
          starts_at?: string | null
          uses?: number
        }
        Update: {
          active?: boolean
          applies_to?: string
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: Database["public"]["Enums"]["promo_discount_type"]
          discount_value?: number
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          max_uses?: number | null
          min_subtotal_cents?: number
          starts_at?: string | null
          uses?: number
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          ordered_quantity: number
          purchase_order_id: string
          received_quantity: number
          unit_cost_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          ordered_quantity: number
          purchase_order_id: string
          received_quantity?: number
          unit_cost_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          ordered_quantity?: number
          purchase_order_id?: string
          received_quantity?: number
          unit_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          expected_on: string | null
          id: string
          note: string | null
          ordered_at: string | null
          ordered_by: string | null
          received_at: string | null
          received_by: string | null
          site_id: string
          status: string
          supplier_id: string | null
          supplier_reference: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_on?: string | null
          id?: string
          note?: string | null
          ordered_at?: string | null
          ordered_by?: string | null
          received_at?: string | null
          received_by?: string | null
          site_id: string
          status?: string
          supplier_id?: string | null
          supplier_reference?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_on?: string | null
          id?: string
          note?: string | null
          ordered_at?: string | null
          ordered_by?: string | null
          received_at?: string | null
          received_by?: string | null
          site_id?: string
          status?: string
          supplier_id?: string | null
          supplier_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_components: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          menu_item_id: string
          quantity: number
          updated_at: string
          wastage_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          menu_item_id: string
          quantity: number
          updated_at?: string
          wastage_percent?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          menu_item_id?: string
          quantity?: number
          updated_at?: string
          wastage_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_components_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          legal_name: string
          marketplace_delivery_enabled: boolean
          name: string
          ordering_modes: string[]
          own_delivery_enabled: boolean
          postcode: string | null
          timezone: string
          trading_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          legal_name: string
          marketplace_delivery_enabled?: boolean
          name: string
          ordering_modes?: string[]
          own_delivery_enabled?: boolean
          postcode?: string | null
          timezone?: string
          trading_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          legal_name?: string
          marketplace_delivery_enabled?: boolean
          name?: string
          ordering_modes?: string[]
          own_delivery_enabled?: boolean
          postcode?: string | null
          timezone?: string
          trading_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number
          clocked_in_at: string
          clocked_out_at: string | null
          created_at: string
          id: string
          note: string | null
          site_id: string
          staff_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clocked_in_at?: string
          clocked_out_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          site_id: string
          staff_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number
          clocked_in_at?: string
          clocked_out_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          site_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          inventory_item_id: string
          movement_type: string
          quantity_delta: number
          reason: string
          reference_id: string | null
          reference_type: string | null
          site_id: string
          unit_cost_cents: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id: string
          movement_type: string
          quantity_delta: number
          reason: string
          reference_id?: string | null
          reference_type?: string | null
          site_id: string
          unit_cost_cents?: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string
          movement_type?: string
          quantity_delta?: number
          reason?: string
          reference_id?: string | null
          reference_type?: string | null
          site_id?: string
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_lines: {
        Row: {
          counted_quantity: number | null
          expected_quantity: number
          id: string
          inventory_item_id: string
          note: string | null
          stocktake_id: string
          variance_quantity: number | null
          variance_value_cents: number | null
        }
        Insert: {
          counted_quantity?: number | null
          expected_quantity: number
          id?: string
          inventory_item_id: string
          note?: string | null
          stocktake_id: string
          variance_quantity?: number | null
          variance_value_cents?: number | null
        }
        Update: {
          counted_quantity?: number | null
          expected_quantity?: number
          id?: string
          inventory_item_id?: string
          note?: string | null
          stocktake_id?: string
          variance_quantity?: number | null
          variance_value_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_lines_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktakes: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          id: string
          note: string | null
          opened_at: string
          opened_by: string | null
          site_id: string
          status: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          site_id: string
          status?: string
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          site_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          account_reference: string | null
          active: boolean
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          lead_days: number
          name: string
          phone: string | null
          site_id: string
          updated_at: string
        }
        Insert: {
          account_reference?: string | null
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_days?: number
          name: string
          phone?: string | null
          site_id: string
          updated_at?: string
        }
        Update: {
          account_reference?: string | null
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_days?: number
          name?: string
          phone?: string | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          category: string
          created_at: string
          detail: string | null
          fingerprint: string | null
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          site_id: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          detail?: string | null
          fingerprint?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          site_id?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          detail?: string | null
          fingerprint?: string | null
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          site_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      till_cash_events: {
        Row: {
          actor_id: string
          amount_cents: number
          created_at: string
          event_type: string
          id: string
          order_id: string | null
          reason: string | null
          shift_id: string
        }
        Insert: {
          actor_id: string
          amount_cents?: number
          created_at?: string
          event_type: string
          id?: string
          order_id?: string | null
          reason?: string | null
          shift_id: string
        }
        Update: {
          actor_id?: string
          amount_cents?: number
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string | null
          reason?: string | null
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "till_cash_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "till_cash_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "till_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      till_shifts: {
        Row: {
          close_note: string | null
          closed_at: string | null
          counted_cash_cents: number | null
          created_at: string
          discrepancy_cents: number | null
          expected_cash_cents: number | null
          id: string
          opened_at: string
          opening_float_cents: number
          site_id: string
          staff_id: string
          terminal: string
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          discrepancy_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          opened_at?: string
          opening_float_cents: number
          site_id?: string
          staff_id: string
          terminal: string
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          discrepancy_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          opened_at?: string
          opening_float_cents?: number
          site_id?: string
          staff_id?: string
          terminal?: string
        }
        Relationships: [
          {
            foreignKeyName: "till_shifts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_name: string
          device_type: string
          enrolled_by: string | null
          id: string
          last_seen_at: string | null
          revoked_at: string | null
          site_id: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          device_name: string
          device_type: string
          enrolled_by?: string | null
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          site_id?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          device_name?: string
          device_type?: string
          enrolled_by?: string | null
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          site_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "trusted_devices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
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
      voucher_allocations: {
        Row: {
          amount_cents: number
          created_at: string
          for_date: string
          holder_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          for_date?: string
          holder_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          for_date?: string
          holder_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_allocations_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_events: {
        Row: {
          actor_id: string | null
          amount_cents: number | null
          code: string
          created_at: string
          detail: string | null
          event: string
          holder_id: string | null
          id: string
          order_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount_cents?: number | null
          code: string
          created_at?: string
          detail?: string | null
          event: string
          holder_id?: string | null
          id?: string
          order_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount_cents?: number | null
          code?: string
          created_at?: string
          detail?: string | null
          event?: string
          holder_id?: string | null
          id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_events_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_holders: {
        Row: {
          active: boolean
          attendance_required: boolean
          batch: string | null
          code: string
          created_at: string
          daily_amount_cents: number
          deactivated_at: string | null
          email: string | null
          failed_pin_attempts: number
          id: string
          issued_by: string | null
          jury_room: string | null
          last_pin_verified_at: string | null
          name: string | null
          notes: string | null
          opt_in_source: string | null
          opted_in_at: string | null
          phone: string | null
          pin_hash: string | null
          pin_locked_until: string | null
          security_version: number
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          attendance_required?: boolean
          batch?: string | null
          code: string
          created_at?: string
          daily_amount_cents?: number
          deactivated_at?: string | null
          email?: string | null
          failed_pin_attempts?: number
          id?: string
          issued_by?: string | null
          jury_room?: string | null
          last_pin_verified_at?: string | null
          name?: string | null
          notes?: string | null
          opt_in_source?: string | null
          opted_in_at?: string | null
          phone?: string | null
          pin_hash?: string | null
          pin_locked_until?: string | null
          security_version?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          attendance_required?: boolean
          batch?: string | null
          code?: string
          created_at?: string
          daily_amount_cents?: number
          deactivated_at?: string | null
          email?: string | null
          failed_pin_attempts?: number
          id?: string
          issued_by?: string | null
          jury_room?: string | null
          last_pin_verified_at?: string | null
          name?: string | null
          notes?: string | null
          opt_in_source?: string | null
          opted_in_at?: string | null
          phone?: string | null
          pin_hash?: string | null
          pin_locked_until?: string | null
          security_version?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      voucher_redemptions: {
        Row: {
          allocation_id: string | null
          amount_cents: number
          created_at: string
          for_date: string
          holder_id: string
          id: string
          order_id: string | null
          reservation_token: string | null
        }
        Insert: {
          allocation_id?: string | null
          amount_cents: number
          created_at?: string
          for_date?: string
          holder_id: string
          id?: string
          order_id?: string | null
          reservation_token?: string | null
        }
        Update: {
          allocation_id?: string | null
          amount_cents?: number
          created_at?: string
          for_date?: string
          holder_id?: string
          id?: string
          order_id?: string | null
          reservation_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "voucher_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "voucher_holders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_juror_voucher_reservation: {
        Args: { _order_id: string; _reservation_token: string }
        Returns: boolean
      }
      award_loyalty_for_order: { Args: { _order_id: string }; Returns: boolean }
      cafe1_activate_juror_ids: {
        Args: {
          _batch: string
          _juror_ids: string[]
          _valid_from?: string
          _weeks?: number
        }
        Returns: {
          juror_id: string
          status: string
          valid_from: string
          valid_until: string
        }[]
      }
      cafe1_add_court_working_days: {
        Args: { _days: number; _from: string }
        Returns: string
      }
      cafe1_assert_operator: {
        Args: { _admin_only?: boolean }
        Returns: string
      }
      cafe1_charge_order_to_account: {
        Args: { _account_id: string; _order_id: string }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cafe1_clock_staff: {
        Args: {
          _action: string
          _break_minutes?: number
          _note?: string
          _site_id: string
        }
        Returns: Json
      }
      cafe1_complete_checklist: {
        Args: { _business_date: string; _checklist_id: string; _note: string }
        Returns: Json
      }
      cafe1_complete_stocktake: {
        Args: { _counts: Json; _stocktake_id: string }
        Returns: Json
      }
      cafe1_consume_juror_challenge: {
        Args: { _token_hash: string; _voucher_code: string }
        Returns: Json
      }
      cafe1_consume_juror_challenge_v2: {
        Args: {
          _token_hash: string
          _voucher_code: string
          _voucher_pin: string
        }
        Returns: Json
      }
      cafe1_create_juror_challenge: {
        Args: { _room: string; _token_hash: string }
        Returns: Json
      }
      cafe1_customer_favourites: { Args: never; Returns: string[] }
      cafe1_delete_recipe_component: {
        Args: { _component_id: string }
        Returns: boolean
      }
      cafe1_generate_daily_summary: {
        Args: { _business_date: string; _site_id: string }
        Returns: Json
      }
      cafe1_inventory_dashboard: { Args: { _site_id: string }; Returns: Json }
      cafe1_issue_juror_batch: {
        Args: {
          _batch: string
          _count?: number
          _service_days?: number
          _valid_from?: string
        }
        Returns: {
          code: string
          pin: string
          valid_from: string
          valid_until: string
        }[]
      }
      cafe1_list_sites: { Args: never; Returns: Json }
      cafe1_manage_juror_voucher: {
        Args: {
          _action: string
          _holder_id: string
          _reason?: string
          _working_days?: number
        }
        Returns: Json
      }
      cafe1_operations_dashboard: {
        Args: { _business_date: string; _site_id: string }
        Returns: Json
      }
      cafe1_reassign_order_channel: {
        Args: { _channel: string; _order_id: string }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cafe1_record_stock_movement: { Args: { _payload: Json }; Returns: Json }
      cafe1_refresh_operational_alerts: {
        Args: { _site_id: string }
        Returns: number
      }
      cafe1_reset_juror_pin: {
        Args: { _holder_id: string; _reason: string }
        Returns: Json
      }
      cafe1_resolve_alert: { Args: { _alert_id: string }; Returns: boolean }
      cafe1_save_inventory_item: {
        Args: { _payload: Json; _site_id: string }
        Returns: Json
      }
      cafe1_save_recipe_component: { Args: { _payload: Json }; Returns: Json }
      cafe1_save_site: { Args: { _payload: Json }; Returns: Json }
      cafe1_security_dashboard: { Args: { _site_id: string }; Returns: Json }
      cafe1_set_juror_daily_allowance: {
        Args: {
          _amount_cents: number
          _for_date: string
          _holder_id: string
          _reason: string
        }
        Returns: Json
      }
      cafe1_staff_dashboard: {
        Args: { _from: string; _site_id: string; _to: string }
        Returns: Json
      }
      cafe1_start_stocktake: {
        Args: { _site_id: string; _title: string }
        Returns: string
      }
      cafe1_submit_feedback: {
        Args: { _comment: string; _order_id: string; _rating: number }
        Returns: string
      }
      cafe1_toggle_favourite: {
        Args: { _menu_item_id: string }
        Returns: boolean
      }
      cancel_counter_order: {
        Args: { _order_id: string; _reason: string }
        Returns: boolean
      }
      claim_delivery_order: {
        Args: { _order_id: string }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_till_shift: {
        Args: { _counted_cash_cents: number; _note?: string; _shift_id: string }
        Returns: {
          close_note: string | null
          closed_at: string | null
          counted_cash_cents: number | null
          created_at: string
          discrepancy_cents: number | null
          expected_cash_cents: number | null
          id: string
          opened_at: string
          opening_float_cents: number
          site_id: string
          staff_id: string
          terminal: string
        }
        SetofOptions: {
          from: "*"
          to: "till_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_order_refund: {
        Args: { _refund_id: string }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_promo_use: { Args: { _code: string }; Returns: boolean }
      finalize_counter_card: {
        Args: { _order_id: string; _payment_attempt_id: string }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_customer_discount: {
        Args: { _email: string }
        Returns: {
          label: string
          percent: number
        }[]
      }
      get_juror_claim_rows: {
        Args: { _from: string; _to: string }
        Returns: {
          amount_cents: number
          batch: string
          for_date: string
          holder_id: string
          order_id: string
          order_number: number
          redeemed_at: string
          redemption_id: string
          voucher_code: string
        }[]
      }
      get_voucher_balance: {
        Args: { _email: string; _phone: string }
        Returns: {
          allocated_cents: number
          holder_id: string
          holder_name: string
          remaining_cents: number
          used_cents: number
        }[]
      }
      get_voucher_balance_by_code: {
        Args: { _code: string }
        Returns: {
          allocated_cents: number
          code: string
          holder_id: string
          holder_name: string
          jury_room: string
          opted_in: boolean
          remaining_cents: number
          status: string
          used_cents: number
          valid_from: string
          valid_until: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_promo_use: { Args: { _code: string }; Returns: undefined }
      is_court_working_day: { Args: { _d: string }; Returns: boolean }
      juror_opt_in_with_id: {
        Args: { _code: string; _source?: string }
        Returns: {
          already: boolean
          message: string
          ok: boolean
          pin: string
          valid_until: string
        }[]
      }
      open_till_shift: {
        Args: { _opening_float_cents: number; _terminal: string }
        Returns: {
          close_note: string | null
          closed_at: string | null
          counted_cash_cents: number | null
          created_at: string
          discrepancy_cents: number | null
          expected_cash_cents: number | null
          id: string
          opened_at: string
          opening_float_cents: number
          site_id: string
          staff_id: string
          terminal: string
        }
        SetofOptions: {
          from: "*"
          to: "till_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      opt_in_voucher: {
        Args: { _code: string; _source: string }
        Returns: {
          already: boolean
          message: string
          ok: boolean
        }[]
      }
      opt_in_voucher_secure: {
        Args: { _code: string; _pin: string; _source: string }
        Returns: {
          already: boolean
          message: string
          ok: boolean
        }[]
      }
      prepare_counter_order: {
        Args: {
          _customer_name: string
          _idempotency_key: string
          _items: Json
          _manual_card_reference: string
          _order_type: string
          _payment_mode: string
          _shift_id: string
          _table_number: string
          _terminal: string
          _voucher_code: string
        }
        Returns: {
          juror_discount_cents: number
          order_id: string
          order_number: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          subtotal_cents: number
          total_cents: number
          voucher_cents: number
          voucher_code: string
        }[]
      }
      prepare_counter_order_secure: {
        Args: {
          _customer_name: string
          _idempotency_key: string
          _items: Json
          _manual_card_reference: string
          _order_type: string
          _payment_mode: string
          _shift_id: string
          _table_number: string
          _terminal: string
          _voucher_code: string
          _voucher_pin: string
        }
        Returns: {
          juror_discount_cents: number
          order_id: string
          order_number: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          subtotal_cents: number
          total_cents: number
          voucher_cents: number
          voucher_code: string
        }[]
      }
      record_till_cash_event: {
        Args: {
          _amount_cents: number
          _event_type: string
          _reason: string
          _shift_id: string
        }
        Returns: {
          actor_id: string
          amount_cents: number
          created_at: string
          event_type: string
          id: string
          order_id: string | null
          reason: string | null
          shift_id: string
        }
        SetofOptions: {
          from: "*"
          to: "till_cash_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_voucher: {
        Args: { _amount_cents: number; _holder_id: string; _order_id: string }
        Returns: number
      }
      release_juror_voucher_reservation: {
        Args: { _reason: string; _reservation_token: string }
        Returns: boolean
      }
      reserve_juror_voucher: {
        Args: {
          _amount_cents: number
          _channel?: string
          _code: string
          _pin: string
          _reservation_token: string
        }
        Returns: {
          holder_id: string
          holder_name: string
          reservation_token: string
          reserved_cents: number
          voucher_code: string
        }[]
      }
      reserve_order_refund: {
        Args: {
          _amount_cents: number
          _card_amount_cents: number
          _cash_amount_cents: number
          _idempotency_key: string
          _order_id: string
          _provider: string
          _provider_transaction_id: string
          _reason: string
          _requested_by: string
        }
        Returns: {
          amount_cents: number
          card_amount_cents: number
          cash_amount_cents: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          order_id: string
          provider: string | null
          provider_transaction_id: string | null
          reason: string
          requested_by: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "order_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_counter_order_schedule: {
        Args: { _order_id: string; _scheduled_for: string }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_order_status: {
        Args: {
          _next: Database["public"]["Enums"]["order_status"]
          _order_id: string
        }
        Returns: {
          abandoned_at: string | null
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_name: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          deliveroo_order_id: string | null
          delivery_fee_cents: number
          delivery_notes: string | null
          discount_cents: number
          driver_id: string | null
          guest_token: string
          id: string
          idempotency_key: string | null
          inventory_posted_at: string | null
          juror_discount_cents: number
          jury_room: string | null
          loyalty_awarded: boolean
          loyalty_free_drinks_used: number
          loyalty_stamps_pending: number
          operator_id: string | null
          order_number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          points_earned: number
          pos_terminal: string | null
          postcode: string | null
          promo_code: string | null
          promo_discount_cents: number
          ready_at: string | null
          refunded_cents: number
          schedule_mode: string
          scheduled_for: string | null
          site_id: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          sumup_checkout_id: string | null
          sumup_order_ref: string | null
          sumup_reference: string | null
          sumup_transaction_id: string | null
          table_number: string | null
          till_shift_id: string | null
          total_cents: number
          tracking_token_hash: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          void_reason: string | null
          voucher_cents: number
          voucher_holder_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_promo_code: {
        Args: {
          _code: string
          _email?: string
          _order_type: string
          _subtotal_cents: number
        }
        Returns: {
          code: string
          discount_cents: number
          discount_type: Database["public"]["Enums"]["promo_discount_type"]
          discount_value: number
          message: string
          valid: boolean
        }[]
      }
      verify_account_code: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      verify_juror_voucher_credentials: {
        Args: { _code: string; _pin: string }
        Returns: {
          allocated_cents: number
          attendance_required: boolean
          attendance_verified: boolean
          code: string
          holder_id: string
          holder_name: string
          jury_room: string
          opted_in: boolean
          remaining_cents: number
          status: string
          used_cents: number
          valid_from: string
          valid_until: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "driver" | "customer"
      order_status:
        | "pending_payment"
        | "paid"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "completed"
        | "cancelled"
        | "refunded"
      order_type: "delivery" | "collection" | "dine_in"
      payment_status: "pending" | "paid" | "failed" | "refunded" | "on_account"
      promo_discount_type: "percent" | "fixed_amount" | "free_delivery"
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
      app_role: ["admin", "staff", "driver", "customer"],
      order_status: [
        "pending_payment",
        "paid",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
        "refunded",
      ],
      order_type: ["delivery", "collection", "dine_in"],
      payment_status: ["pending", "paid", "failed", "refunded", "on_account"],
      promo_discount_type: ["percent", "fixed_amount", "free_delivery"],
    },
  },
} as const
