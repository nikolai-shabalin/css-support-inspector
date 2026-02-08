import { defineConfig } from 'astro/config';

const owner = process.env.GITHUB_REPOSITORY_OWNER;
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

const base = isGithubActions && repo ? `/${repo}` : '/';
const site = isGithubActions && owner ? `https://${owner}.github.io` : undefined;

export default defineConfig({
  site,
  base
});
