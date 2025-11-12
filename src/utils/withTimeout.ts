export const withTimeout = <T>(timeout: number = 300000) => (fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {

    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(`Timedout after ${timeout}ms`));
        }, timeout);
        fn(controller.signal)
            .then(resolve)
            .catch(reject)
            .finally(() => clearTimeout(timeoutId))
    })
}