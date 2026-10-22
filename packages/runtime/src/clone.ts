/** Deep copy of JSON-shaped data (mock data and runtime state never hold anything else). */
export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
