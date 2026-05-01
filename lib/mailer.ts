import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Gmail SMTP transport — pattern mirrored from primeengage/lib/mailer.ts so
 * the two repos send identical-looking mail (same baseHtml shell, same kv
 * helper, same escape semantics). Phase 1 deviation per docs/migration-tasks.md
 * #1: this lives in a Next.js Route Handler, not a Supabase Edge Function.
 *
 * Required env vars (.env.local):
 *   SMTP_HOST   = smtp.gmail.com
 *   SMTP_PORT   = 465
 *   SMTP_USER   = your-gmail@gmail.com
 *   SMTP_PASS   = 16-char Google App Password (NOT your login password)
 *   MAIL_FROM   = "Prime Engage <your-gmail@gmail.com>"
 */
let cached: Transporter | null = null;

export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function transporter(): Transporter | null {
  if (!isMailerConfigured()) return null;
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT ?? 465);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  return cached;
}

const from = () =>
  process.env.MAIL_FROM ??
  `Prime Engage <${process.env.SMTP_USER ?? "noreply@primeengage.in"}>`;

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ------- Ambassador approval / rejection ------------------------------------

type ApprovedAmbassador = {
  first_name: string;
  email: string;
  password: string;
};

export async function sendApprovalEmail(a: ApprovedAmbassador): Promise<void> {
  const t = transporter();
  if (!t) return;

  const loginUrl = `${appUrl()}/login`;
  const subject = "You're in — Prime Engage Yuvaah Club";
  const text = `Hi ${a.first_name},

Welcome to the Prime Engage Yuvaah Club! Your application has been approved.

Your sign-in credentials:

  Email     : ${a.email}
  Password  : ${a.password}
  Login URL : ${loginUrl}

Please change your password after first sign-in. Use the "Forgot password" link on the login page anytime to reset it.

Welcome aboard,
Team Prime Engage
hello@primeengage.in`;

  const html = baseHtml({
    preheader: "Your Yuvaah Club application has been approved.",
    title: `Welcome aboard, ${escape(a.first_name)}`,
    body: `
      <p>Your application to the <strong>Prime Engage Yuvaah Club</strong> has been approved. Use the credentials below to sign in.</p>
      <div style="margin-top:22px;background:#F8F6EF;border:1px solid rgba(10,24,56,0.08);border-radius:12px;padding:18px">
        ${kv("Email", a.email)}
        ${kv("Password", `<code style="font-family:'JetBrains Mono',ui-monospace,monospace;background:#fff;padding:2px 6px;border-radius:4px">${escape(a.password)}</code>`)}
      </div>
      <p style="margin-top:24px">
        <a href="${escape(loginUrl)}" style="display:inline-block;background:#F59242;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Sign in →</a>
      </p>
      <p style="margin-top:22px;color:#5A6686;font-size:13px">Please change your password after the first sign-in. You can also use "Forgot password" on the login page anytime.</p>
    `,
  });

  await t.sendMail({ from: from(), to: a.email, subject, text, html });
}

type RejectedApplicant = {
  first_name: string;
  email: string;
};

export async function sendRejectionEmail(a: RejectedApplicant): Promise<void> {
  const t = transporter();
  if (!t) return;

  const subject = "Update on your Yuvaah Club application";
  const text = `Hi ${a.first_name},

Thank you for applying to the Prime Engage Yuvaah Club. We received an enormous number of strong applications this season and unfortunately could not offer you a place in this cohort.

This is not a reflection on your potential — campus programs at this scale come down to a very narrow fit on profile, region, and interest mix. We'd genuinely encourage you to apply again when we open the next cohort.

Best wishes,
Team Prime Engage
hello@primeengage.in`;

  const html = baseHtml({
    preheader: "An update on your Yuvaah Club application.",
    title: `Hi ${escape(a.first_name)}, an update on your application`,
    body: `
      <p>Thank you for applying to the <strong>Prime Engage Yuvaah Club</strong>. We received an enormous number of strong applications this season and unfortunately could not offer you a place in this cohort.</p>
      <p style="margin-top:18px">This is not a reflection on your potential &mdash; campus programs at this scale come down to a very narrow fit on profile, region, and interest mix. We'd genuinely encourage you to apply again when we open the next cohort.</p>
      <p style="margin-top:22px;color:#5A6686;font-size:13px">If you have any questions, just reply to this email.</p>
    `,
  });

  await t.sendMail({ from: from(), to: a.email, subject, text, html });
}

// ------- Submission award notification --------------------------------------

type AwardedSubmission = {
  first_name: string;
  email: string;
  activity_title: string;
  points: number;
  total_balance: number; // current balance after this award
};

export async function sendAwardEmail(a: AwardedSubmission): Promise<void> {
  const t = transporter();
  if (!t) return;

  const dashboardUrl = `${appUrl()}/dashboard`;
  const subject = `+${a.points} points · ${a.activity_title}`;
  const text = `Hi ${a.first_name},

Your submission for "${a.activity_title}" has been reviewed and approved. You've earned ${a.points} point${a.points === 1 ? "" : "s"}.

Current balance: ${a.total_balance} points.

Open your dashboard: ${dashboardUrl}

Keep going,
Team Prime Engage
hello@primeengage.in`;

  const html = baseHtml({
    preheader: `+${a.points} points awarded for ${a.activity_title}.`,
    title: `Nice work, ${escape(a.first_name)} — +${a.points} points`,
    body: `
      <p>Your submission for <strong>${escape(a.activity_title)}</strong> has been reviewed and approved.</p>
      <div style="margin-top:22px;background:#F8F6EF;border:1px solid rgba(10,24,56,0.08);border-radius:12px;padding:18px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5A6686;font-weight:600">Earned</div>
          <div style="font-family:'Cabinet Grotesk',Inter,sans-serif;font-size:32px;font-weight:700;color:#0A1838;margin-top:2px">+${a.points}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5A6686;font-weight:600">Balance</div>
          <div style="font-family:'Cabinet Grotesk',Inter,sans-serif;font-size:32px;font-weight:700;color:#0A1838;margin-top:2px">${a.total_balance}</div>
        </div>
      </div>
      <p style="margin-top:24px">
        <a href="${escape(dashboardUrl)}" style="display:inline-block;background:#F59242;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Open dashboard →</a>
      </p>
    `,
  });

  await t.sendMail({ from: from(), to: a.email, subject, text, html });
}

// ------- helpers (carbon copy of primeengage/lib/mailer.ts helpers) ---------

function escape(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function kv(k: string, v: string | null | undefined): string {
  const val = v ? v : "<em style='color:#8B93AB'>not provided</em>";
  return `<div style="margin:8px 0;display:flex;gap:12px"><div style="min-width:96px;color:#5A6686;font-size:13px">${k}</div><div style="color:#0A1838;font-size:14px">${val}</div></div>`;
}

function baseHtml({
  preheader,
  title,
  body,
}: {
  preheader: string;
  title: string;
  body: string;
}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#F8F6EF;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0A1838">
  <span style="display:none;font-size:1px;line-height:1px;opacity:0">${escape(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid rgba(10,24,56,0.08);border-radius:18px;overflow:hidden">
      <tr><td style="padding:0">
        <div style="background:linear-gradient(135deg,#061736,#163F8C 50%,#1FB9DC);padding:28px 32px;color:#fff">
          <div style="font-family:'Cabinet Grotesk',Inter,sans-serif;font-weight:700;font-size:18px;letter-spacing:-0.01em">Prime <span style="color:#9BE7F5">Engage</span></div>
          <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#9BE7F5;margin-top:4px">Yuvaah Club</div>
        </div>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 16px 0;font-family:'Cabinet Grotesk',Inter,sans-serif;font-size:24px;color:#0A1838">${escape(title)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#0A1838">${body}</div>
      </td></tr>
      <tr><td style="background:#F8F6EF;padding:20px 32px;color:#5A6686;font-size:12px">
        Prime Engage · F218, B Wing, Express Zone Commercial Hub, W. E. Highway, Goregaon East, Mumbai 400063<br>
        <a href="mailto:hello@primeengage.in" style="color:#163F8C">hello@primeengage.in</a> · +91 8850888054
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
