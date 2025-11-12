import * as k from '@kubernetes/client-node';

export const kc = new k.KubeConfig();
kc.loadFromDefault();
kc.setCurrentContext('default');
export const kApi = kc.makeApiClient(k.CoreV1Api);
export const kApps = kc.makeApiClient(k.AppsV1Api);
export const kNet = kc.makeApiClient(k.NetworkingV1Api);
