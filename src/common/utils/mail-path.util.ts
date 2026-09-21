import { resolve } from 'node:path';

export const getMailTemplatePath = (rootDirectory = process.cwd()): string => {
  const root = rootDirectory.trim();

  if (!root) {
    throw new TypeError('Mail template root directory cannot be empty');
  }

  return resolve(root, 'public', 'mails');
};
