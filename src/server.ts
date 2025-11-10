import express from 'express';
import { Webhooks } from '@octokit/webhooks';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import * as k8s from '@kubernetes/client-node';

import fs from 'fs';
import dotenv from 'dotenv';
import type { PullRequestOpenedEvent, PullRequestReopenedEvent } from '@octokit/webhooks-types';
dotenv.config();
const app = express();
const appAuth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH!, 'utf8')
});
const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET || 'development'
});
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
kc.setCurrentContext('default');
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sApps = kc.makeApiClient(k8s.AppsV1Api);
const k8sNet = kc.makeApiClient(k8s.NetworkingV1Api);

async function deployPreview(payload: PullRequestOpenedEvent | PullRequestReopenedEvent) {
    const namespace = `pr-${payload.pull_request.number}`
    const hostname = `pr-${payload.pull_request.number}.preview.local`;

    try {
        await k8sApi.createNamespace({ body: { metadata: { name: namespace } } });
        await k8sApps.createNamespacedDeployment({
            namespace,
            body: {
                metadata: {
                    name: 'preview-app'
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: 'preview-app' } },
                    template: {
                        metadata: {
                            labels: { app: 'preview-app' },

                        }, spec: {
                            containers: [{
                                name: 'preview-app',
                                image: 'barnettet31/k3s-demo:v1',
                                ports: [{ containerPort: 3000 }]
                            }]
                        },
                    }
                }
            }
        });
        await k8sApi.createNamespacedService({
            namespace,
            body: {
                metadata: {
                    name: 'preview-app'
                },
                spec: {
                    type: 'NodePort',
                    selector: {
                        app: 'preview-app'
                    },
                    ports: [{ port: 3000, targetPort: 3000 }],

                }
            }
        });
        await k8sNet.createNamespacedIngress({
            namespace,
            body: {
                metadata: {
                    name: 'preview-ingress'
                },
                spec: {
                    ingressClassName: 'traefik',
                    rules: [{
                        host: hostname, http: {
                            paths: [{
                                path: '/', pathType: 'Prefix', backend: {
                                    service: {
                                        name: "preview-app",
                                        port: { number: 3000 }
                                    }
                                }
                            }]
                        }
                    }]
                }
            }
        })

        console.log("Preview Deployed: ", namespace);
        const { token } = await appAuth({
            type: 'installation',
            installationId: payload.installation?.id
        });
        console.log("token fetched, creating comment")
        const octokit = new Octokit({ auth: token });
        await octokit.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            body: `Preview deployed!\n\nAccess at: http://${hostname}`
        });
        console.log("comment created: ", payload.pull_request.url);
    } catch (e) {
        //@ts-ignore
        console.error(`Failed to create preview: `, e.message);
    }
}
async function deletePreview(prNumber: number) {
    try {
        const namespace = `pr-${prNumber}`;
        console.log(`Cleaning up PR #${prNumber}`);
        await k8sApi.deleteNamespace({ name: namespace, })
        console.log("Cleaned up preview: ", namespace);

    } catch (e) {
        //@ts-ignore
        console.error('Failed to cleanup: ', e?.message);
    }
}
webhooks.on('pull_request.opened', async ({ payload }) => {
    console.log(`PR has been opened: ${payload.pull_request.title}`);
    console.log(`Branch ${payload.pull_request.head.ref}`);
    deployPreview(payload as PullRequestOpenedEvent);
});

webhooks.on('pull_request.reopened', async ({ payload }) => {

    console.log(`PR has been opened: ${payload.pull_request.title}`);
    console.log(`Branch ${payload.pull_request.head.ref}`);
    deployPreview(payload as PullRequestReopenedEvent);

});

webhooks.on("pull_request.closed", async ({ payload }) => {

    console.log(`PR Closed: ${payload.pull_request.title}`);
    deletePreview(payload.pull_request.number);

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

