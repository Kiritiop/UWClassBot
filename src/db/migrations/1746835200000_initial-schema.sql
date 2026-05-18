-- migrate up

CREATE TABLE IF NOT EXISTS terms (
    term_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    exam_end_date DATE NOT NULL,
    archive_date DATE NOT NULL,
    delete_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    catalog_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    term_code TEXT NOT NULL REFERENCES terms(term_code),
    UNIQUE(subject, catalog_number, term_code)
);

CREATE TABLE IF NOT EXISTS sections (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_type TEXT NOT NULL,
    section_number TEXT NOT NULL,
    instructor TEXT,
    days TEXT,
    start_time TIME,
    end_time TIME,
    location TEXT,
    class_number INTEGER,
    UNIQUE(course_id, section_type, section_number)
);

CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    privacy_setting TEXT NOT NULL DEFAULT 'handle_only',
    real_name TEXT,
    program TEXT,
    year_level TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, section_id)
);

CREATE TABLE IF NOT EXISTS discord_channels (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL UNIQUE,
    role_id TEXT NOT NULL UNIQUE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waiting_lists (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_enrollments_section ON enrollments(section_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_courses_term ON courses(term_code);
CREATE INDEX IF NOT EXISTS idx_sections_course ON sections(course_id);
