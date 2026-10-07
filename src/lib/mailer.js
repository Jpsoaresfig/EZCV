'use strict';

const net = require('net');
const tls = require('tls');
const config = require('../config');
const { sb } = require('../db');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* Cabeçalhos de email só admitem ASCII: texto com acentos («Fíchame», nomes
 * de vagas no assunto) vai como encoded-word UTF-8/base64 (RFC 2047), senão
 * alguns servidores e clientes mostram caracteres trocados. */
function encodeHeaderWord(text) {
  const s = String(text);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

/* ---------------------------------------------------------------------------
 * Cliente SMTP mínimo (apenas para envio de notificações).
 * Se SMTP_HOST não estiver definido, o email é apenas registado em log.
 * ------------------------------------------------------------------------- */

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: parseInt(last.slice(0, 3), 10), lines, raw: buffer });
      }
    };
    const onErr = (err) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new Error('Conexão SMTP fechada inesperadamente')); };
    function cleanup() {
      socket.off('data', onData);
      socket.off('error', onErr);
      socket.off('close', onClose);
    }
    socket.on('data', onData);
    socket.on('error', onErr);
    socket.on('close', onClose);
  });
}

async function expect(socket, codes) {
  const reply = await readReply(socket);
  if (!codes.includes(reply.code)) {
    throw new Error(`SMTP respondeu ${reply.code}: ${reply.lines[0] || ''}`);
  }
  return reply;
}

async function smtpSend({ to, subject, text, html }) {
  const { host, port, secure, user, pass, from } = config.smtp;
  const socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  /* Um servidor SMTP que não responde não pode prender o pedido para sempre
   * (na Vercel isso consome o tempo da função). */
  socket.setTimeout(15000, () => socket.destroy(new Error('Tempo esgotado a falar com o servidor SMTP')));

  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  try {
    await expect(socket, [220]);
    socket.write(`EHLO fichame.local\r\n`);
    let reply = await expect(socket, [250]);
    let caps = reply.lines.join(' ').toLowerCase();

    if (!secure && caps.includes('starttls')) {
      socket.write('STARTTLS\r\n');
      await expect(socket, [220]);
      await new Promise((resolve, reject) => {
        const upgraded = tls.connect({
          socket, servername: host,
          rejectUnauthorized: process.env.SMTP_INSECURE !== '1'
        }, resolve);
        upgraded.once('error', reject);
      });
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      socket.removeAllListeners('close');
      socket.write(`EHLO fichame.local\r\n`);
      reply = await expect(socket, [250]);
      caps = reply.lines.join(' ').toLowerCase();
    }

    if (user) {
      if (caps.includes('auth login')) {
        socket.write('AUTH LOGIN\r\n');
        await expect(socket, [334]);
        socket.write(`${Buffer.from(user, 'utf8').toString('base64')}\r\n`);
        await expect(socket, [334]);
        socket.write(`${Buffer.from(pass, 'utf8').toString('base64')}\r\n`);
        await expect(socket, [235]);
      } else if (caps.includes('auth plain')) {
        const token = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
        socket.write(`AUTH PLAIN ${token}\r\n`);
        await expect(socket, [235]);
      } else {
        throw new Error('Servidor SMTP não suporta AUTH LOGIN/PLAIN');
      }
    }

    socket.write(`MAIL FROM:<${from}>\r\n`);
    await expect(socket, [250]);
    socket.write(`RCPT TO:<${to}>\r\n`);
    await expect(socket, [250]);
    socket.write('DATA\r\n');
    await expect(socket, [354]);

    const boundary = 'ezcv-' + Math.random().toString(36).slice(2);
    const headers = [
      `From: ${encodeHeaderWord('Fíchame')} <${from}>`,
      `To: <${to}>`,
      `Subject: ${encodeHeaderWord(subject.replace(/[\r\n]+/g, ' '))}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ''
    ].join('\r\n');

    const body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '', text,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '', html,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const dotStuff = (headers + body).split(/\r?\n/).map((l) => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
    socket.write(dotStuff + '\r\n.\r\n');
    await expect(socket, [250]);
    socket.write('QUIT\r\n');
    try { await expect(socket, [221]); } catch { /* ignora erro no QUIT */ }
  } finally {
    socket.destroy();
  }
}

async function recordNotification(restaurantId, applicationId, status, detail) {
  try {
    const { error } = await sb().from('notifications').insert({
      restaurant_id: restaurantId,
      application_id: applicationId,
      type: 'nueva_candidatura',
      channel: 'email',
      status,
      detail: String(detail || '').slice(0, 300)
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('[mailer] falha ao registar notificação:', err.message);
  }
}

/* Notificação de nova candidatura ao restaurante (§21).
 *
 * O email NÃO leva o CV em anexo: leva um link para o painel, onde o acesso
 * é verificado. Um PDF em anexo sairia do controlo da plataforma e ficaria em
 * caixas de correio para sempre. */
async function notifyNewApplication({ restaurant, applicationId, candidate, jobTitle }) {
  const subject = 'Nueva candidatura recibida';
  const position = jobTitle || 'Sin puesto especificado';
  const fullName = `${candidate.first_name} ${candidate.last_name || ''}`.trim();
  const link = `${config.appUrl}/panel/candidaturas/${applicationId}`;

  const text = [
    `${fullName} se ha postulado para:`,
    '',
    position,
    '',
    `Ver candidatura: ${link}`
  ].join('\n');

  const html = [
    '<p><strong>Nueva candidatura recibida</strong></p>',
    `<p>${escapeHtml(fullName)} se ha postulado para:</p>`,
    `<p><strong>${escapeHtml(position)}</strong></p>`,
    `<p><a href="${escapeHtml(link)}">Ver candidatura</a></p>`
  ].join('\n');

  if (!config.smtp.host) {
    await recordNotification(restaurant.id, applicationId, 'logged', 'SMTP não configurado');
    console.log(`[EMAIL → ${restaurant.email}] ${subject}\n${text}`);
    return;
  }

  try {
    await smtpSend({ to: restaurant.email, subject, text, html });
    await recordNotification(restaurant.id, applicationId, 'sent', '');
    console.log(`[EMAIL] enviado para ${restaurant.email} (candidatura #${applicationId})`);
  } catch (err) {
    await recordNotification(restaurant.id, applicationId, 'failed', err.message);
    console.error(`[EMAIL] falha para ${restaurant.email}: ${err.message}`);
  }
}

module.exports = { notifyNewApplication };
