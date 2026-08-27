import { convert } from 'html-to-text';
import { ImapFlow } from 'imapflow';

import { UstcEmailError, emailError } from './errors.mjs';

const HOST = 'mail.ustc.edu.cn';
const PORT = 993;
const MAX_MESSAGES = 10;
const MAX_BODY_BYTES = 256 * 1024;

function normalizeFrom(envelope) {
  const sender = envelope?.from?.[0];
  return {
    name: sender?.name || '',
    address: sender?.address || '',
  };
}

function isoDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function messageSummary(message, uidValidity) {
  return {
    id: `${uidValidity}:${message.uid}`,
    uid: message.uid,
    messageId: message.envelope?.messageId || null,
    subject: message.envelope?.subject || '',
    from: normalizeFrom(message.envelope),
    receivedAt: isoDate(message.internalDate || message.envelope?.date),
    seen: message.flags?.has('\\Seen') ?? false,
  };
}

function textPartCandidates(node, candidates = []) {
  if (!node || node.disposition?.toLowerCase() === 'attachment') return candidates;
  if (node.type === 'text/plain' || node.type === 'text/html') candidates.push(node);
  for (const child of node.childNodes ?? []) textPartCandidates(child, candidates);
  return candidates;
}

function preferredTextPart(bodyStructure) {
  const candidates = textPartCandidates(bodyStructure);
  return candidates.find((node) => node.type === 'text/plain')
    ?? candidates.find((node) => node.type === 'text/html');
}

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function normalizeBody(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function classify(stage, error) {
  if (error instanceof UstcEmailError) return error;
  if (stage === 'connect') {
    if (error?.authenticationFailed) return emailError('authentication_failed');
    return emailError('network_failed');
  }
  if (stage === 'mailbox') return emailError('mailbox_failed');
  if (stage === 'list') return emailError('list_failed');
  if (stage === 'detail') return emailError('detail_failed');
  return emailError('email_unavailable');
}

export function createUstcImapAdapter({ env = process.env, ImapFlowClass = ImapFlow } = {}) {
  async function withReadOnlyInbox(operation) {
    const email = env.USTC_EMAIL?.trim();
    const password = env.USTC_EMAIL_APP_PASSWORD;
    if (!email || !password) throw emailError('credentials_missing');

    const client = new ImapFlowClass({
      host: HOST,
      port: PORT,
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    client.on('error', () => {});

    let stage = 'connect';
    let connected = false;
    let result;
    let primaryError;
    try {
      await client.connect();
      connected = true;
      stage = 'mailbox';
      const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
      if (!mailbox.readOnly) throw emailError('mailbox_failed');
      result = await operation({ client, mailbox, setStage(value) { stage = value; } });
    } catch (error) {
      primaryError = classify(stage, error);
    } finally {
      if (connected) {
        try {
          await client.logout();
        } catch {
          client.close();
          if (!primaryError) primaryError = emailError('network_failed');
        }
      } else {
        client.close();
      }
    }
    if (primaryError) throw primaryError;
    return result;
  }

  return Object.freeze({
    async listRecent() {
      return withReadOnlyInbox(async ({ client, mailbox, setStage }) => {
        setStage('list');
        if (mailbox.exists === 0) return [];
        const first = Math.max(1, mailbox.exists - MAX_MESSAGES + 1);
        const messages = [];
        for await (const message of client.fetch(`${first}:${mailbox.exists}`, {
          uid: true,
          envelope: true,
          internalDate: true,
          flags: true,
        })) {
          messages.push(messageSummary(message, String(mailbox.uidValidity)));
        }
        return messages.reverse();
      });
    },

    async getDetail(uid) {
      return withReadOnlyInbox(async ({ client, mailbox, setStage }) => {
        setStage('detail');
        const message = await client.fetchOne(uid, {
          uid: true,
          envelope: true,
          internalDate: true,
          flags: true,
          bodyStructure: true,
        }, { uid: true });
        if (!message) throw emailError('message_not_found');

        const part = preferredTextPart(message.bodyStructure);
        let body = '';
        const partId = part ? part.part ?? '1' : undefined;
        if (partId) {
          const downloaded = await client.download(uid, partId, { uid: true, maxBytes: MAX_BODY_BYTES });
          if (!downloaded?.content) throw emailError('detail_failed');
          const decoded = await streamText(downloaded.content);
          body = part.type === 'text/html'
            ? convert(decoded, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] })
            : decoded;
        }

        return {
          ...messageSummary(message, String(mailbox.uidValidity)),
          body: normalizeBody(body),
        };
      });
    },
  });
}
