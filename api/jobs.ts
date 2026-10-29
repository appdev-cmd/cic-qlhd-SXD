import { queue, processJob } from '../services/appraisal/jobs.js';
process.env.APPRAISAL_MODE = 'cloud';
export default queue.handleNodeCallback<{ jobId: string }>(async (message) => {
  await processJob(message.jobId);
});
