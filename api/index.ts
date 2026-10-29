import { createServerlessGateway } from '../services/appraisal/app.js';
process.env.APPRAISAL_MODE = 'cloud';
process.env.APPRAISAL_ENVIRONMENT = 'production';
process.env.APPRAISAL_ENABLE_TEST_LOGIN = 'false';
export default createServerlessGateway();
