import express from 'express';

import { executeAction, listActions } from '../services/actionService.js';
import {
    getDns,
    getLogsSummary,
    getMaintenance,
    getNetwork,
    getOverview,
    getOverviewCore,
    getOverviewExtended,
    getProxy,
    getServices,
    getStorage,
} from '../services/dashboardService.js';
import { getPolicy, runPolicyAction, runPolicyInspectReport } from '../services/policyService.js';

export function createApiRouter() {
    const router = express.Router();

    router.get('/healthz', (_req, res) => {
        res.type('text/plain').send('ok');
    });

    router.get('/overview', async (_req, res, next) => {
        try {
            res.json(await getOverview());
        } catch (error) {
            next(error);
        }
    });

    router.get('/overview/core', async (_req, res, next) => {
        try {
            res.json(await getOverviewCore());
        } catch (error) {
            next(error);
        }
    });

    router.get('/overview/extended', async (_req, res, next) => {
        try {
            res.json(await getOverviewExtended());
        } catch (error) {
            next(error);
        }
    });

    router.get('/services', async (_req, res, next) => {
        try {
            res.json(await getServices());
        } catch (error) {
            next(error);
        }
    });

    router.get('/proxy', async (_req, res, next) => {
        try {
            res.json(await getProxy());
        } catch (error) {
            next(error);
        }
    });

    router.get('/storage', async (_req, res, next) => {
        try {
            res.json(await getStorage());
        } catch (error) {
            next(error);
        }
    });

    router.get('/network', async (_req, res, next) => {
        try {
            res.json(await getNetwork());
        } catch (error) {
            next(error);
        }
    });

    router.get('/dns', async (_req, res, next) => {
        try {
            res.json(await getDns());
        } catch (error) {
            next(error);
        }
    });

    router.get('/maintenance', async (_req, res, next) => {
        try {
            res.json(await getMaintenance());
        } catch (error) {
            next(error);
        }
    });

    router.get('/logs/summary', async (_req, res, next) => {
        try {
            res.json(await getLogsSummary());
        } catch (error) {
            next(error);
        }
    });

    router.get('/actions', (_req, res) => {
        res.json({ actions: listActions() });
    });

    router.post('/actions/:id', async (req, res, next) => {
        try {
            res.json(await executeAction(req.params.id));
        } catch (error) {
            next(error);
        }
    });

    router.get('/policy', async (_req, res, next) => {
        try {
            res.json(await getPolicy());
        } catch (error) {
            next(error);
        }
    });

    router.post('/policy/actions/:id', async (req, res, next) => {
        try {
            res.json(await runPolicyAction(req.params.id));
        } catch (error) {
            next(error);
        }
    });

    router.get('/policy/inspect/:id', async (req, res, next) => {
        try {
            res.json(await runPolicyInspectReport(req.params.id));
        } catch (error) {
            next(error);
        }
    });

    return router;
}
