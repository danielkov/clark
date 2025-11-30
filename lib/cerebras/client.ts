import Cerebras from '@cerebras/cerebras_cloud_sdk';

export const cerebras = new Cerebras({
  apiKey: process.env['CEREBRAS_API_KEY']
});
