// Optional, off-by-default Google Calendar reader.
//
// Uses Google's OAuth 2.0 flow for installed apps (system browser + loopback
// redirect + PKCE) with the read-only events scope. No client ID or secret
// is shipped: the person enters the OAuth client they created in their own
// Google Cloud project. The refresh token is encrypted with the operating
// system's credential store (Electron safeStorage) and deleted on
// disconnect, after asking Google to revoke it. Only the event fields needed
// to recognise a booking are requested and passed to the page; nothing is
// sent anywhere else.
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

class CalendarClient {
  constructor(dir, safeStorage, openExternal) {
    this.file = path.join(dir, 'calendar.token');
    this.ss = safeStorage;
    this.openExternal = openExternal;
    this.access = null;
  }
  canProtect() { return !!(this.ss && this.ss.isEncryptionAvailable()); }
  readSecret() {
    try { return JSON.parse(this.ss.decryptString(fs.readFileSync(this.file))); } catch { return null; }
  }
  writeSecret(obj) { fs.writeFileSync(this.file, this.ss.encryptString(JSON.stringify(obj))); }
  connected() { return !!this.readSecret(); }

  async connect({ clientId, clientSecret }) {
    if (!this.canProtect()) return { ok: false, reason: 'storage', message: 'This computer has no secure credential store, so a sign-in token can’t be kept safely.' };
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(String(clientId || ''))) return { ok: false, reason: 'client', message: 'Enter an OAuth client ID that ends in .apps.googleusercontent.com.' };
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    const { server, port, code } = await this.listen(state);
    const redirect = `http://127.0.0.1:${port}`;
    const url = `${AUTH}?${new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, code_challenge: challenge,
      code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' })}`;
    await this.openExternal(url);
    let authCode;
    try { authCode = await code; } catch (err) { return { ok: false, reason: err.message === 'denied' ? 'denied' : 'timeout', message: err.message === 'denied' ? 'You didn’t allow access. Nothing was connected.' : 'Sign-in wasn’t finished in time.' }; } finally { server.close(); }
    const body = { code: authCode, client_id: clientId, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect };
    if (clientSecret) body.client_secret = clientSecret;
    const tok = await this.post(TOKEN, body);
    if (!tok.ok) return tok;
    if (!tok.json.refresh_token) return { ok: false, reason: 'token', message: 'Google didn’t return a long-term token. Try again.' };
    if (!String(tok.json.scope || '').split(' ').includes(SCOPE)) return { ok: false, reason: 'scope', message: 'Read-only calendar access wasn’t granted.' };
    this.writeSecret({ clientId, clientSecret: clientSecret || '', refresh: tok.json.refresh_token });
    this.access = { token: tok.json.access_token, until: Date.now() + (tok.json.expires_in - 60) * 1000 };
    return { ok: true };
  }

  listen(state) {
    return new Promise((resolve) => {
      let done, fail;
      const code = new Promise((a, b) => { done = a; fail = b; });
      const timer = setTimeout(() => fail(new Error('timeout')), 5 * 60 * 1000);
      const server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset="utf-8"><title>Open Wallet</title><body style="font-family:system-ui;padding:40px">You can close this tab and go back to Open Wallet.</body>');
        clearTimeout(timer);
        if (u.searchParams.get('state') !== state) fail(new Error('state'));
        else if (u.searchParams.get('error')) fail(new Error('denied'));
        else done(u.searchParams.get('code'));
      });
      server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, code }));
    });
  }

  async post(url, body) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, reason: json.error === 'invalid_grant' ? 'expired' : 'http', status: r.status, message: json.error_description || `Google answered ${r.status}.` };
      return { ok: true, json };
    } catch {
      return { ok: false, reason: 'offline', message: 'You seem to be offline. Try again when you’re connected.' };
    }
  }

  async token() {
    if (this.access && Date.now() < this.access.until) return { ok: true, token: this.access.token };
    const s = this.readSecret();
    if (!s) return { ok: false, reason: 'disconnected', message: 'Google Calendar isn’t connected.' };
    const body = { client_id: s.clientId, refresh_token: s.refresh, grant_type: 'refresh_token' };
    if (s.clientSecret) body.client_secret = s.clientSecret;
    const r = await this.post(TOKEN, body);
    if (!r.ok) { if (r.reason === 'expired') this.forget(); return r; }
    this.access = { token: r.json.access_token, until: Date.now() + (r.json.expires_in - 60) * 1000 };
    return { ok: true, token: this.access.token };
  }

  // Events from yesterday to 180 days ahead, minimal fields only.
  async events() {
    const t = await this.token();
    if (!t.ok) return t;
    const q = new URLSearchParams({ timeMin: new Date(Date.now() - 86400000).toISOString(), timeMax: new Date(Date.now() + 180 * 86400000).toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250', fields: 'items(id,status,summary,description,location,start,end,organizer/displayName)' });
    try {
      const r = await fetch(`${EVENTS}?${q}`, { headers: { Authorization: `Bearer ${t.token}` } });
      if (r.status === 401) { this.access = null; return { ok: false, reason: 'expired', message: 'Access has expired or was revoked. Connect again.' }; }
      if (r.status === 403) return { ok: false, reason: 'permission', message: 'Google refused access to the calendar (permission or quota).' };
      if (r.status === 429) return { ok: false, reason: 'rate', message: 'Too many requests. Try again in a few minutes.' };
      if (!r.ok) return { ok: false, reason: 'http', message: `Google answered ${r.status}.` };
      const json = await r.json();
      const events = (json.items || []).map((e) => ({
        id: `gcal:${e.id}`, status: e.status, title: e.summary || '', description: String(e.description || '').slice(0, 2000), location: e.location || '',
        organizer: (e.organizer && e.organizer.displayName) || '', start: (e.start && (e.start.dateTime || e.start.date)) || '', end: (e.end && (e.end.dateTime || e.end.date)) || '',
        allDay: !!(e.start && e.start.date && !e.start.dateTime)
      }));
      return { ok: true, events };
    } catch {
      return { ok: false, reason: 'offline', message: 'You seem to be offline. Try again when you’re connected.' };
    }
  }

  forget() { try { fs.unlinkSync(this.file); } catch { /* gone */ } this.access = null; }

  async disconnect() {
    const s = this.readSecret();
    let revoked = false;
    if (s) { const r = await this.post(REVOKE, { token: s.refresh }); revoked = r.ok; }
    this.forget();
    return { ok: true, revoked };
  }
}

module.exports = { CalendarClient, SCOPE };
