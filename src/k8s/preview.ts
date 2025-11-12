import * as k from '@kubernetes/client-node';
import { kApi, kApps, kc, kNet } from "./client";
import { Watch } from '@kubernetes/client-node';
import { sign } from 'crypto';
import { withTimeout } from '../utils/withTimeout';
interface IDeployParams {
    namespace: string;
    hostname: string;
    image: string
}
export const waitOnPodDeploy = async (namespace: string, timeout: number = 3000000) => {
    const watch = new Watch(kc);
    const waitForPod = async (signal: AbortSignal) => {
        return new Promise<void>(async (resolve, reject) => {
            let resolved = false;
            const request = await watch.watch(`/api/v1/namespaces/${namespace}/pods`, { labelSelector: 'app=preview-app' }, (type, pod) => {
                if (signal.aborted) return;
                if (type === 'ADDED' || type === 'MODIFIED') {
                    if (pod.status?.phase === 'Running') {
                        const ready = pod.status.conditions?.find((c: any) => c.type === 'Ready' && c.status === 'True');
                        if (ready) {
                            resolved = true;
                            request.abort();
                            resolve()
                        }

                    }
                }
            }, (err) => {
                console.log(err)
                if (!resolved) reject(err)
            });
            signal.addEventListener('abort', () => request.abort())
        });
    }
    return withTimeout(timeout)(waitForPod);
}



export const deployPreview = async ({ namespace, hostname, image }: IDeployParams) => {
    try {
        await kApi.readNamespace({ name: namespace });
        console.log("Preview exists, deleting pods.")
        await kApi.deleteCollectionNamespacedPod({
            namespace,
            labelSelector: 'app=preview-app'
        });
        return
    } catch (e: any) {
        if (e.code !== 404) throw e;
    }
    try {

        await kApi.createNamespace({ body: { metadata: { name: namespace } } });
        await kApps.createNamespacedDeployment({
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
                                image: image,
                                imagePullPolicy: 'Always',
                                ports: [{ containerPort: 80 }]
                            }], 
                            resources:{
                                requests:{
                                    cpu:'50m', 
                                    memory: '64Mi'
                                }, 
                                limits:{
                                    cpu: '100m', 
                                    memory:'128Mi'
                                }
                            }
                        },
                    }
                }
            }
        });
        await kApi.createNamespacedService({
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
                    ports: [{ port: 80, targetPort: 80 }],

                }
            }
        });
        await kNet.createNamespacedIngress({
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
                                        port: { number: 80 }
                                    }
                                }
                            }]
                        }
                    }]
                }
            }
        })
    } catch (e: any) {
        console.error(`Failed to deploy PR, cleaning up:`, e.body?.message || e.message);
        try {
            await deletePreview({ namespace, hostname });
        } catch (e: any) {
            console.error("Failed to cleanup", e);
        }
    }
}

export const deletePreview = async ({ namespace }: Omit<IDeployParams, 'image'>) => {
    try {

        await kApi.deleteNamespace({ name: namespace, })
    } catch (e: any) {
        if (e.code === 404) {
            console.error("Namespace already deleted");
            return;
        }
        throw e;
    }

}