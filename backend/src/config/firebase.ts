import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { env } from './env';

const getPrivateKey = (): string | undefined => {
  if (env.firebasePrivateKey === undefined || env.firebasePrivateKey.trim() === '') {
    return undefined;
  }

  return env.firebasePrivateKey.replace(/\\n/g, '\n');
};

export const getFirebaseApp = (): App => {
  const existingApp = getApps()[0];
  if (existingApp !== undefined) {
    return existingApp;
  }

  const privateKey = getPrivateKey();

  if (env.firebaseProjectId !== undefined && env.firebaseClientEmail !== undefined && privateKey !== undefined) {
    return initializeApp({
      credential: cert({
        projectId: env.firebaseProjectId,
        clientEmail: env.firebaseClientEmail,
        privateKey,
      }),
    });
  }

  return initializeApp({
    credential: applicationDefault(),
  });
};

export const firebaseAuth = (): Auth => {
  return getAuth(getFirebaseApp());
};

export const firebaseMessaging = (): Messaging => {
  return getMessaging(getFirebaseApp());
};
