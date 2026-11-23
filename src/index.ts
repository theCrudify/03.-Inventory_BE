import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './core/env';
import { onError } from './core/errors';
import { requireAuth, withDb } from './core/middleware';
import { auditRoutes } from './modules/audit/audit.routes';
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
app.use('*', (c, next) => cors({ origin: c.env.CORS_ORIGINS.split(',').map((s) => s.trim()), allowHeaders: ['Authorization', 'Content-Type'] })(c, next));
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
