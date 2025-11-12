import express from 'express';
import { Webhooks } from '@octokit/webhooks';
import dotenv from 'dotenv';
import { deletePreview, deployPreview, waitOnPodDeploy } from './k8s/preview';
import { makeComment } from './github/comments';
dotenv.config();
const app = express();

const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET || 'development'
});

webhooks.on('workflow_run', async ({ payload }) => {
    if (payload.action !== 'completed') return;
    if (payload.workflow_run.conclusion !== 'success') return;
    if (payload.workflow_run.name !== 'Build PR Preview Image') return;
    const prs = payload.workflow_run.pull_requests;
    if(!prs || !prs.length) return console.log("No PR associated with workflow run");//protect for non-pr workflow runs
    const prNumber = payload.workflow_run.pull_requests[0]?.number;
    const sha = payload.workflow_run.head_sha;
    const namespace = `pr-${payload.workflow_run.pull_requests[0]?.number}`
    const hostname = `pr-${payload.workflow_run.pull_requests[0]?.number}.preview.local`;
    const image = `barnettet31/react-preview:${namespace}`
    console.log("Using this image: ", image)
    await deployPreview({ namespace, hostname, image });
    console.log("Wait for pod to be ready...");
    await waitOnPodDeploy(namespace);
    console.log('Pod ready.')
    //@ts-ignore
    await makeComment({ payload, hostname });
});
webhooks.on("pull_request.closed", async ({ payload }) => {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    console.log("Killing this preview namespace: ", namespace)
    await deletePreview({ namespace, hostname });
    console.log(`${namespace} terminated`)
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

