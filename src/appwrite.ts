import {
  Account,
  Client,
  Databases,
  Functions,
  Storage,
} from 'appwrite';
import { fetchEnv } from './utils/env';

const client = new Client();

client
  .setEndpoint(fetchEnv('VITE_APPWRITE_ENDPOINT'))
  .setProject('hyper-tuner-api');

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);
const functions = new Functions(client);

export {
  client,
  account,
  databases,
  storage,
  functions,
};
