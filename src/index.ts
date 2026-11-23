import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './core/env';
import { onError } from './core/errors';
import { withDb } from './core/middleware';
import { auditRoutes } from './modules/audit/audit.routes';
import { requireAuth } from './modules/auth/auth.middleware';
import { authRoutes } from './modules/auth/auth.routes';
import { ceisaMockRoutes } from './modules/ceisa-mock/ceisa-mock.routes';
import { customsDocsRoutes } from './modules/customs-docs/customs-docs.routes';
import { documentStatusesRoutes } from './modules/document-statuses/document-statuses.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { itemsRoutes } from './modules/items/items.routes';
import { partnersRoutes } from './modules/partners/partners.routes';
import { inswRoutes, refsRoutes } from './modules/refs/refs.routes';
import { reportsRoutes } from './modules/reports/reports.routes';
import { rolesRoutes } from './modules/roles/roles.routes';
import { metaRoutes, publicMetaRoutes, settingsRoutes } from './modules/settings/settings.routes';
import { tradeDocsRoutes } from './modules/trade-docs/trade-docs.routes';
import { usersRoutes } from './modules/users/users.routes';

const app = new Hono<Env>();

app.use('*', secureHeaders());
// Only the configured frontend origins may call the API from a browser; no cookies/credentials are ever used.
app.use('*', (c, next) => cors({
  origin: c.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 600,
})(c, next));
// API responses carry personal and business data: never let a browser or proxy cache them.
app.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });
// Reject oversized bodies before parsing (forms here are small JSON documents).
app.use('*', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ message: 'Ukuran permintaan terlalu besar' }, 413) }));
app.onError(onError);
app.notFound((c) => c.json({ message: 'Endpoint tidak ditemukan' }, 404));
app.get('/', (c) => c.json({ name: 'inventory-api', status: 'ok' }));
app.use('*', withDb);

// Public
app.route('/auth', authRoutes);
app.route('/meta', publicMetaRoutes);
app.route('/mock-ceisa', ceisaMockRoutes);

// Authenticated
const api = new Hono<Env>().use('*', requireAuth);
api.route('/meta', metaRoutes);
api.route('/settings', settingsRoutes);
api.route('/refs', refsRoutes);
api.route('/roles', rolesRoutes);
api.route('/document-statuses', documentStatusesRoutes);
api.route('/insw', inswRoutes);
api.route('/items', itemsRoutes);
api.route('/partners', partnersRoutes);
api.route('/trade-docs', tradeDocsRoutes);
api.route('/customs-docs', customsDocsRoutes);
api.route('/dashboard', dashboardRoutes);
api.route('/reports', reportsRoutes);
api.route('/audit-logs', auditRoutes);
api.route('/users', usersRoutes);
app.route('/', api);

export default app;
