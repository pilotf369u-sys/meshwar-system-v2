import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'product-review-images';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const configured = (Deno.env.get('REVIEW_ALLOWED_ORIGINS') || 'https://pilotf369u-sys.github.io,http://localhost:4173')
    .split(',').map(value => value.trim()).filter(Boolean);
  const allowedOrigin = configured.includes(origin) ? origin : configured[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function response(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin') || '';
  const configured = (Deno.env.get('REVIEW_ALLOWED_ORIGINS') || 'https://pilotf369u-sys.github.io,http://localhost:4173')
    .split(',').map(value => value.trim()).filter(Boolean);
  return configured.includes(origin);
}

async function sha256Bytea(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `\\x${hex}`;
}

function validSignature(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value);
  if (type === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  return false;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return response(request, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (!isAllowedOrigin(request)) return response(request, 403, { ok: false, error: 'ORIGIN_NOT_ALLOWED' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return response(request, 500, { ok: false, error: 'SERVICE_NOT_CONFIGURED' });

  try {
    const form = await request.formData();
    const sessionToken = String(form.get('session_token') || '').trim();
    const reviewId = String(form.get('review_id') || '').trim();
    const file = form.get('file');
    if (!sessionToken || !reviewId || !(file instanceof File)) return response(request, 400, { ok: false, error: 'UPLOAD_FIELDS_REQUIRED' });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) return response(request, 400, { ok: false, error: 'INVALID_REVIEW_ID' });
    if (!ALLOWED_TYPES.has(file.type)) return response(request, 415, { ok: false, error: 'IMAGE_TYPE_NOT_ALLOWED' });
    if (file.size <= 0 || file.size > MAX_BYTES) return response(request, 413, { ok: false, error: 'IMAGE_SIZE_NOT_ALLOWED' });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validSignature(file.type, bytes)) return response(request, 415, { ok: false, error: 'IMAGE_SIGNATURE_INVALID' });

    const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tokenHash = await sha256Bytea(sessionToken);
    const { data: session, error: sessionError } = await supabase
      .from('customer_review_sessions')
      .select('customer_id,expires_at,revoked_at')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.customer_id) return response(request, 401, { ok: false, error: 'REVIEW_SESSION_INVALID' });

    const { data: review, error: reviewError } = await supabase
      .from('product_reviews')
      .select('id,customer_id,moderation_status')
      .eq('id', reviewId)
      .eq('customer_id', session.customer_id)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return response(request, 404, { ok: false, error: 'REVIEW_NOT_FOUND' });
    if (!['pending', 'rejected'].includes(review.moderation_status)) return response(request, 409, { ok: false, error: 'REVIEW_IMAGES_LOCKED' });

    const { data: existing, error: existingError } = await supabase
      .from('product_review_images')
      .select('sort_order')
      .eq('review_id', reviewId)
      .order('sort_order', { ascending: true });
    if (existingError) throw existingError;
    const occupied = new Set((existing || []).map(row => Number(row.sort_order)));
    const sortOrder = [0, 1, 2, 3, 4].find(value => !occupied.has(value));
    if (sortOrder === undefined) return response(request, 409, { ok: false, error: 'REVIEW_IMAGE_LIMIT_REACHED' });

    const extension = EXTENSIONS[file.type];
    const storagePath = `${session.customer_id}/${reviewId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { data: imageRow, error: insertError } = await supabase
      .from('product_review_images')
      .insert({
        review_id: reviewId,
        storage_path: storagePath,
        mime_type: file.type,
        byte_size: file.size,
        sort_order: sortOrder,
        moderation_status: 'pending'
      })
      .select('id,storage_path,sort_order,moderation_status')
      .single();

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw insertError;
    }

    return response(request, 201, { ok: true, image: imageRow });
  } catch (error) {
    console.error('product-review-image-upload', error);
    return response(request, 500, { ok: false, error: 'UPLOAD_FAILED' });
  }
});
