/** Public automation lane names shared by the native tick automation tools. */
export const AUTOMATION_TYPES = ['volume', 'pan', 'pitch_bend', 'cc1', 'cc2', 'cc7', 'cc11', 'cc64'] as const;
export type AutomationType = typeof AUTOMATION_TYPES[number];
