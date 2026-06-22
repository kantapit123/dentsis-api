const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface AppointmentNotiParams {
  lineUserId: string;
  patientName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  treatmentName: string;
  reason?: string;
}

export interface AppointmentRescheduleParams extends AppointmentNotiParams {
  oldDate: string;
  oldStartTime: string;
  oldEndTime: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatThaiDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

function row(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#555555", flex: 0 },
      {
        type: "text",
        text: value,
        size: "sm",
        color: "#111111",
        align: "end",
        wrap: true,
      },
    ],
  };
}

// ── Flex builders ─────────────────────────────────────────────────────────────

function buildConfirmBubble(params: AppointmentNotiParams): object {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "ยืนยันนัดหมาย",
          weight: "bold",
          color: "#22e3a8",
          size: "sm",
        },
        {
          type: "text",
          text: params.patientName,
          weight: "bold",
          size: "xxl",
          margin: "md",
        },
        {
          type: "text",
          text: params.treatmentName,
          size: "xs",
          color: "#aaaaaa",
          wrap: true,
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "vertical",
          margin: "xxl",
          spacing: "sm",
          contents: [
            row("วันที่", formatThaiDate(params.date)),
            row("เวลา", `${params.startTime} – ${params.endTime} น.`),
          ],
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "🦷 Smilist Dental Clinic",
              size: "xs",
              color: "#aaaaaa",
            },
          ],
        },
      ],
    },
    styles: { footer: { separator: true } },
  };
}

function buildCancelBubble(params: AppointmentNotiParams): object {
  const detailRows = [
    row("วันที่", formatThaiDate(params.date)),
    row("เวลา", `${params.startTime} – ${params.endTime} น.`),
    ...(params.reason ? [row("เหตุผล", params.reason)] : []),
  ];

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "ยกเลิกนัดหมาย",
          weight: "bold",
          color: "#E8512A",
          size: "sm",
        },
        {
          type: "text",
          text: params.patientName,
          weight: "bold",
          size: "xxl",
          margin: "md",
        },
        {
          type: "text",
          text: params.treatmentName,
          size: "xs",
          color: "#aaaaaa",
          wrap: true,
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "vertical",
          margin: "xxl",
          spacing: "sm",
          contents: detailRows,
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "🦷 Smilist Dental Clinic",
              size: "xs",
              color: "#aaaaaa",
            },
          ],
        },
      ],
    },
    styles: { footer: { separator: true } },
  };
}

// ── Push ──────────────────────────────────────────────────────────────────────

async function pushFlex(
  lineUserId: string,
  altText: string,
  bubble: object,
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;

  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "flex", altText, contents: bubble }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Line push failed: ${res.status} ${body}`);
  }
}

function buildNewBookingBubble(params: AppointmentNotiParams): object {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "นัดหมายใหม่",
          weight: "bold",
          color: "#1d9bf5",
          size: "sm",
        },
        {
          type: "text",
          text: params.patientName,
          weight: "bold",
          size: "xxl",
          margin: "md",
        },
        {
          type: "text",
          text: params.treatmentName,
          size: "xs",
          color: "#aaaaaa",
          wrap: true,
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "vertical",
          margin: "xxl",
          spacing: "sm",
          contents: [
            row("วันที่", formatThaiDate(params.date)),
            row("เวลา", `${params.startTime} – ${params.endTime} น.`),
            row("สถานะ", "⏳ รอยืนยัน"),
          ],
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [{ type: "text", text: "🦷 Smilist Dental Clinic", size: "xs", color: "#aaaaaa" }],
        },
      ],
    },
    styles: { footer: { separator: true } },
  };
}

function buildRescheduleBubble(params: AppointmentRescheduleParams): object {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "แก้ไขนัดหมาย",
          weight: "bold",
          color: "#f59e0b",
          size: "sm",
        },
        {
          type: "text",
          text: params.patientName,
          weight: "bold",
          size: "xxl",
          margin: "md",
        },
        {
          type: "text",
          text: params.treatmentName,
          size: "xs",
          color: "#aaaaaa",
          wrap: true,
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "vertical",
          margin: "xxl",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "เดิม", size: "sm", color: "#aaaaaa", flex: 0 },
                { type: "text", text: `${formatThaiDate(params.oldDate)} ${params.oldStartTime}–${params.oldEndTime} น.`, size: "sm", color: "#aaaaaa", align: "end", wrap: true },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "ใหม่", size: "sm", color: "#111111", weight: "bold", flex: 0 },
                { type: "text", text: `${formatThaiDate(params.date)} ${params.startTime}–${params.endTime} น.`, size: "sm", color: "#111111", align: "end", wrap: true, weight: "bold" },
              ],
            },
          ],
        },
        { type: "separator", margin: "xxl" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [{ type: "text", text: "🦷 Smilist Dental Clinic", size: "xs", color: "#aaaaaa" }],
        },
      ],
    },
    styles: { footer: { separator: true } },
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function sendAppointmentConfirmed(
  params: AppointmentNotiParams,
): Promise<void> {
  await pushFlex(
    params.lineUserId,
    `ยืนยันนัดหมาย – ${params.patientName}`,
    buildConfirmBubble(params),
  );
}

export async function sendAppointmentCancelled(
  params: AppointmentNotiParams,
): Promise<void> {
  await pushFlex(
    params.lineUserId,
    `ยกเลิกนัดหมาย – ${params.patientName}`,
    buildCancelBubble(params),
  );
}

export async function sendAppointmentBooked(
  params: AppointmentNotiParams,
): Promise<void> {
  await pushFlex(
    params.lineUserId,
    `นัดหมายใหม่ – ${params.patientName}`,
    buildNewBookingBubble(params),
  );
}

export async function sendAppointmentRescheduled(
  params: AppointmentRescheduleParams,
): Promise<void> {
  await pushFlex(
    params.lineUserId,
    `แก้ไขนัดหมาย – ${params.patientName}`,
    buildRescheduleBubble(params),
  );
}
