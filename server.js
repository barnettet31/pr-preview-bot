const express = require('express');
const { execSync } = require('child_process');
const { Webhooks } = require('@octokit/webhooks');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const fs = require('fs');

require('dotenv').config();
const app = express();
const appAuth = createAppAuth({
    appId: process.env.GITHUB_APP_ID,
    privateKey: fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8')
});
const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET || 'development'
});

async function deployPreview(payload) {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;
    console.log("creating preview PR for #:", payload.pull_request.number);

    try {
        execSync(`kubectl create namespace ${namespace} `);
        execSync(`kubectl create deployment preview-app \ --image=barnettet31/k3s-demo:v1 \ --replicas=1 \ -n ${namespace}`);
        execSync(`kubectl expose deployment preview-app \ --type=NodePort \ --port=3000 \ -n ${namespace}`);
        execSync(`kubectl create ingress preview-ingress \ --class=traefik \ --rule="${hostname}/*=preview-app:3000" \ -n ${namespace}`);

        console.log("Preview Deployed: ", namespace);
        const { token } = await appAuth({
            type: 'installation',
            installationId: payload.installation.id
        });
        console.log("token fetched, creating comment")
        const octokit = new Octokit({ auth: token });
         await octokit.rest.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.pull_request.number,
          body: `Preview deployed!\n\nAccess at: http://${hostname}`
        });
        console.log("comment created: ",  payload.pull_request.url);
    } catch (e) {
        console.error(`Failed to create preview: `, e.message);
    }
}
async function deletePreview(prNumber) {
    try {
        const namespace = `pr-${prNumber}`;
        console.log(`Cleaning up PR #${prNumber}`);
        execSync(`kubectl delete namespace ${namespace}`);
        console.log("Cleaned up preview: ", namespace);

    } catch (e) {
        console.error('Failed to cleanup: ', e.message);
    }
}
webhooks.on('pull_request.opened', async ({ payload }) => {
    console.log(`PR has been opened: ${payload.pull_request.title}`);
    console.log(`Branch ${payload.pull_request.head.ref}`);
    deployPreview(payload);
});

webhooks.on('pull_request.reopened', async ({ payload }) => {
   
    console.log(`PR has been opened: ${payload.pull_request.title}`);
    console.log(`Branch ${payload.pull_request.head.ref}`);
    deployPreview(payload);

});

webhooks.on("pull_request.closed", async ({ payload }) => {

    console.log(`PR Closed: ${payload.pull_request.title}`);
    deletePreview(payload.pull_request.number);

})

app.post('/webhook', express.text({ type: 'application/json' }), async (req, res) => {
    try {
        await webhooks.verifyAndReceive({
            id: req.headers['x-github-delivery'],
            name: req.headers['x-github-event'],
            signature: req.headers['x-hub-signature-256'],
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

