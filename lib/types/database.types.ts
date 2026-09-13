// 손으로 작성한 임시 타입입니다.
// Supabase 프로젝트가 준비되면 아래 명령으로 교체하세요:
//   npx supabase gen types typescript --project-id <project-ref> > lib/types/database.types.ts
//
// 주의 1: 반드시 `type` 객체 리터럴로 선언할 것 — `interface`로 선언하면
// 암묵적 인덱스 시그니처가 없어 `extends Record<string, unknown>` 검사를
// 통과하지 못하고 Supabase 제네릭 쿼리 결과가 전부 `never`로 추론된다.
// 주의 2: 각 테이블에 `Relationships: []`(빈 배열이라도)를 반드시 넣을 것 —
// 이 필드가 없으면 postgrest-js의 GenericTable 제약을 만족하지 못해
// 역시 쿼리 결과가 전부 `never`로 추론된다. (`supabase gen types`가 생성하는
// 출력에는 항상 이 필드가 포함된다.)

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
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          title: string | null;
          google_email: string | null;
          phone: string | null;
          font_preference: "pretendard" | "system" | "gmarket" | "nanumsquare" | "noto" | "omudaye" | "lineseed" | "nanumsquareneo";
          sidebar_font_preference: "pretendard" | "system" | "gmarket" | "nanumsquare" | "noto" | "omudaye" | "lineseed" | "nanumsquareneo";
          role: "admin" | "member" | "guest";
          created_at: string;
          last_login_at: string | null;
          last_login_ip: string | null;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          title?: string | null;
          google_email?: string | null;
          phone?: string | null;
          font_preference?: "pretendard" | "system" | "gmarket" | "nanumsquare" | "noto" | "omudaye" | "lineseed" | "nanumsquareneo";
          sidebar_font_preference?: "pretendard" | "system" | "gmarket" | "nanumsquare" | "noto" | "omudaye" | "lineseed" | "nanumsquareneo";
          role?: "admin" | "member" | "guest";
          created_at?: string;
          last_login_at?: string | null;
          last_login_ip?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          title?: string | null;
          google_email?: string | null;
          phone?: string | null;
          font_preference?: "pretendard" | "system" | "gmarket" | "nanumsquare" | "noto" | "omudaye" | "lineseed" | "nanumsquareneo";
          sidebar_font_preference?: "pretendard" | "system" | "gmarket" | "nanumsquare" | "noto" | "omudaye" | "lineseed" | "nanumsquareneo";
          role?: "admin" | "member" | "guest";
          created_at?: string;
          last_login_at?: string | null;
          last_login_ip?: string | null;
        };
        Relationships: [];
      };
      google_calendar_connections: {
        Row: {
          user_id: string;
          google_email: string;
          refresh_token: string;
          access_token: string | null;
          access_token_expires_at: string | null;
          connected_at: string;
        };
        Insert: {
          user_id: string;
          google_email: string;
          refresh_token: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          connected_at?: string;
        };
        Update: {
          user_id?: string;
          google_email?: string;
          refresh_token?: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          connected_at?: string;
        };
        Relationships: [];
      };
      material_email_smtp_accounts: {
        Row: {
          user_id: string;
          smtp_user: string;
          smtp_password: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          smtp_user: string;
          smtp_password: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          smtp_user?: string;
          smtp_password?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      personal_api_tokens: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          token_hash: string;
          token_preview: string;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          token_hash: string;
          token_preview: string;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string | null;
          token_hash?: string;
          token_preview?: string;
          created_at?: string;
          last_used_at?: string | null;
        };
        Relationships: [];
      };
      google_drive_upload_connection: {
        Row: {
          id: boolean;
          google_email: string;
          refresh_token: string;
          access_token: string | null;
          access_token_expires_at: string | null;
          connected_by: string | null;
          connected_at: string;
        };
        Insert: {
          id?: boolean;
          google_email: string;
          refresh_token: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          connected_by?: string | null;
          connected_at?: string;
        };
        Update: {
          id?: boolean;
          google_email?: string;
          refresh_token?: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          connected_by?: string | null;
          connected_at?: string;
        };
        Relationships: [];
      };
      keywords: {
        Row: {
          id: string;
          naver_keyword_id: string;
          keyword: string;
          campaign_id: string | null;
          adgroup_id: string | null;
          status: string;
          is_excluded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          naver_keyword_id: string;
          keyword: string;
          campaign_id?: string | null;
          adgroup_id?: string | null;
          status?: string;
          is_excluded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          naver_keyword_id?: string;
          keyword?: string;
          campaign_id?: string | null;
          adgroup_id?: string | null;
          status?: string;
          is_excluded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      keyword_daily_metrics: {
        Row: {
          id: string;
          date: string;
          keyword_id: string;
          monthly_search_pc: number | null;
          monthly_search_mobile: number | null;
          avg_cpc: number | null;
          competition_level: string | null;
          our_rank: number | null;
          monthly_click_pc: number | null;
          monthly_click_mobile: number | null;
          spend_7d: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          keyword_id: string;
          monthly_search_pc?: number | null;
          monthly_search_mobile?: number | null;
          avg_cpc?: number | null;
          competition_level?: string | null;
          our_rank?: number | null;
          monthly_click_pc?: number | null;
          monthly_click_mobile?: number | null;
          spend_7d?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          keyword_id?: string;
          monthly_search_pc?: number | null;
          monthly_search_mobile?: number | null;
          avg_cpc?: number | null;
          competition_level?: string | null;
          our_rank?: number | null;
          monthly_click_pc?: number | null;
          monthly_click_mobile?: number | null;
          spend_7d?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ad_account_daily_stats: {
        Row: {
          id: string;
          date: string;
          imp_cnt: number;
          clk_cnt: number;
          ccnt: number;
          sales_amt: number;
          ctr: number | null;
          cpc: number | null;
          bizmoney: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          imp_cnt?: number;
          clk_cnt?: number;
          ccnt?: number;
          sales_amt?: number;
          ctr?: number | null;
          cpc?: number | null;
          bizmoney?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          imp_cnt?: number;
          clk_cnt?: number;
          ccnt?: number;
          sales_amt?: number;
          ctr?: number | null;
          cpc?: number | null;
          bizmoney?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      competitors: {
        Row: {
          id: string;
          name: string;
          domain: string | null;
          blog_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          domain?: string | null;
          blog_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          domain?: string | null;
          blog_id?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      ad_spend_estimates: {
        Row: {
          id: string;
          date: string;
          competitor_id: string;
          keyword_id: string;
          estimated_monthly_spend: number;
          calc_basis: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          competitor_id: string;
          keyword_id: string;
          estimated_monthly_spend: number;
          calc_basis?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          competitor_id?: string;
          keyword_id?: string;
          estimated_monthly_spend?: number;
          calc_basis?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      blog_posts: {
        Row: {
          id: string;
          competitor_id: string;
          url: string;
          title: string | null;
          published_at: string | null;
          collected_at: string;
        };
        Insert: {
          id?: string;
          competitor_id: string;
          url: string;
          title?: string | null;
          published_at?: string | null;
          collected_at?: string;
        };
        Update: {
          id?: string;
          competitor_id?: string;
          url?: string;
          title?: string | null;
          published_at?: string | null;
          collected_at?: string;
        };
        Relationships: [];
      };
      blog_sov_daily: {
        Row: {
          id: string;
          date: string;
          keyword_id: string;
          competitor_id: string;
          share_pct: number;
        };
        Insert: {
          id?: string;
          date: string;
          keyword_id: string;
          competitor_id: string;
          share_pct: number;
        };
        Update: {
          id?: string;
          date?: string;
          keyword_id?: string;
          competitor_id?: string;
          share_pct?: number;
        };
        Relationships: [];
      };
      posting_cadence: {
        Row: {
          id: string;
          date: string;
          competitor_id: string;
          avg_interval_days: number | null;
          last_post_at: string | null;
          post_count_30d: number | null;
        };
        Insert: {
          id?: string;
          date: string;
          competitor_id: string;
          avg_interval_days?: number | null;
          last_post_at?: string | null;
          post_count_30d?: number | null;
        };
        Update: {
          id?: string;
          date?: string;
          competitor_id?: string;
          avg_interval_days?: number | null;
          last_post_at?: string | null;
          post_count_30d?: number | null;
        };
        Relationships: [];
      };
      pipeline_runs: {
        Row: {
          id: string;
          date: string;
          track: "ad" | "blog";
          status: "success" | "partial" | "failed";
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          track: "ad" | "blog";
          status: "success" | "partial" | "failed";
          message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          track?: "ad" | "blog";
          status?: "success" | "partial" | "failed";
          message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_reports: {
        Row: {
          id: string;
          date: string;
          report_type: "daily" | "weekly" | "monthly";
          track: "ad" | "blog" | "combined";
          title: string;
          content_md: string;
          source_refs: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          report_type: "daily" | "weekly" | "monthly";
          track: "ad" | "blog" | "combined";
          title: string;
          content_md: string;
          source_refs?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          report_type?: "daily" | "weekly" | "monthly";
          track?: "ad" | "blog" | "combined";
          title?: string;
          content_md?: string;
          source_refs?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          id: string;
          date: string;
          severity: "info" | "warning" | "critical";
          category: string;
          message: string;
          evidence_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          severity: "info" | "warning" | "critical";
          category: string;
          message: string;
          evidence_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          severity?: "info" | "warning" | "critical";
          category?: string;
          message?: string;
          evidence_ref?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ad_strategy_memos: {
        Row: {
          id: string;
          author_id: string;
          author_email: string;
          category: "business" | "cooperation" | "marketing" | "etc";
          title: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          author_email: string;
          category: "business" | "cooperation" | "marketing" | "etc";
          title: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          author_email?: string;
          category?: "business" | "cooperation" | "marketing" | "etc";
          title?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ad_strategy_memo_attachments: {
        Row: {
          id: string;
          memo_id: string;
          file_name: string;
          storage_path: string | null;
          drive_file_id: string | null;
          file_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          memo_id: string;
          file_name: string;
          storage_path?: string | null;
          drive_file_id?: string | null;
          file_size?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          memo_id?: string;
          file_name?: string;
          storage_path?: string | null;
          drive_file_id?: string | null;
          file_size?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ad_strategy_memo_comments: {
        Row: {
          id: string;
          memo_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          memo_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          memo_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      news_articles: {
        Row: {
          id: string;
          keyword: string;
          title: string;
          link: string;
          description: string | null;
          published_at: string | null;
          collected_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          keyword: string;
          title: string;
          link: string;
          description?: string | null;
          published_at?: string | null;
          collected_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          keyword?: string;
          title?: string;
          link?: string;
          description?: string | null;
          published_at?: string | null;
          collected_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      budget_bids: {
        Row: {
          id: string;
          keyword: string;
          business_type: "cnstwk" | "servc" | "thng";
          bid_no: string;
          bid_ord: string;
          title: string;
          notice_inst: string | null;
          demand_inst: string | null;
          budget_amount: number | null;
          presmpt_price: number | null;
          notice_date: string | null;
          opening_date: string | null;
          detail_url: string | null;
          collected_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          keyword: string;
          business_type: "cnstwk" | "servc" | "thng";
          bid_no: string;
          bid_ord?: string;
          title: string;
          notice_inst?: string | null;
          demand_inst?: string | null;
          budget_amount?: number | null;
          presmpt_price?: number | null;
          notice_date?: string | null;
          opening_date?: string | null;
          detail_url?: string | null;
          collected_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          keyword?: string;
          business_type?: "cnstwk" | "servc" | "thng";
          bid_no?: string;
          bid_ord?: string;
          title?: string;
          notice_inst?: string | null;
          demand_inst?: string | null;
          budget_amount?: number | null;
          presmpt_price?: number | null;
          notice_date?: string | null;
          opening_date?: string | null;
          detail_url?: string | null;
          collected_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      prespec_notices: {
        Row: {
          id: string;
          keyword: string;
          business_type: "cnstwk" | "servc" | "thng";
          pre_spec_reg_no: string;
          title: string;
          ref_no: string | null;
          notice_inst: string | null;
          demand_inst: string | null;
          budget_amount: number | null;
          registered_at: string | null;
          opinion_close_at: string | null;
          official_name: string | null;
          official_tel: string | null;
          spec_doc_urls: string[];
          bid_notice_nos: string[];
          collected_at: string;
        };
        Insert: {
          id?: string;
          keyword: string;
          business_type: "cnstwk" | "servc" | "thng";
          pre_spec_reg_no: string;
          title: string;
          ref_no?: string | null;
          notice_inst?: string | null;
          demand_inst?: string | null;
          budget_amount?: number | null;
          registered_at?: string | null;
          opinion_close_at?: string | null;
          official_name?: string | null;
          official_tel?: string | null;
          spec_doc_urls?: string[];
          bid_notice_nos?: string[];
          collected_at?: string;
        };
        Update: {
          id?: string;
          keyword?: string;
          business_type?: "cnstwk" | "servc" | "thng";
          pre_spec_reg_no?: string;
          title?: string;
          ref_no?: string | null;
          notice_inst?: string | null;
          demand_inst?: string | null;
          budget_amount?: number | null;
          registered_at?: string | null;
          opinion_close_at?: string | null;
          official_name?: string | null;
          official_tel?: string | null;
          spec_doc_urls?: string[];
          bid_notice_nos?: string[];
          collected_at?: string;
        };
        Relationships: [];
      };
      notice_scraps: {
        Row: {
          id: string;
          user_id: string;
          notice_type: "budget" | "prespec" | "news";
          notice_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          notice_type: "budget" | "prespec" | "news";
          notice_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          notice_type?: "budget" | "prespec" | "news";
          notice_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      monitor_keywords: {
        Row: {
          id: string;
          track: "news" | "budget";
          keyword: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          track: "news" | "budget";
          keyword: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          track?: "news" | "budget";
          keyword?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      youtube_channel_stats: {
        Row: {
          id: string;
          date: string;
          subscriber_count: number;
          view_count: number;
          video_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          subscriber_count?: number;
          view_count?: number;
          video_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          subscriber_count?: number;
          view_count?: number;
          video_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      youtube_videos: {
        Row: {
          id: string;
          video_id: string;
          title: string;
          published_at: string | null;
          view_count: number;
          like_count: number;
          comment_count: number;
          duration_seconds: number | null;
          thumbnail_url: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          title: string;
          published_at?: string | null;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          duration_seconds?: number | null;
          thumbnail_url?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          title?: string;
          published_at?: string | null;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          duration_seconds?: number | null;
          thumbnail_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_events: {
        Row: {
          id: string;
          notion_page_id: string;
          title: string;
          date_start: string;
          date_end: string | null;
          is_datetime: boolean;
          category: string | null;
          tags: string[];
          target: string | null;
          location: string | null;
          content: string | null;
          assignees: string[];
          attendees: string[];
          notion_url: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          notion_page_id: string;
          title: string;
          date_start: string;
          date_end?: string | null;
          is_datetime?: boolean;
          category?: string | null;
          tags?: string[];
          target?: string | null;
          location?: string | null;
          content?: string | null;
          assignees?: string[];
          attendees?: string[];
          notion_url: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          notion_page_id?: string;
          title?: string;
          date_start?: string;
          date_end?: string | null;
          is_datetime?: boolean;
          category?: string | null;
          tags?: string[];
          target?: string | null;
          location?: string | null;
          content?: string | null;
          assignees?: string[];
          attendees?: string[];
          notion_url?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_events_v2: {
        Row: {
          id: string;
          title: string;
          date_start: string;
          date_end: string | null;
          is_datetime: boolean;
          category: string | null;
          tags: string[];
          target: string | null;
          location: string | null;
          content: string | null;
          assignees: string[];
          attendees: string[];
          google_event_id: string | null;
          google_event_owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date_start: string;
          date_end?: string | null;
          is_datetime?: boolean;
          category?: string | null;
          tags?: string[];
          target?: string | null;
          location?: string | null;
          content?: string | null;
          assignees?: string[];
          attendees?: string[];
          google_event_id?: string | null;
          google_event_owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          date_start?: string;
          date_end?: string | null;
          is_datetime?: boolean;
          category?: string | null;
          tags?: string[];
          target?: string | null;
          location?: string | null;
          content?: string | null;
          assignees?: string[];
          attendees?: string[];
          google_event_id?: string | null;
          google_event_owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_projects: {
        Row: {
          id: string;
          notion_page_id: string;
          title: string;
          stage: string | null;
          status: string | null;
          org_name: string | null;
          participation_type: string | null;
          work_type: string | null;
          result: string | null;
          amount: number | null;
          progress_rate: number | null;
          submission_date: string | null;
          submission_date_is_datetime: boolean;
          submission_method: string | null;
          presentation_date: string | null;
          presentation_date_is_datetime: boolean;
          construction_start: string | null;
          construction_end: string | null;
          construction_content: string | null;
          assignees: string[];
          created_by: string | null;
          notion_created_at: string | null;
          notion_url: string;
          synced_at: string;
        };
        Insert: {
          id?: string;
          notion_page_id: string;
          title: string;
          stage?: string | null;
          status?: string | null;
          org_name?: string | null;
          participation_type?: string | null;
          work_type?: string | null;
          result?: string | null;
          amount?: number | null;
          progress_rate?: number | null;
          submission_date?: string | null;
          submission_date_is_datetime?: boolean;
          submission_method?: string | null;
          presentation_date?: string | null;
          presentation_date_is_datetime?: boolean;
          construction_start?: string | null;
          construction_end?: string | null;
          construction_content?: string | null;
          assignees?: string[];
          created_by?: string | null;
          notion_created_at?: string | null;
          notion_url: string;
          synced_at?: string;
        };
        Update: {
          id?: string;
          notion_page_id?: string;
          title?: string;
          stage?: string | null;
          status?: string | null;
          org_name?: string | null;
          participation_type?: string | null;
          work_type?: string | null;
          result?: string | null;
          amount?: number | null;
          progress_rate?: number | null;
          submission_date?: string | null;
          submission_date_is_datetime?: boolean;
          submission_method?: string | null;
          presentation_date?: string | null;
          presentation_date_is_datetime?: boolean;
          construction_start?: string | null;
          construction_end?: string | null;
          construction_content?: string | null;
          assignees?: string[];
          created_by?: string | null;
          notion_created_at?: string | null;
          notion_url?: string;
          synced_at?: string;
        };
        Relationships: [];
      };
      business_projects_v2: {
        Row: {
          id: string;
          title: string;
          stage: string | null;
          status: string;
          org_name: string | null;
          participation_type: string | null;
          work_type: string | null;
          result: string | null;
          amount: number | null;
          progress_rate: number | null;
          submission_date: string | null;
          submission_date_is_datetime: boolean;
          submission_method: string | null;
          presentation_date: string | null;
          presentation_date_is_datetime: boolean;
          construction_start: string | null;
          construction_end: string | null;
          construction_content: string | null;
          assignees: string[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          stage?: string | null;
          status?: string;
          org_name?: string | null;
          participation_type?: string | null;
          work_type?: string | null;
          result?: string | null;
          amount?: number | null;
          progress_rate?: number | null;
          submission_date?: string | null;
          submission_date_is_datetime?: boolean;
          submission_method?: string | null;
          presentation_date?: string | null;
          presentation_date_is_datetime?: boolean;
          construction_start?: string | null;
          construction_end?: string | null;
          construction_content?: string | null;
          assignees?: string[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          stage?: string | null;
          status?: string;
          org_name?: string | null;
          participation_type?: string | null;
          work_type?: string | null;
          result?: string | null;
          amount?: number | null;
          progress_rate?: number | null;
          submission_date?: string | null;
          submission_date_is_datetime?: boolean;
          submission_method?: string | null;
          presentation_date?: string | null;
          presentation_date_is_datetime?: boolean;
          construction_start?: string | null;
          construction_end?: string | null;
          construction_content?: string | null;
          assignees?: string[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_projects_v2_comments: {
        Row: {
          id: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      business_projects_v2_favorites: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      business_projects_v2_history: {
        Row: {
          id: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_projects_v2_history_attachments: {
        Row: {
          id: string;
          history_id: string;
          file_name: string;
          content_type: string | null;
          storage_path: string | null;
          drive_file_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          history_id: string;
          file_name: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          history_id?: string;
          file_name?: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      youth_facilities: {
        Row: {
          id: string;
          facility_name: string;
          representative_name: string | null;
          operating_body: string | null;
          operation_mode: string | null;
          foundation_subject: string | null;
          foundation_org_detail: string | null;
          installation_type: string | null;
          facility_type: string | null;
          province_name: string | null;
          district_name: string | null;
          road_address: string | null;
          lot_address: string | null;
          latitude: number | null;
          longitude: number | null;
          homepage_url: string | null;
          phone_number: string | null;
          fax_number: string | null;
          email: string | null;
          operating_hours: string | null;
          holiday_info: string | null;
          has_parking: boolean | null;
          capacity_count: number | null;
          overnight_capacity_count: number | null;
          stay_capacity_count: number | null;
          companion_capacity_count: number | null;
          first_registered_date: string | null;
          reference_date: string | null;
          is_exposed: boolean | null;
          remarks: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          facility_name: string;
          representative_name?: string | null;
          operating_body?: string | null;
          operation_mode?: string | null;
          foundation_subject?: string | null;
          foundation_org_detail?: string | null;
          installation_type?: string | null;
          facility_type?: string | null;
          province_name?: string | null;
          district_name?: string | null;
          road_address?: string | null;
          lot_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          homepage_url?: string | null;
          phone_number?: string | null;
          fax_number?: string | null;
          email?: string | null;
          operating_hours?: string | null;
          holiday_info?: string | null;
          has_parking?: boolean | null;
          capacity_count?: number | null;
          overnight_capacity_count?: number | null;
          stay_capacity_count?: number | null;
          companion_capacity_count?: number | null;
          first_registered_date?: string | null;
          reference_date?: string | null;
          is_exposed?: boolean | null;
          remarks?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          facility_name?: string;
          representative_name?: string | null;
          operating_body?: string | null;
          operation_mode?: string | null;
          foundation_subject?: string | null;
          foundation_org_detail?: string | null;
          installation_type?: string | null;
          facility_type?: string | null;
          province_name?: string | null;
          district_name?: string | null;
          road_address?: string | null;
          lot_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          homepage_url?: string | null;
          phone_number?: string | null;
          fax_number?: string | null;
          email?: string | null;
          operating_hours?: string | null;
          holiday_info?: string | null;
          has_parking?: boolean | null;
          capacity_count?: number | null;
          overnight_capacity_count?: number | null;
          stay_capacity_count?: number | null;
          companion_capacity_count?: number | null;
          first_registered_date?: string | null;
          reference_date?: string | null;
          is_exposed?: boolean | null;
          remarks?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      disability_organizations: {
        Row: {
          id: string;
          group_name: string;
          province_name: string | null;
          district_name: string | null;
          road_address: string | null;
          lot_address: string | null;
          foundation_date: string | null;
          member_count: number | null;
          phone_number: string | null;
          representative_name: string | null;
          reference_date: string | null;
          provider_org_code: string | null;
          provider_org_name: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          group_name: string;
          province_name?: string | null;
          district_name?: string | null;
          road_address?: string | null;
          lot_address?: string | null;
          foundation_date?: string | null;
          member_count?: number | null;
          phone_number?: string | null;
          representative_name?: string | null;
          reference_date?: string | null;
          provider_org_code?: string | null;
          provider_org_name?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          group_name?: string;
          province_name?: string | null;
          district_name?: string | null;
          road_address?: string | null;
          lot_address?: string | null;
          foundation_date?: string | null;
          member_count?: number | null;
          phone_number?: string | null;
          representative_name?: string | null;
          reference_date?: string | null;
          provider_org_code?: string | null;
          provider_org_name?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      disability_sports_facilities: {
        Row: {
          id: string;
          facility_name: string;
          province_name: string | null;
          district_name: string | null;
          operating_body: string | null;
          phone_number: string | null;
          homepage_url: string | null;
          has_voucher_program: boolean | null;
          has_bandabi_facility: boolean | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          facility_name: string;
          province_name?: string | null;
          district_name?: string | null;
          operating_body?: string | null;
          phone_number?: string | null;
          homepage_url?: string | null;
          has_voucher_program?: boolean | null;
          has_bandabi_facility?: boolean | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          facility_name?: string;
          province_name?: string | null;
          district_name?: string | null;
          operating_body?: string | null;
          phone_number?: string | null;
          homepage_url?: string | null;
          has_voucher_program?: boolean | null;
          has_bandabi_facility?: boolean | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      disability_welfare_centers: {
        Row: {
          id: string;
          facility_name: string;
          facility_type: string | null;
          province_name: string | null;
          road_address: string | null;
          latitude: number | null;
          longitude: number | null;
          operating_status: string | null;
          establishment_date: string | null;
          welfare_facility_id: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          facility_name: string;
          facility_type?: string | null;
          province_name?: string | null;
          road_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          operating_status?: string | null;
          establishment_date?: string | null;
          welfare_facility_id?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          facility_name?: string;
          facility_type?: string | null;
          province_name?: string | null;
          road_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          operating_status?: string | null;
          establishment_date?: string | null;
          welfare_facility_id?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      special_schools: {
        Row: {
          id: string;
          school_name: string;
          province_name: string | null;
          foundation_type: string | null;
          disability_domain: string | null;
          principal_name: string | null;
          approval_date: string | null;
          opening_date: string | null;
          principal_office_phone: string | null;
          admin_office_phone: string | null;
          teacher_office_phone: string | null;
          fax_number: string | null;
          zip_code: string | null;
          address: string | null;
          homepage_url: string | null;
          reference_date: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          school_name: string;
          province_name?: string | null;
          foundation_type?: string | null;
          disability_domain?: string | null;
          principal_name?: string | null;
          approval_date?: string | null;
          opening_date?: string | null;
          principal_office_phone?: string | null;
          admin_office_phone?: string | null;
          teacher_office_phone?: string | null;
          fax_number?: string | null;
          zip_code?: string | null;
          address?: string | null;
          homepage_url?: string | null;
          reference_date?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          school_name?: string;
          province_name?: string | null;
          foundation_type?: string | null;
          disability_domain?: string | null;
          principal_name?: string | null;
          approval_date?: string | null;
          opening_date?: string | null;
          principal_office_phone?: string | null;
          admin_office_phone?: string | null;
          teacher_office_phone?: string | null;
          fax_number?: string | null;
          zip_code?: string | null;
          address?: string | null;
          homepage_url?: string | null;
          reference_date?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      public_institutions: {
        Row: {
          id: string;
          site_name: string;
          institution_type: string | null;
          institution_category: string | null;
          detail_category: string | null;
          site_type: string | null;
          url: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          site_name: string;
          institution_type?: string | null;
          institution_category?: string | null;
          detail_category?: string | null;
          site_type?: string | null;
          url?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          site_name?: string;
          institution_type?: string | null;
          institution_category?: string | null;
          detail_category?: string | null;
          site_type?: string | null;
          url?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      senior_welfare_facilities: {
        Row: {
          id: string;
          facility_name: string;
          facility_type: string | null;
          province_name: string | null;
          road_address: string | null;
          lot_address: string | null;
          latitude: number | null;
          longitude: number | null;
          business_status: string | null;
          phone_number: string | null;
          managing_org_name: string | null;
          providing_inst_name: string | null;
          reference_date: string | null;
          synced_at: string;
        };
        Insert: {
          id?: string;
          facility_name: string;
          facility_type?: string | null;
          province_name?: string | null;
          road_address?: string | null;
          lot_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          business_status?: string | null;
          phone_number?: string | null;
          managing_org_name?: string | null;
          providing_inst_name?: string | null;
          reference_date?: string | null;
          synced_at?: string;
        };
        Update: {
          id?: string;
          facility_name?: string;
          facility_type?: string | null;
          province_name?: string | null;
          road_address?: string | null;
          lot_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          business_status?: string | null;
          phone_number?: string | null;
          managing_org_name?: string | null;
          providing_inst_name?: string | null;
          reference_date?: string | null;
          synced_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          type: "event" | "business" | "youtube" | "budget_low" | "memo" | "budget_scrap" | "prespec_scrap" | "news_scrap" | "cooperation" | "marketing" | "quotation" | "meeting_note" | "ai_review";
          title: string;
          message: string | null;
          link: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: "event" | "business" | "youtube" | "budget_low" | "memo" | "budget_scrap" | "prespec_scrap" | "news_scrap" | "cooperation" | "marketing" | "quotation" | "meeting_note" | "ai_review";
          title: string;
          message?: string | null;
          link?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: "event" | "business" | "youtube" | "budget_low" | "memo" | "budget_scrap" | "prespec_scrap" | "news_scrap" | "cooperation" | "marketing" | "quotation" | "meeting_note" | "ai_review";
          title?: string;
          message?: string | null;
          link?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notification_reads: {
        Row: {
          notification_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          notification_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: {
          notification_id?: string;
          user_id?: string;
          read_at?: string;
        };
        Relationships: [];
      };
      product_catalog: {
        Row: {
          id: string;
          source_row: number | null;
          name: string;
          specification: string | null;
          unit_price: number | null;
          note: string | null;
          commission_rate: number | null;
          margin_rate: number | null;
          supply_type: "partner" | "direct";
          reference: string | null;
          procurement: boolean;
          procurement_channel: string | null;
          procurement_number: string | null;
          procurement_fee_rate: number | null;
          needs_review: boolean;
          supplier_vendor_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_row?: number | null;
          name: string;
          specification?: string | null;
          unit_price?: number | null;
          note?: string | null;
          commission_rate?: number | null;
          margin_rate?: number | null;
          supply_type?: "partner" | "direct";
          reference?: string | null;
          procurement?: boolean;
          procurement_channel?: string | null;
          procurement_number?: string | null;
          procurement_fee_rate?: number | null;
          needs_review?: boolean;
          supplier_vendor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_row?: number | null;
          name?: string;
          specification?: string | null;
          unit_price?: number | null;
          note?: string | null;
          commission_rate?: number | null;
          margin_rate?: number | null;
          supply_type?: "partner" | "direct";
          reference?: string | null;
          procurement?: boolean;
          procurement_channel?: string | null;
          procurement_number?: string | null;
          procurement_fee_rate?: number | null;
          needs_review?: boolean;
          supplier_vendor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_catalog_favorites: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      product_catalog_user_order: {
        Row: {
          user_id: string;
          product_ids: string[];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          product_ids?: string[];
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          product_ids?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_vendors: {
        Row: {
          id: string;
          company_name: string;
          business_number: string | null;
          representative_name: string | null;
          business_type: string | null;
          business_item: string | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          bank_name: string | null;
          account_number: string | null;
          account_holder: string | null;
          contact_name: string | null;
          contact_title: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name: string;
          business_number?: string | null;
          representative_name?: string | null;
          business_type?: string | null;
          business_item?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          bank_name?: string | null;
          account_number?: string | null;
          account_holder?: string | null;
          contact_name?: string | null;
          contact_title?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_name?: string;
          business_number?: string | null;
          representative_name?: string | null;
          business_type?: string | null;
          business_item?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          bank_name?: string | null;
          account_number?: string | null;
          account_holder?: string | null;
          contact_name?: string | null;
          contact_title?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vendor_documents: {
        Row: {
          id: string;
          vendor_id: string;
          document_type: "business_registration" | "bankbook" | "business_card" | "product_material";
          original_name: string;
          storage_path: string | null;
          drive_file_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          document_type: "business_registration" | "bankbook" | "business_card" | "product_material";
          original_name: string;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          document_type?: "business_registration" | "bankbook" | "business_card" | "product_material";
          original_name?: string;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cooperation_projects: {
        Row: {
          id: string;
          title: string;
          company: string | null;
          relation_type: string | null;
          work_type: string | null;
          status: string;
          project_start_date: string | null;
          project_end_date: string | null;
          project_date_is_datetime: boolean;
          main_assignees: string[];
          sub_assignees: string[];
          content: string | null;
          ai_keywords: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          company?: string | null;
          relation_type?: string | null;
          work_type?: string | null;
          status?: string;
          project_start_date?: string | null;
          project_end_date?: string | null;
          project_date_is_datetime?: boolean;
          main_assignees?: string[];
          sub_assignees?: string[];
          content?: string | null;
          ai_keywords?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          company?: string | null;
          relation_type?: string | null;
          work_type?: string | null;
          status?: string;
          project_start_date?: string | null;
          project_end_date?: string | null;
          project_date_is_datetime?: boolean;
          main_assignees?: string[];
          sub_assignees?: string[];
          content?: string | null;
          ai_keywords?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cooperation_projects_comments: {
        Row: {
          id: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cooperation_projects_favorites: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cooperation_projects_history: {
        Row: {
          id: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cooperation_projects_history_attachments: {
        Row: {
          id: string;
          history_id: string;
          file_name: string;
          content_type: string | null;
          storage_path: string | null;
          drive_file_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          history_id: string;
          file_name: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          history_id?: string;
          file_name?: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      marketing_tasks: {
        Row: {
          id: string;
          title: string;
          content: string | null;
          category: string | null;
          work_type: string | null;
          stage: string | null;
          status: string;
          due_date: string | null;
          due_date_end: string | null;
          due_date_is_datetime: boolean;
          assignees: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content?: string | null;
          category?: string | null;
          work_type?: string | null;
          stage?: string | null;
          status?: string;
          due_date?: string | null;
          due_date_end?: string | null;
          due_date_is_datetime?: boolean;
          assignees?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string | null;
          category?: string | null;
          work_type?: string | null;
          stage?: string | null;
          status?: string;
          due_date?: string | null;
          due_date_end?: string | null;
          due_date_is_datetime?: boolean;
          assignees?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_tasks_comments: {
        Row: {
          id: string;
          task_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      marketing_tasks_favorites: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          task_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          task_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      marketing_tasks_history: {
        Row: {
          id: string;
          task_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      marketing_tasks_history_attachments: {
        Row: {
          id: string;
          history_id: string;
          file_name: string;
          content_type: string | null;
          storage_path: string | null;
          drive_file_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          history_id: string;
          file_name: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          history_id?: string;
          file_name?: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      material_email_logs: {
        Row: {
          id: string;
          sender_id: string;
          sender_email: string;
          recipient_emails: string[];
          subject: string;
          message: string;
          file_names: string[];
          file_links: string[];
          quotation_id: string | null;
          quotation_quote_number: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          sender_email: string;
          recipient_emails: string[];
          subject: string;
          message: string;
          file_names?: string[];
          file_links?: string[];
          quotation_id?: string | null;
          quotation_quote_number?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          sender_email?: string;
          recipient_emails?: string[];
          subject?: string;
          message?: string;
          file_names?: string[];
          file_links?: string[];
          quotation_id?: string | null;
          quotation_quote_number?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_tools: {
        Row: {
          id: string;
          author_id: string;
          author_email: string;
          title: string;
          url: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          author_email: string;
          title: string;
          url: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          author_email?: string;
          title?: string;
          url?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_reviews: {
        Row: {
          id: string;
          author_id: string;
          author_email: string;
          title: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          author_email: string;
          title: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          author_email?: string;
          title?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_review_comments: {
        Row: {
          id: string;
          review_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          review_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          review_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_issues: {
        Row: {
          id: string;
          title: string;
          link: string;
          description: string | null;
          summary: string | null;
          source_query: string | null;
          published_at: string | null;
          issue_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          link: string;
          description?: string | null;
          summary?: string | null;
          source_query?: string | null;
          published_at?: string | null;
          issue_date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          link?: string;
          description?: string | null;
          summary?: string | null;
          source_query?: string | null;
          published_at?: string | null;
          issue_date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      meeting_notes: {
        Row: {
          id: string;
          author_id: string;
          author_email: string;
          title: string;
          meeting_date: string | null;
          attendees: string | null;
          location: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          author_email: string;
          title: string;
          meeting_date?: string | null;
          attendees?: string | null;
          location?: string | null;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          author_email?: string;
          title?: string;
          meeting_date?: string | null;
          attendees?: string | null;
          location?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      meeting_note_comments: {
        Row: {
          id: string;
          note_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id: string;
          author_id: string;
          author_email: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          note_id?: string;
          author_id?: string;
          author_email?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      work_journal_entries: {
        Row: {
          id: string;
          author_name: string;
          week_label: string | null;
          entry_date: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_name: string;
          week_label?: string | null;
          entry_date?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_name?: string;
          week_label?: string | null;
          entry_date?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      work_journal_attachments: {
        Row: {
          id: string;
          entry_id: string;
          file_name: string;
          content_type: string | null;
          storage_path: string | null;
          drive_file_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          file_name: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          file_name?: string;
          content_type?: string | null;
          storage_path?: string | null;
          drive_file_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      quotations: {
        Row: {
          id: string;
          quote_number: string;
          customer_name: string;
          project_title: string | null;
          business_project_id: string | null;
          quote_date: string;
          valid_until: string | null;
          manager_name: string | null;
          items: Json;
          discount_amount: number;
          extra_amount: number;
          subtotal_amount: number;
          supply_amount: number;
          tax_amount: number;
          procurement_fee_amount: number;
          total_amount: number;
          memo: string | null;
          include_stamp: boolean;
          execution_type: "직영" | "컨소" | "해당없음";
          consortium_company: string | null;
          consortium_rate: number;
          extra_internal_cost: number;
          status: "draft" | "final";
          created_by: string | null;
          created_by_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          quote_number: string;
          customer_name: string;
          project_title?: string | null;
          business_project_id?: string | null;
          quote_date?: string;
          valid_until?: string | null;
          manager_name?: string | null;
          items?: Json;
          discount_amount?: number;
          extra_amount?: number;
          subtotal_amount?: number;
          supply_amount?: number;
          tax_amount?: number;
          procurement_fee_amount?: number;
          total_amount?: number;
          memo?: string | null;
          include_stamp?: boolean;
          execution_type?: "직영" | "컨소" | "해당없음";
          consortium_company?: string | null;
          consortium_rate?: number;
          extra_internal_cost?: number;
          status?: "draft" | "final";
          created_by?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          quote_number?: string;
          customer_name?: string;
          project_title?: string | null;
          business_project_id?: string | null;
          quote_date?: string;
          valid_until?: string | null;
          manager_name?: string | null;
          items?: Json;
          discount_amount?: number;
          extra_amount?: number;
          subtotal_amount?: number;
          supply_amount?: number;
          tax_amount?: number;
          procurement_fee_amount?: number;
          total_amount?: number;
          memo?: string | null;
          include_stamp?: boolean;
          execution_type?: "직영" | "컨소" | "해당없음";
          consortium_company?: string | null;
          consortium_rate?: number;
          extra_internal_cost?: number;
          status?: "draft" | "final";
          created_by?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      todos: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          due_date: string | null;
          priority: "high" | "medium" | "low";
          is_completed: boolean;
          completed_at: string | null;
          alarm_at: string | null;
          alarm_sent: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          due_date?: string | null;
          priority?: "high" | "medium" | "low";
          is_completed?: boolean;
          completed_at?: string | null;
          alarm_at?: string | null;
          alarm_sent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          due_date?: string | null;
          priority?: "high" | "medium" | "low";
          is_completed?: boolean;
          completed_at?: string | null;
          alarm_at?: string | null;
          alarm_sent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_push_queue: {
        Row: {
          id: string;
          notification_id: string;
          processed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          notification_id: string;
          processed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          notification_id?: string;
          processed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // profiles의 select RLS를 우회해 id/name만 노출하는 뷰(0067) —
      // lib/queries/teamMembers.ts::getTeamMemberNames() 전용.
      team_member_names: {
        Row: {
          id: string;
          name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
