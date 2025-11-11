import express from 'express';
import { Webhooks } from '@octokit/webhooks';
import dotenv from 'dotenv'; 
dotenv.config();
import { deletePreview, deployPreview } from './k8s/preview';
import { makeComment } from './github/comments';
const app = express();

const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET || 'development'
});

webhooks.on('pull_request.opened', async ({ payload }) => {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    await deployPreview({ namespace, hostname });
    //@ts-ignore
    await makeComment({ payload, hostname });

});

webhooks.on('pull_request.reopened', async ({ payload, }) => {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    await deployPreview({ namespace, hostname });
    //@ts-ignore
    await makeComment({ payload, hostname });

});

webhooks.on("pull_request.closed", async ({ payload }) => {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    deletePreview({ namespace, hostname });
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});