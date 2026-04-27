import { z } from "zod";

/**
 * Canonical source of truth for the Ambassador Club application form.
 *
 * Used by:
 *   - the public apply page (app/(site)/ambassador-club/apply/*)
 *   - the server action that writes to amb_profiles
 *   - (future) the admin repo, when it imports this package or copies the types
 *
 * Option lists match the fields captured on the live reference form
 * (https://esmaaash.in/AmbassadorClubRegister) verbatim — never hard-code
 * these strings anywhere else; import from here.
 */

export const FEST_INVOLVEMENT = [
    "Actively organize and lead events – I'm always in the thick of planning and coordinating.",
    "Regular participant – I love being on stage or competing.",
    "I help out where needed and ensure things run smoothly.",
    "I participate occasionally, but only in events that align with my interests.",
    "Not involved – I focus on other areas of college life.",
] as const;

export const GO_TO_ACTIVITY = [
    "Outdoor sports (football, cricket, basketball, etc.)",
    "E-Gaming (BGMI, FIFA, Valorant, Free Fire, etc.)",
    "Creative outlets (painting, music, dancing, designing)",
    "Social media activities (content creation, video editing, marketing, etc.)",
    "Hanging out with friends or socializing",
    "Me-time with shows, books, or chill activities",
] as const;

export const ACTIVE_PLATFORM = [
    "Instagram",
    "YouTube",
    "LinkedIn",
    "X (formerly Twitter)",
    "Others",
    "I'm not active on any platform",
] as const;

export const FOLLOWER_RANGE = [
    "0 - 500",
    "500 - 2000",
    "2K - 5K",
    "5K - 10K",
    "10K - 30K",
    "30K+",
] as const;

export const STUDENT_ID_ACCEPTED_MIME = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
] as const;

export const STUDENT_ID_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Accepts +91 prefix (with or without space) and a 10-digit Indian mobile (6-9 start).
const PHONE_RE = /^(\+?91[\s-]?)?[6-9]\d{9}$/;

/** Fields that become first-class columns on amb_profiles. */
const topLevelFields = {
    first_name: z.string().trim().min(1, "First name is required").max(60),
    last_name: z.string().trim().min(1, "Last name is required").max(60),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    phone: z.string().trim().regex(PHONE_RE, "Enter a valid 10-digit Indian mobile"),
    college: z.string().trim().min(2, "College name is required").max(200),
    city: z.string().trim().min(2, "City is required").max(80),
};

/** Fields that land inside amb_profiles.application_data jsonb. */
const surveyFields = {
    referral_code: z.string().trim().max(40).optional().or(z.literal("")),
    why_join: z.string().trim().min(10, "Please write at least 10 characters").max(2000),
    stand_out: z.string().trim().min(10, "Please write at least 10 characters").max(2000),
    fest_involvement: z.enum(FEST_INVOLVEMENT),
    go_to_activity: z.enum(GO_TO_ACTIVITY),
    active_platform: z.enum(ACTIVE_PLATFORM),
    follower_range: z.enum(FOLLOWER_RANGE),
};

/**
 * Full application payload as submitted by the form (without the file).
 * The Student ID Card file is validated separately during the multipart upload
 * and becomes amb_profiles.student_id_url after storage write.
 */
export const ApplicationSchema = z.object({
    ...topLevelFields,
    ...surveyFields,
});

export type ApplicationInput = z.infer<typeof ApplicationSchema>;

/** Shape of the application_data jsonb column (survey fields only). */
export type ApplicationData = {
    referral_code?: string;
    why_join: string;
    stand_out: string;
    fest_involvement: (typeof FEST_INVOLVEMENT)[number];
    go_to_activity: (typeof GO_TO_ACTIVITY)[number];
    active_platform: (typeof ACTIVE_PLATFORM)[number];
    follower_range: (typeof FOLLOWER_RANGE)[number];
};

/** Split a validated input into (columns, jsonb) for the DB write. */
export function splitForDb(input: ApplicationInput) {
    const {
        first_name, last_name, email, phone, college, city,
        referral_code, why_join, stand_out,
        fest_involvement, go_to_activity, active_platform, follower_range,
    } = input;

    const columns = { first_name, last_name, email, phone, college, city };
    const application_data: ApplicationData = {
        ...(referral_code ? { referral_code } : {}),
        why_join,
        stand_out,
        fest_involvement,
        go_to_activity,
        active_platform,
        follower_range,
    };
    return { columns, application_data };
}
