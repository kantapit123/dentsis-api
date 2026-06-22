import crypto from 'crypto';
import { prisma } from '../prisma';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineSource {
  type: string;
  userId: string;
}

interface LineFollowEvent {
  type: 'follow';
  replyToken: string;
  source: LineSource;
}

interface LineTextMessageEvent {
  type: 'message';
  replyToken: string;
  source: LineSource;
  message: { type: 'text'; text: string };
}

type LineEvent = LineFollowEvent | LineTextMessageEvent | { type: string };

// ── Signature ─────────────────────────────────────────────────────────────────

export function verifyLineSignature(rawBody: Buffer | undefined, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !rawBody) return false;
  try {
    const hash = Buffer.from(
      crypto.createHmac('SHA256', secret).update(rawBody).digest('base64'),
    );
    const sig = Buffer.from(signature);
    // timingSafeEqual throws if lengths differ
    if (hash.length !== sig.length) return false;
    return crypto.timingSafeEqual(hash, sig);
  } catch {
    return false;
  }
}

// ── Reply ─────────────────────────────────────────────────────────────────────

async function reply(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  const res = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) console.error('Line reply failed:', res.status, await res.text());
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleFollow(event: LineFollowEvent): Promise<void> {
  await reply(
    event.replyToken,
    '🦷 สวัสดีครับ! กรุณาส่งรหัส 6 หลักที่ได้รับจาก staff คลินิกเพื่อเชื่อมต่อกับระบบนัดหมาย',
  );
}

async function handleTextMessage(event: LineTextMessageEvent): Promise<void> {
  const { userId } = event.source;
  const text = event.message.text.trim();

  const already = await prisma.doctor.findFirst({ where: { lineUserId: userId } });
  if (already) {
    await reply(event.replyToken, `คุณหมอ${already.name} เชื่อมต่อกับระบบอยู่แล้วครับ ✅`);
    return;
  }

  if (!/^\d{6}$/.test(text)) {
    await reply(event.replyToken, 'กรุณาส่งรหัส 6 หลักที่ได้รับจาก staff คลินิก');
    return;
  }

  const invite = await prisma.doctorInviteCode.findUnique({
    where: { code: text },
    include: { doctor: true },
  });

  if (!invite || invite.usedAt !== null) {
    await reply(event.replyToken, `รหัส "${text}" ไม่ถูกต้องหรือถูกใช้งานแล้ว\nกรุณาขอรหัสใหม่จาก staff`);
    return;
  }

  if (invite.expiresAt < new Date()) {
    await reply(event.replyToken, `รหัส "${text}" หมดอายุแล้ว\nกรุณาขอรหัสใหม่จาก staff`);
    return;
  }

  await prisma.$transaction([
    prisma.doctor.update({ where: { id: invite.doctorId }, data: { lineUserId: userId } }),
    prisma.doctorInviteCode.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
  ]);

  await reply(
    event.replyToken,
    `✅ เชื่อมต่อเรียบร้อยแล้วครับ คุณหมอ${invite.doctor.name}\nจะได้รับแจ้งเตือนเมื่อมีการยืนยันหรือยกเลิกนัดหมาย`,
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function handleLineEvents(events: LineEvent[]): Promise<void> {
  for (const event of events) {
    if (event.type === 'follow') {
      await handleFollow(event as LineFollowEvent);
    } else if (event.type === 'message' && (event as LineTextMessageEvent).message?.type === 'text') {
      await handleTextMessage(event as LineTextMessageEvent);
    }
  }
}
