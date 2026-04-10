export const prerender = false;
import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { Client } from '@notionhq/client';

const resend = new Resend(import.meta.env.RESEND_API_KEY);
const notion = new Client({ auth: import.meta.env.NOTION_API_KEY });

// Rate limiter : max 3 soumissions / IP / heure
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

function sanitize(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

function h(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('cf-connecting-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429);
  }

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Données invalides.' }, 400);
  }

  // Honeypot anti-bot
  if (raw._trap) {
    return json({ success: true });
  }

  const email       = sanitize(raw.email);
  const source      = sanitize(raw.source) || 'direct';
  const utmSource   = sanitize(raw.utm_source);
  const utmMedium   = sanitize(raw.utm_medium);
  const utmCampaign = sanitize(raw.utm_campaign);

  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    return json({ error: 'Email invalide.' }, 400);
  }

  const createdAt   = new Date().toISOString();
  const displayDate = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  try {
    // ── 1. Notification interne ────────────────────────────────
    await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to:   import.meta.env.NOTIFICATION_EMAIL,
      subject: `Nouvel intéressé Reccolt — ${email}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
          <h2 style="color:#7A8C3A;margin-bottom:4px;">Nouvel intéressé</h2>
          <p style="color:#666;font-size:13px;margin-top:0;">${displayDate}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;width:100px;">Email</td><td style="padding:10px 0;"><a href="mailto:${h(email)}" style="color:#7A8C3A;">${h(email)}</a></td></tr>
            <tr><td style="padding:10px 0;color:#666;">Source</td><td style="padding:10px 0;">${h(source)}</td></tr>
          </table>
        </div>
      `,
    });

    // ── 2. Mail de confirmation à la personne ──────────────────
    await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to:   email,
      subject: 'Merci pour votre intérêt',
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#111;font-size:15px;line-height:1.75;">
          <p style="margin:0 0 16px;">Bonjour,</p>
          <p style="margin:0 0 16px;">Merci pour votre intérêt.</p>
          <p style="margin:0 0 16px;">Reccolt est destiné à toute entreprise qui a envie d'améliorer son système commercial. Pour vous l'expliquer, je fais des démonstrations de 10 minutes.</p>
          <p style="margin:0 0 24px;">Vous pouvez réserver un créneau ou m'indiquer quand vous êtes disponibles.</p>
          <p style="margin:0 0 24px;">
            <a href="https://cal.com/a.seingier-virtuodev/20min"
               style="background:#7A8C3A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-family:Georgia,serif;font-size:15px;display:inline-block;">
              Réserver un créneau
            </a>
          </p>
          <p style="margin:0;">Bien à vous,<br>L'équipe Reccolt</p>
        </div>
      `,
    });

    // ── 3. Notion ──────────────────────────────────────────────
    if (import.meta.env.NOTION_API_KEY && import.meta.env.NOTION_DATABASE_ID) {
      await notion.pages.create({
        parent: { database_id: import.meta.env.NOTION_DATABASE_ID },
        properties: {
          'Prénom':       { title:        [{ text: { content: '—' } }] },
          'Nom':          { rich_text:    [{ text: { content: '—' } }] },
          'Société':      { rich_text:    [{ text: { content: '—' } }] },
          'Email':        { email:        email },
          'Source':       { rich_text:    [{ text: { content: `fondateur / ${source}` } }] },
          'UTM Source':   { rich_text:    utmSource   ? [{ text: { content: utmSource } }]   : [] },
          'UTM Medium':   { rich_text:    utmMedium   ? [{ text: { content: utmMedium } }]   : [] },
          'UTM Campaign': { rich_text:    utmCampaign ? [{ text: { content: utmCampaign } }] : [] },
          'Statut':       { select:       { name: 'Nouveau' } },
          'Date':         { date:         { start: createdAt } },
        },
      });
    }

    console.info(`[founder-lead] Intéressé : ${email}`);
    return json({ success: true });

  } catch (err) {
    console.error('[founder-lead] Erreur:', err);
    return json({ error: 'Erreur serveur.' }, 500);
  }
};
