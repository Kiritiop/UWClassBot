// Parses the text a student gets by selecting the whole Quest "My Class Schedule"
// list view page and copying it. Most of that paste is navigation chrome, filter
// labels and table headers; only the course headers and the class rows carry signal,
// so this scans for those two shapes and ignores everything else.

export interface ParsedSection {
  classNumber: string;
  sectionType: string;
  sectionNumber: string;
  meeting: string | null;
}

export interface ParsedCourse {
  subject: string;
  catalogNumber: string;
  title: string | null;
  sections: ParsedSection[];
}

// A Discord modal caps input at 4000 characters, but the parser is also called from
// tests and scripts, so bound the work: a pathological paste must not stall the bot.
const MAX_INPUT_CHARS = 20_000;
const MAX_COURSES = 30;
const MAX_SECTIONS_PER_COURSE = 20;

// "COMMST 100 - Interpersonal Communication", "SEQ 1 - Co-op Sequence 1".
// Catalog numbers follow the same loose shape the enrollment service accepts.
const COURSE_HEADER = /^([A-Za-z]{2,6})\s+(\d{1,4}[A-Za-z]{0,2})\s*[-–—]\s*(\S.*)$/;

const CLASS_NUMBER = /^\d{4,6}$/;
const SECTION_NUMBER = /^\d{3}$/;
const COMPONENT = /^[A-Z]{3}$/;

// Browsers that copy the table without tab separators collapse a whole row onto one line.
const FULL_ROW = /^(\d{4,6})\s+(\d{3})\s+([A-Z]{3})\s+(\S.*)$/;

// "MW 10:00AM - 11:20AM", "F 11:30AM - 12:20PM", or a bare time range.
const MEETING = /^(?:[MTWhFSU]{1,7}\s+)?\d{1,2}:\d{2}\s*[AP]M\s*[-–]\s*\d{1,2}:\d{2}\s*[AP]M/i;

function extractMeeting(raw: string): string | null {
  const text = raw.trim();
  if (/^TBA\b/i.test(text)) return 'TBA';
  const match = MEETING.exec(text);
  return match ? match[0].trim() : null;
}

// Quest rows arrive either one field per line or tab-separated, depending on the
// browser. Flattening both into one token stream lets a single scan handle each.
function tokenize(text: string): string[] {
  return text
    .slice(0, MAX_INPUT_CHARS)
    .split(/\r?\n/)
    .flatMap((line) => line.split('\t'))
    .map((token) => token.replace(/ /g, ' ').trim())
    .filter((token) => token.length > 0 && /[A-Za-z0-9]/.test(token));
}

export function parseQuestSchedule(text: string): ParsedCourse[] {
  const tokens = tokenize(text);
  const courses: ParsedCourse[] = [];
  let current: ParsedCourse | null = null;

  const addSection = (
    classNumber: string,
    sectionType: string,
    sectionNumber: string,
    meeting: string | null,
  ): void => {
    if (!current || current.sections.length >= MAX_SECTIONS_PER_COURSE) return;
    // Quest repeats a section when it has multiple meeting patterns, keep the first.
    const duplicate = current.sections.some(
      (s) => s.sectionType === sectionType && s.sectionNumber === sectionNumber,
    );
    if (duplicate) return;
    current.sections.push({ classNumber, sectionType, sectionNumber, meeting });
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    const header = COURSE_HEADER.exec(token);
    if (header) {
      if (courses.length >= MAX_COURSES) break;
      current = {
        subject: header[1].toUpperCase(),
        catalogNumber: header[2].toUpperCase(),
        title: header[3].trim() || null,
        sections: [],
      };
      courses.push(current);
      continue;
    }

    // Rows before the first course header are page chrome.
    if (!current) continue;

    const row = FULL_ROW.exec(token);
    if (row) {
      addSection(row[1], row[3], row[2], extractMeeting(row[4]));
      continue;
    }

    if (
      CLASS_NUMBER.test(token) &&
      SECTION_NUMBER.test(tokens[i + 1] ?? '') &&
      COMPONENT.test(tokens[i + 2] ?? '')
    ) {
      addSection(token, tokens[i + 2], tokens[i + 1], extractMeeting(tokens[i + 3] ?? ''));
      i += 2;
    }
  }

  // Courses with no rows are kept so the caller can flag a truncated or malformed paste.
  return courses;
}
