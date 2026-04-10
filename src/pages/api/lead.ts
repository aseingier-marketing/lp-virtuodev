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

// Encodage HTML pour l'injection dans le template email (évite la corruption HTML)
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

  // Rate limit
  if (!checkRateLimit(ip)) {
    console.warn(`[lead] Rate limit atteint pour IP: ${ip}`);
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
    console.warn(`[lead] Honeypot déclenché depuis IP: ${ip}`);
    return json({ success: true }); // On fait semblant de réussir
  }

  // Nettoyage
  const prenom  = sanitize(raw.prenom);
  const nom     = sanitize(raw.nom);
  const societe = sanitize(raw.societe);
  const email   = sanitize(raw.email);
  const tel     = sanitize(raw.tel);
  const message = sanitize(raw.message);
  const source  = sanitize(raw.source) || 'direct';
  const utmSource   = sanitize(raw.utm_source);
  const utmMedium   = sanitize(raw.utm_medium);
  const utmCampaign = sanitize(raw.utm_campaign);

  // Validation serveur
  const errors: string[] = [];

  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
  const telRegex   = /^[0-9+\s\-().]{7,20}$/;

  if (!prenom || prenom.length > 100)  errors.push('Prénom requis (max 100 caractères)');
  if (!nom    || nom.length > 100)     errors.push('Nom requis (max 100 caractères)');
  if (!societe || societe.length > 200) errors.push('Société requise (max 200 caractères)');
  if (!email  || !emailRegex.test(email)) errors.push('Email invalide');
  if (!tel    || !telRegex.test(tel))  errors.push('Téléphone invalide');
  if (message && message.length > 2000) errors.push('Message trop long (max 2000 caractères)');

  if (errors.length > 0) {
    return json({ error: errors.join(', ') }, 400);
  }

  const createdAt = new Date().toISOString();
  const displayDate = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  try {
    // ── 1. Email de notification ──────────────────────────────
    const { error: emailError } = await resend.emails.send({
      from: import.meta.env.RESEND_FROM_EMAIL,
      to:   import.meta.env.NOTIFICATION_EMAIL,
      subject: `🚀 Nouveau lead Reccolt — ${prenom} ${nom} (${societe})`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
          <h2 style="color:#1D5FBF;margin-bottom:4px;">Nouveau lead reçu</h2>
          <p style="color:#666;font-size:13px;margin-top:0;">${displayDate}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;width:130px;">Prénom</td><td style="padding:10px 0;font-weight:600;">${h(prenom)}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Nom</td><td style="padding:10px 0;font-weight:600;">${h(nom)}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Société</td><td style="padding:10px 0;font-weight:600;">${h(societe)}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Email</td><td style="padding:10px 0;"><a href="mailto:${h(email)}" style="color:#1D5FBF;">${h(email)}</a></td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Téléphone</td><td style="padding:10px 0;"><a href="tel:${h(tel)}" style="color:#1D5FBF;">${h(tel)}</a></td></tr>
            ${message ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Message</td><td style="padding:10px 0;">${h(message)}</td></tr>` : ''}
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#666;">Source</td><td style="padding:10px 0;">${h(source)}</td></tr>
            ${utmSource ? `<tr><td style="padding:10px 0;color:#666;">UTM</td><td style="padding:10px 0;font-size:13px;">${h(utmSource)} / ${h(utmMedium)} / ${h(utmCampaign)}</td></tr>` : ''}
          </table>
        </div>
      `,
    });

    if (emailError) {
      console.error('[lead] Erreur Resend:', emailError);
      return json({ error: 'Erreur envoi email. Réessayez ou contactez-nous directement.' }, 500);
    }

    // ── 2. Création du lead dans Notion (si configuré) ───────────────────────
    if (import.meta.env.NOTION_API_KEY && import.meta.env.NOTION_DATABASE_ID) {
      await notion.pages.create({
        parent: { database_id: import.meta.env.NOTION_DATABASE_ID },
        properties: {
          'Prénom':       { title:        [{ text: { content: prenom } }] },
          'Nom':          { rich_text:    [{ text: { content: nom } }] },
          'Société':      { rich_text:    [{ text: { content: societe } }] },
          'Email':        { email:        email },
          ...(tel ? { 'Téléphone': { phone_number: tel } } : {}),
          'Message':      { rich_text:    message ? [{ text: { content: message } }] : [] },
          'Source':       { rich_text:    [{ text: { content: source } }] },
          'UTM Source':   { rich_text:    utmSource   ? [{ text: { content: utmSource } }]   : [] },
          'UTM Medium':   { rich_text:    utmMedium   ? [{ text: { content: utmMedium } }]   : [] },
          'UTM Campaign': { rich_text:    utmCampaign ? [{ text: { content: utmCampaign } }] : [] },
          'Statut':       { select:       { name: 'Nouveau' } },
          'Date':         { date:         { start: createdAt } },
        },
      });
    }

    console.info(`[lead] Lead créé : ${prenom} ${nom} <${email}> — ${societe}`);
    return json({ success: true });

  } catch (err) {
    console.error('[lead] Erreur lors du traitement:', err);
    return json({ error: 'Erreur serveur. Réessayez ou contactez-nous directement.' }, 500);
  }
};
