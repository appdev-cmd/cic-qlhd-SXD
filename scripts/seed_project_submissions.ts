import { spawn } from 'node:child_process';
import { MOCK_PROJECTS } from '../src/data/mockData';

// Read the same catalog used by the project list; never maintain a second ID list.
const projects = MOCK_PROJECTS.map(
  ({ id, code, name, location, investorName, totalInvestment, projectGroup, buildingGrade, assignee, stage }) => ({
    id,
    code,
    name,
    location,
    investorName,
    totalInvestment,
    projectGroup,
    buildingGrade,
    assignee,
    stage,
  }),
);
const child = spawn(process.env.APPRAISAL_PYTHON || 'python', ['scripts/seed_project_submissions.py'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  windowsHide: true,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.stdin.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.stdin.end(JSON.stringify(projects));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
