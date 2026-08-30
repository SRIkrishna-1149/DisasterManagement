import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("RESPONDER_FROM_EMAIL");
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !sender)
    return json({ error: "Responder notification service is not configured" }, 503);

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  let body: { sos_id?: string; operation_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.sos_id || !body.operation_id)
    return json({ error: "sos_id and operation_id are required" }, 400);

  const { data: sos, error: sosError } = await admin
    .from("sos_requests")
    .select("*")
    .eq("id", body.sos_id)
    .maybeSingle();
  if (sosError || !sos) return json({ error: "SOS not found" }, 404);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  const operator = (roles ?? []).some((row) => row.role === "rescue" || row.role === "admin");
  if (sos.user_id !== authData.user.id && !operator)
    return json({ error: "Not authorized for this SOS" }, 403);

  const senderUser = sos.user_id ? await admin.auth.admin.getUserById(sos.user_id) : null;
  const senderEmail = senderUser?.data.user?.email ?? "Not available";

  const { data: contacts, error: contactsError } = await admin
    .from("responder_contacts")
    .select("email")
    .eq("active", true);
  if (contactsError || !contacts?.length) {
    return json({ error: "No active responder contacts are configured" }, 503);
  }
  const recipients = contacts.map((contact) => contact.email.toLowerCase());
  await admin.from("sos_notifications").upsert(
    recipients.map((recipient_email) => ({
      sos_id: body.sos_id,
      operation_id: body.operation_id,
      recipient_email,
    })),
    { onConflict: "sos_id,recipient_email", ignoreDuplicates: true },
  );
  const { data: notifications } = await admin
    .from("sos_notifications")
    .select("id, recipient_email, status, attempts")
    .eq("sos_id", body.sos_id)
    .in("status", ["QUEUED", "FAILED"]);
  if (!notifications?.length)
    return json({ status: "DELIVERED", delivered: recipients.length, failed: 0 });

  const location =
    sos.location_source === "LANDMARK"
      ? `Landmark: ${sos.landmark ?? "not provided"}`
      : sos.latitude !== null && sos.longitude !== null
        ? `${sos.location_source} ${sos.latitude}, ${sos.longitude}${sos.location_accuracy_m ? ` · accuracy ${Math.round(sos.location_accuracy_m)} m` : ""}`
        : "Location unavailable";
  const subject = `SENTINEL SOS #${sos.reference} · ${sos.severity} · ${sos.category}`;
  const html = `<h2>Emergency SOS #${escapeHtml(sos.reference)}</h2><p><strong>Sender account:</strong> ${escapeHtml(senderEmail)}<br><strong>Severity:</strong> ${escapeHtml(sos.severity)}<br><strong>Type:</strong> ${escapeHtml(sos.category)}<br><strong>People needing help:</strong> ${escapeHtml(sos.people_count)}<br><strong>Location:</strong> ${escapeHtml(location)}</p><p><strong>Responder context:</strong><br>${escapeHtml(sos.description ?? "No additional context")}</p>${sos.medical_needs ? `<p><strong>Medical needs:</strong> ${escapeHtml(sos.medical_needs)}</p>` : ""}<p>Open the Sentinel response portal to validate and accept this request. Email delivery does not itself accept or dispatch the SOS.</p>`;
  const results = await Promise.all(
    notifications.map(async (notification) => {
      await admin
        .from("sos_notifications")
        .update({
          status: "SENDING",
          attempts: notification.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", notification.id);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: sender, to: [notification.recipient_email], subject, html }),
        });
        const provider = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            typeof provider?.message === "string"
              ? provider.message
              : `Mail provider returned ${response.status}`,
          );
        await admin
          .from("sos_notifications")
          .update({
            status: "DELIVERED",
            provider_message_id: provider?.id ?? null,
            last_error: null,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", notification.id);
        return { ok: true };
      } catch (error) {
        await admin
          .from("sos_notifications")
          .update({
            status: "FAILED",
            last_error: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", notification.id);
        return { ok: false };
      }
    }),
  );
  const failed = results.filter((result) => !result.ok).length;
  return json(
    {
      status: failed ? "PARTIAL_FAILURE" : "DELIVERED",
      delivered: results.length - failed,
      failed,
    },
    failed ? 502 : 200,
  );
});
