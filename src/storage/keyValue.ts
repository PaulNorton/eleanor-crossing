/** The subset of the Web Storage API the repositories use. Tests pass an in-memory version. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
