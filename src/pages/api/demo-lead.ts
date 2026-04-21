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

  const prenom  = sanitize(raw.prenom);
  const nom     = sanitize(raw.nom);
  const email   = sanitize(raw.email);
  const source  = sanitize(raw.source) || 'direct';
  const origin  = sanitize(raw.origin);
  const utmSource   = sanitize(raw.utm_source);
  const utmMedium   = sanitize(raw.utm_medium);
  const utmCampaign = sanitize(raw.utm_campaign);

  const errors: string[] = [];
  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

  if (!prenom || prenom.length > 100) errors.push('Prénom requis');
  if (!nom    || nom.length > 100)    errors.push('Nom requis');
  if (!email  || !emailRegex.test(email)) errors.push('Email invalide');

  if (errors.length > 0) {
    return json({ error: errors.join(', ') }, 400);
  }

  const createdAt = new Date().toISOString();
  const displayDate = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  try {
    const { error: emailError } = await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to:   import.meta.env.NOTIFICATION_EMAIL,
      subject: `🎯 Demande de démo — ${prenom} ${nom}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
          <h2 style="color:#7A8C3A;margin-bottom:4px;">Nouvelle demande de démo</h2>
          <p style="color:#666;font-size:13px;margin-top:0;">${displayDate}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;width:130px;">Prénom</td><td style="padding:10px 0;font-weight:600;">${h(prenom)}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Nom</td><td style="padding:10px 0;font-weight:600;">${h(nom)}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Email</td><td style="padding:10px 0;"><a href="mailto:${h(email)}" style="color:#7A8C3A;">${h(email)}</a></td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Source</td><td style="padding:10px 0;">${h(source)}</td></tr>
            ${utmSource ? `<tr><td style="padding:10px 0;color:#666;">UTM</td><td style="padding:10px 0;font-size:13px;">${h(utmSource)} / ${h(utmMedium)} / ${h(utmCampaign)}</td></tr>` : ''}
          </table>
        </div>
      `,
    });

    if (emailError) {
      console.error('[demo-lead] Erreur Resend:', emailError);
      return json({ error: 'Erreur envoi email. Réessayez ou contactez-nous directement.' }, 500);
    }

    // Mail de bienvenue au visiteur
    await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to:   email,
      subject: `Bienvenue à Reccolt`,
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#111;font-size:15px;line-height:1.75;">
          <p style="margin:0 0 16px;">Bonjour ${h(prenom)},</p>
          <p style="margin:0 0 16px;">Merci pour ton intérêt.</p>
          <p style="margin:0 0 24px;">Pour t'expliquer comment l'employé IA Reccolt peut être utile pour ton entreprise, je réalise des démonstrations de 20 minutes. Ci-dessous tu as mon calendrier pour prendre un rendez-vous, sinon tu peux répondre à ce mail avec tes disponibilités.</p>
          <p style="margin:0 0 24px;">
            <a href="https://cal.com/a.seingier-reccolt/20min" style="background:#7A8C3A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-family:Georgia,serif;font-size:15px;display:inline-block;">
              Choisir un créneau
            </a>
          </p>
          <p style="margin:0 0 24px;">
            En attendant, tu peux me suivre sur LinkedIn&nbsp;:
            <a href="https://www.linkedin.com/in/aseingier/" style="color:#7A8C3A;text-decoration:underline;">linkedin.com/in/aseingier</a>
          </p>
          <p style="margin:0;">À très vite,<br>L'équipe Reccolt</p>
        </div>
      `,
    });

    if (import.meta.env.NOTION_API_KEY && import.meta.env.NOTION_DATABASE_ID) {
      await notion.pages.create({
        parent: { database_id: import.meta.env.NOTION_DATABASE_ID },
        properties: {
          'Prénom':       { title:     [{ text: { content: prenom } }] },
          'Nom':          { rich_text: [{ text: { content: nom } }] },
          'Société':      { rich_text: [{ text: { content: '—' } }] },
          'Email':        { email:     email },
          'Source':       { rich_text: [{ text: { content: `demo / ${source}` } }] },
          'UTM Source':   { rich_text: utmSource   ? [{ text: { content: utmSource } }]   : [] },
          'UTM Medium':   { rich_text: utmMedium   ? [{ text: { content: utmMedium } }]   : [] },
          'UTM Campaign': { rich_text: utmCampaign ? [{ text: { content: utmCampaign } }] : [] },
          'Statut':       { select:    { name: 'Nouveau' } },
          'Date':         { date:      { start: createdAt } },
        },
      });
    }

    console.info(`[demo-lead] Demande démo : ${prenom} ${nom} <${email}>`);
    return json({ success: true });

  } catch (err) {
    console.error('[demo-lead] Erreur:', err);
    return json({ error: 'Erreur serveur. Réessayez ou contactez-nous directement.' }, 500);
  }
};
