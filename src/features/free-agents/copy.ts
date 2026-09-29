/** "Cardinals'" after an s, otherwise "Iga Swiatek's". */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
