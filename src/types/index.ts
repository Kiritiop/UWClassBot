export interface Term {
  term_code: string;
  name: string;
  start_date: Date;
  end_date: Date;
  exam_end_date: Date;
  archive_date: Date;
  delete_date: Date;
  is_current: boolean;
}

export interface Course {
  id: number;
  subject: string;
  catalog_number: string;
  title: string;
  description: string | null;
  term_code: string;
}

export interface Section {
  id: number;
  course_id: number;
  section_type: string;
  section_number: string;
  instructor: string | null;
  days: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  class_number: number | null;
}

export interface User {
  discord_id: string;
  privacy_setting: 'handle_only' | 'show_name';
  real_name: string | null;
  program: string | null;
  year_level: string | null;
  joined_at: Date;
}

export interface Enrollment {
  id: number;
  user_id: string;
  section_id: number;
  enrolled_at: Date;
  active: boolean;
}

export interface DiscordChannel {
  id: number;
  guild_id: string | null;
  course_id: number;
  section_id: number | null;
  channel_id: string;
  role_id: string;
  is_archived: boolean;
  created_at: Date;
}

export interface WaitingList {
  id: number;
  user_id: string;
  section_id: number;
  created_at: Date;
}
