import { k8sApi, k8sApps, k8sNet } from "./client";

interface IDeployParams {
    namespace: string;
    hostname: string;
}

export const deployPreview = async ({ namespace, hostname }: IDeployParams) => {
    try {
        await k8sApi.readNamespace({ name: namespace });
        console.log("Namespace already exists, skipping deployment")
        return;
    } catch (e: any) {
        if (e.statusCode !== 404) throw e;
    }
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
    } catch (e: any) {
        console.error(`Failed to deploy PR, cleaning up:`, e.body?.message || e.message);
        try {
            await deletePreview({ namespace, hostname });
        } catch (e: any) {
            console.error("Failed to cleanup", e);
        }
    }
}

export const deletePreview = async ({ namespace }: IDeployParams) => {
    try {

        await k8sApi.deleteNamespace({ name: namespace, })
    } catch (e: any) {
        if (e.statusCode === 404) {
            console.error("Namespace already deleted");
            return;
        }
        throw e;
    }

}