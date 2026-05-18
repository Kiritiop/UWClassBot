import { z } from 'zod';

// ── Courses endpoint (/v3/Courses/{termCode}) ─────────────────────────────────

export const UWCourseSchema = z.object({
  courseId: z.string(),
  courseOfferNumber: z.number(),
  termCode: z.string(),
  termName: z.string(),
  subjectCode: z.string(),
  catalogNumber: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  requirementsDescription: z.string().nullable().optional(),
}).passthrough();

export type UWCourse = z.infer<typeof UWCourseSchema>;

export const UWCoursesResponseSchema = z.array(UWCourseSchema);

// ── Terms endpoint (/v3/Terms) ────────────────────────────────────────────────

export const UWTermSchema = z.object({
  termCode: z.string(),
  name: z.string(),
  termBeginDate: z.string(),
  termEndDate: z.string(),
  sixtyPercentCompleteDate: z.string().nullable().optional(),
}).passthrough();

export type UWTerm = z.infer<typeof UWTermSchema>;

export const UWTermsResponseSchema = z.array(UWTermSchema);

// ── ClassSchedules list endpoint (/v3/ClassSchedules/{termCode}) ──────────────
// Returns a plain array of courseId strings

export const UWClassScheduleIdsSchema = z.array(z.string());

// ── Section schedule/instructor sub-schemas ───────────────────────────────────

const UWScheduleEntrySchema = z.object({
  scheduleStartDate: z.string().nullable().optional(),
  scheduleEndDate: z.string().nullable().optional(),
  classMeetingDayPatternCode: z.string().nullable().optional(),
  classMeetingStartTime: z.string().nullable().optional(),
  classMeetingEndTime: z.string().nullable().optional(),
  instructionModeName: z.string().nullable().optional(),
  buildingCode: z.string().nullable().optional(),
  roomNumber: z.string().nullable().optional(),
}).passthrough();

const UWInstructorEntrySchema = z.object({
  instructorRoleCode: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  instructorFirstName: z.string().nullable().optional(),
  instructorLastName: z.string().nullable().optional(),
}).passthrough();

// ── Section endpoint (/v3/ClassSchedules/{termCode}/{subject}/{catalogNumber}) ─

export const UWSectionSchema = z.object({
  courseId: z.string(),
  courseOfferNumber: z.number(),
  termCode: z.string(),
  classNumber: z.number(),
  courseComponent: z.string(),    // LEC, TUT, LAB, TST, etc.
  classSection: z.number(),       // numeric section number (1 = LEC 001)
  maxEnrollmentCapacity: z.number().nullable().optional(),
  enrolledStudents: z.number().nullable().optional(),
  scheduleData: z.array(UWScheduleEntrySchema).nullable().optional(),
  instructorData: z.array(UWInstructorEntrySchema).nullable().optional(),
}).passthrough();

export type UWSection = z.infer<typeof UWSectionSchema>;

export const UWSectionsResponseSchema = z.array(UWSectionSchema);
