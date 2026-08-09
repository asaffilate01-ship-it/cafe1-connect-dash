/**
 * Nightly HMCTS juror voucher housekeeping:
 *  1. Deactivates codes past their valid_until date (service finished).
 *  2. Emails the day's redemption summary for the HMCTS claim.
 *
 * Pseudonymous throughout — Juror IDs/voucher codes, never juror names or contact details.
 */
const FROM = "CAFE 1 ST ALBANS <no-reply@cafe1stalbans.co.uk>";
const TO = ["info@cafe1stalbans.co.uk"];
const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";

const money = (c: number) => `£${(c / 100).toFixed(2)}`;

export type JurorDailyResult = {
  date: string;
  expired: number;
  redemptions: number;
  jurors: number;
  total_cents: number;
  emailed: boolean;
};

export async function runJurorDailyJob(forDate?: string): Promise<JurorDailyResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const date = forDate ?? new Date().toISOString().slice(0, 10);

  // 1. Expire finished codes.
  const { data: expiredRows } = await supabaseAdmin
    .from("voucher_holders")
    .update({ active: false, deactivated_at: new Date().toISOString() })
    .eq("active", true)
    .not("valid_until", "is", null)
    .lt("valid_until", date)
    .select("id, code");
  const expired = expiredRows?.length ?? 0;
  if (expired) {
    await supabaseAdmin.from("voucher_events").insert(
      (expiredRows ?? []).map((r) => ({
        holder_id: r.id,
        code: r.code,
        event: "expire",
        detail: "auto-expired after end of service",
      })),
    );
  }

  // 2. Collect only redemptions attached to paid/on-account, non-cancelled
  // orders. A pending or failed checkout must never reach an HMCTS claim.
  const { callOperationsRpc } = await import("./ops-rpc");
  const rows = await callOperationsRpc<
    Array<{
      holder_id: string;
      order_id: string;
      order_number: number;
      amount_cents: number;
      redeemed_at: string;
      voucher_code: string;
    }>
  >(supabaseAdmin, "get_juror_claim_rows", { _from: date, _to: date });
  const total = rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  const jurors = new Set(rows.map((r) => r.holder_id)).size;

  const pretty = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const lines = rows.map((r) => ({
    time: new Date(r.redeemed_at).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    }),
    code: r.voucher_code,
    receipt: r.order_number,
    amount: money(r.amount_cents ?? 0),
  }));

  const csv = [
    "date,time,voucher_code,receipt,amount_gbp",
    ...lines.map((l) => `${date},${l.time},${l.code},${l.receipt},${l.amount.slice(1)}`),
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#111">
      <div style="background:#c8102e;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0">
        <h1 style="margin:0;font-size:20px">Juror Voucher Scheme — daily claim</h1>
        <p style="margin:6px 0 0;opacity:.9;font-size:14px">${pretty}</p>
      </div>
      <div style="border:1px solid #eee;border-top:0;border-radius:0 0 14px 14px;padding:24px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
          <tr>
            <td style="padding:8px 0"><strong>Redemptions</strong></td><td align="right">${rows.length}</td>
          </tr>
          <tr><td style="padding:8px 0"><strong>Jurors</strong></td><td align="right">${jurors}</td></tr>
          <tr><td style="padding:8px 0;border-top:2px solid #c8102e"><strong>Total claimable</strong></td>
              <td align="right" style="border-top:2px solid #c8102e"><strong>${money(total)}</strong></td></tr>
          <tr><td style="padding:8px 0"><strong>Codes expired today</strong></td><td align="right">${expired}</td></tr>
        </table>
        ${
          rows.length
            ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
                 <thead><tr style="text-align:left;background:#faf7f7">
                   <th style="padding:6px 8px">Time</th><th style="padding:6px 8px">Voucher</th>
                   <th style="padding:6px 8px">Receipt</th><th style="padding:6px 8px" align="right">Amount</th>
                 </tr></thead>
                 <tbody>${lines
                   .map(
                     (l) =>
                       `<tr><td style="padding:6px 8px;border-top:1px solid #eee">${l.time}</td>
                        <td style="padding:6px 8px;border-top:1px solid #eee;font-family:monospace">${l.code}</td>
                        <td style="padding:6px 8px;border-top:1px solid #eee">${l.receipt}</td>
                        <td style="padding:6px 8px;border-top:1px solid #eee" align="right">${l.amount}</td></tr>`,
                   )
                   .join("")}</tbody>
               </table>`
            : `<p style="color:#666">No voucher redemptions were recorded on this date.</p>`
        }
        <p style="color:#888;font-size:12px;margin-top:20px">
          Pseudonymous audit record — Juror IDs/voucher codes only, no juror names or contact details. CSV attached for the HMCTS claim.
        </p>
      </div>
    </div>`;

  let emailed = false;
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (lovableApiKey && resendApiKey) {
    try {
      const res = await fetch(`${RESEND_GATEWAY}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableApiKey}`,
          "X-Connection-Api-Key": resendApiKey,
        },
        body: JSON.stringify({
          from: FROM,
          to: TO,
          reply_to: "info@cafe1stalbans.co.uk",
          subject: `Juror voucher claim ${date} — ${money(total)} (${rows.length} redemptions)`,
          html,
          attachments: [
            {
              filename: `juror-vouchers-${date}.csv`,
              content: btoa(unescape(encodeURIComponent(csv))),
            },
          ],
        }),
      });
      if (!res.ok)
        console.error(`[juror-daily] Resend failed [${res.status}]: ${await res.text()}`);
      else emailed = true;
    } catch (e) {
      console.error("[juror-daily] send failed", e);
    }
  } else {
    console.error("[juror-daily] missing LOVABLE_API_KEY or RESEND_API_KEY");
  }

  return { date, expired, redemptions: rows.length, jurors, total_cents: total, emailed };
}
