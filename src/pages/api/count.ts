import type { APIRoute } from 'astro';

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60', // Cache 60s
    },
  });
}

export const GET: APIRoute = async () => {
  const apiKey = import.meta.env.NOTION_API_KEY;
  const dbId   = import.meta.env.NOTION_DATABASE_ID;

  if (!apiKey || !dbId) return json({ count: 0 });

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'Statut',
          select: { equals: 'Validé' },
        },
        page_size: 100,
      }),
    });

    if (!res.ok) return json({ count: 0 });

    const data = await res.json();
    return json({ count: data.results?.length ?? 0 });

  } catch {
    return json({ count: 0 });
  }
};
