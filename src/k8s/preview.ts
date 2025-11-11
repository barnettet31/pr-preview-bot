import { kApi, kApps, kNet } from "./client";

interface IDeployParams {
    namespace: string;
    hostname: string;
    image: string
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
                            }]
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