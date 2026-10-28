/** 하이웍스 메일(SMTP) 발송. 서버 전용.
 *
 * 설정: .env.local (git 제외, 서버 PC에만 있음)
 *   HIWORKS_SMTP_HOST=smtps.hiworks.com
 *   HIWORKS_SMTP_PORT=465
 *   HIWORKS_SMTP_USER=보내는사람@회사도메인
 *   HIWORKS_SMTP_PASSWORD=메일 비밀번호 (또는 하이웍스에서 발급한 SMTP 전용 비밀번호)
 *   HIWORKS_SENDER_NAME=관리팀
 *
 * 하이웍스 관리자 설정에서 '외부 메일 프로그램(SMTP) 사용'이 허용되어 있어야 한다.
 */
import nodemailer from "nodemailer";

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  senderName: string;
}

const EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

export function loadMailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  if (!env.HIWORKS_SMTP_USER || !env.HIWORKS_SMTP_PASSWORD) return null;
  return {
    host: env.HIWORKS_SMTP_HOST || "smtps.hiworks.com",
    port: Number(env.HIWORKS_SMTP_PORT || 465),
    user: env.HIWORKS_SMTP_USER,
    password: env.HIWORKS_SMTP_PASSWORD,
    senderName: env.HIWORKS_SENDER_NAME || "관리팀",
  };
}

/** 'a@x.com, b@x.com; c@x.com' -> [올바른 주소, 잘못된 값] */
export function parseAddresses(text: string): [string[], string[]] {
  const items = (text || "").split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  return [[...new Set(items.filter((t) => EMAIL.test(t)))], items.filter((t) => !EMAIL.test(t))];
}

export function buildMessage(cfg: MailConfig, subject: string, html: string, text: string, to: string[], cc: string[]) {
  return {
    from: { name: cfg.senderName, address: cfg.user },
    to,
    cc: cc.length ? cc : undefined,
    subject,
    text,
    html: `<!doctype html><html><body style="margin:0;padding:16px;background:#fff">${html}</body></html>`,
  };
}

/** 실패하면 예외를 그대로 올린다 (화면에서 사유를 보여 줌). */
export async function sendMail(cfg: MailConfig, subject: string, html: string, text: string, to: string[],
  cc: string[]): Promise<void> {
  if (!to.length) throw new Error("받는 사람이 없습니다.");
  const transport = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.port === 465, requireTLS: cfg.port !== 465,
    auth: { user: cfg.user, pass: cfg.password }, connectionTimeout: 30_000, socketTimeout: 30_000,
  });
  await transport.sendMail(buildMessage(cfg, subject, html, text, to, cc));
}

export function friendlyError(exc: unknown): string {
  const e = exc as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) {
    return "하이웍스 로그인에 실패했습니다. .env.local의 메일 계정·비밀번호를 확인하고, 하이웍스에서 "
      + "외부 메일 프로그램(SMTP) 사용이 허용되어 있는지 확인해 주세요.";
  }
  if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED" || e.code === "ESOCKET" || e.code === "EDNS") {
    return `메일 서버에 연결하지 못했습니다 (${e.message}). 회사 방화벽에서 465 포트가 막혀 있을 수 있습니다.`;
  }
  return `메일 발송 실패: ${e.message ?? String(exc)}`;
}
