import express from 'express';
import { Webhooks } from '@octokit/webhooks';

import dotenv from 'dotenv';
import type { PullRequestOpenedEvent, PullRequestReopenedEvent } from '@octokit/webhooks-types';
import { deletePreview, deployPreview } from './k8s/preview';
import { makeComment } from './github/comments';
dotenv.config();
const app = express();

const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET || 'development'
});

webhooks.on('pull_request.opened', async ({ payload }) => {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    try {

        await deployPreview({ namespace, hostname });
        //@ts-ignore
        await makeComment({ payload, hostname });
    }
    catch (e) {
        //TODO Implement error handling
    }
});

webhooks.on('pull_request.reopened', async ({ payload, }) => {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    try {

        await deployPreview({ namespace, hostname });
        //@ts-ignore
        await makeComment({ payload, hostname });
    }
    catch (e) {

    }
});

webhooks.on("pull_request.closed", async ({ payload }) => {

    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    try {
        deletePreview({ namespace, hostname });
    }
    catch (e) {
        //TODO error handling
    }

})

app.post('/webhook', express.text({ type: 'application/json' }), async (req, res) => {
    try {
        await webhooks.verifyAndReceive({
            id: req.headers['x-github-delivery']! as string,
            name: req.headers['x-github-event']! as string,
            signature: req.headers['x-hub-signature-256']! as string,
            payload: req.body
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error');
    }
});

app.listen(3000, () => {
    console.log('Webhook listener on port 3000');
});

