import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';
import { PullRequestOpenedEvent, PullRequestReopenedEvent } from '@octokit/webhooks-types';

const appAuth = createAppAuth({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH!, 'utf8')
});

interface IMakeCommentParams {
    payload: PullRequestOpenedEvent | PullRequestReopenedEvent;
    hostname: string;
}

export const makeComment = async({payload, hostname }:IMakeCommentParams)=>{
    const { token } = await appAuth({
            type: 'installation',
            installationId: ""//payload.installation?.id
        });
        const octokit = new Octokit({ auth: token });
        await octokit.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            body: `Preview deployed!\n\nAccess at: http://${hostname}`
        });
}
