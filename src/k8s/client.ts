import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
kc.setCurrentContext('default');
export const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
export const k8sApps = kc.makeApiClient(k8s.AppsV1Api);
export const k8sNet = kc.makeApiClient(k8s.NetworkingV1Api);
