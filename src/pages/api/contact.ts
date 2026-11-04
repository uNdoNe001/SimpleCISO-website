import type { APIRoute } from "astro";
import nodemailer from "nodemailer";

export const prerender = false;

const env = (key: string): string | undefined => {
  return process.env[key] ?? (import.meta.env as Record<string, string | undefined>)[key];
};

// Simple in-memory rate limit (per instance). The site runs as a single Node
// process behind Caddy, so this is sufficient to blunt abuse.
const recentSubmissions = new Map<string, number[]>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const history = (recentSubmissions.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (history.length >= RATE_MAX) return false;
  history.push(now);
  recentSubmissions.set(ip, history);
  return true;
}

interface ContactBody {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  interest?: unknown;
  message?: unknown;
  website?: unknown;
  source?: unknown;
}

const INTEREST_LABELS: Record<string, string> = {
  vciso: "Fractional / virtual CISO",
  mssp: "MSSP / security partner",
  internal: "Internal security team",
  demo: "Just want a demo",
  other: "Something else",
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? "unknown";

  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ ok: false, error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Honeypot: bots fill hidden fields. Pretend success, send nothing.
  if (isString(body.website) && body.website.trim() !== "") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = isString(body.name) ? body.name.trim() : "";
  const email = isString(body.email) ? body.email.trim() : "";
  const company = isString(body.company) ? body.company.trim() : "";
  const interest = isString(body.interest) ? body.interest.trim() : "demo";
  const message = isString(body.message) ? body.message.trim() : "";

  const errors: string[] = [];
  if (name.length < 1 || name.length > 200) errors.push("Name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("A valid email is required.");
  if (company.length > 200) errors.push("Company is too long.");
  if (message.length > 5000) errors.push("Message is too long.");
  if (!Object.keys(INTEREST_LABELS).includes(interest)) errors.push("Invalid selection.");

  if (errors.length > 0) {
    return new Response(JSON.stringify({ ok: false, error: errors.join(" ") }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const smtpEnabled = env("SMTP_ENABLED") === "true";
  const smtpHost = env("SMTP_HOST");
  const smtpPort = parseInt(env("SMTP_PORT") ?? "587", 10);
  const smtpUser = env("SMTP_USER");
  const smtpPassword = (env("SMTP_PASSWORD") ?? "").replace(/\s+/g, "");
  const smtpFrom = env("SMTP_FROM") ?? smtpUser ?? "noreply@simpleciso.ai";
  const notifyTo = env("CONTACT_NOTIFY_TO") ?? smtpUser ?? "info@simpleciso.ai";

  if (!smtpEnabled || !smtpHost || !smtpUser || !smtpPassword) {
    console.error("[contact] SMTP not configured", { smtpEnabled, hasHost: !!smtpHost, hasUser: !!smtpUser });
    return new Response(
      JSON.stringify({ ok: false, error: "Email delivery is not configured. Please email info@simpleciso.ai directly." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPassword },
  });

  const interestLabel = INTEREST_LABELS[interest] ?? interest;
  const submittedAt = new Date().toISOString();

  const notifyText = [
    "New SimpleCISO contact message",
    "==============================",
    `Name:       ${name}`,
    `Email:      ${email}`,
    `Company:    ${company || "—"}`,
    `Interest:   ${interestLabel}`,
    `Submitted:  ${submittedAt}`,
    `Source IP:  ${ip}`,
    "",
    "Message:",
    message || "(none)",
  ].join("\n");

  const notifyHtml = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#0f172a;">
      <h2 style="margin:0 0 12px 0;color:#1f6fd6;">New SimpleCISO contact message</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 0;color:#64748b;width:120px;">Name</td><td style="padding:6px 0;"><strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Company</td><td style="padding:6px 0;">${escapeHtml(company || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Interest</td><td style="padding:6px 0;">${escapeHtml(interestLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Submitted</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${escapeHtml(submittedAt)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Source IP</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${escapeHtml(ip)}</td></tr>
      </table>
      <h3 style="margin:18px 0 6px 0;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Message</h3>
      <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:14px;line-height:1.5;">${escapeHtml(message || "(none)")}</div>
    </div>
  `;

  const replyHtml = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#0f172a;line-height:1.55;">
      <p>Hi ${escapeHtml(name.split(" ")[0] || "there")},</p>
      <p>Thanks for reaching out about <strong>SimpleCISO</strong>. We got your message and will reply within one business day.</p>
      <p>SimpleCISO is the governance side of the Summit Cyber stack — AI does the repetitive security-program work while your team stays accountable for every material decision. We're onboarding early partners now, and we'd love to show you the assessment-to-evidence lifecycle on your own frameworks.</p>
      <p style="margin-top:24px;">— The SimpleCISO team<br/>Summit Cyber<br/><a href="https://simpleciso.ai">simpleciso.ai</a></p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: smtpFrom,
      to: notifyTo,
      replyTo: email,
      subject: `[SimpleCISO] Contact — ${name} (${interestLabel})`,
      text: notifyText,
      html: notifyHtml,
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: "We got your SimpleCISO message",
      text: `Hi ${name.split(" ")[0] || "there"},\n\nThanks for reaching out about SimpleCISO. We got your message and will reply within one business day.\n\nSimpleCISO is the governance side of the Summit Cyber stack — AI does the repetitive security-program work while your team stays accountable for every material decision.\n\n— The SimpleCISO team\nSummit Cyber\nhttps://simpleciso.ai`,
      html: replyHtml,
    });
  } catch (err) {
    console.error("[contact] mail send failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: "We couldn't send your message right now. Please email info@simpleciso.ai directly." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
