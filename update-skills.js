const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const skillsPath = path.join(__dirname, 'skills.json');
const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const skillKeywords = {
  'TypeScript': ['typescript', 'ts', '.ts', '.tsx'],
  'Tailwind': ['tailwind', 'tailwindcss'],
  'React': ['react', 'reactjs'],
  'Next.js': ['next.js', 'nextjs', 'next'],
  'React Native': ['react-native', 'reactnative', 'expo']
};

async function getRepos() {
  let username = process.env.GITHUB_REPOSITORY_OWNER;
  
  if (!username) {
    const { data: user } = await octokit.users.getAuthenticated();
    username = user.login;
  }
  
  const { data: repos } = await octokit.repos.listForUser({
    username: username,
    type: 'public',
    sort: 'updated',
    per_page: 100
  });
  return repos;
}

async function getRepoLanguages(owner, repo) {
  try {
    const { data } = await octokit.repos.listLanguages({
      owner,
      repo
    });
    return Object.keys(data);
  } catch (error) {
    console.error(`Error fetching languages for ${owner}/${repo}:`, error.message);
    return [];
  }
}

async function getRecentCommits(owner, repo) {
  try {
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: 30,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    return data;
  } catch (error) {
    console.error(`Error fetching commits for ${owner}/${repo}:`, error.message);
    return [];
  }
}

async function getCommitFiles(owner, repo, sha) {
  try {
    const { data } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: sha
    });
    return data.files || [];
  } catch (error) {
    return [];
  }
}

function detectSkillFromLanguages(languages) {
  const detected = new Set();
  const langStr = languages.join(' ').toLowerCase();

  Object.entries(skillKeywords).forEach(([skill, keywords]) => {
    if (keywords.some(keyword => langStr.includes(keyword.toLowerCase()))) {
      detected.add(skill);
    }
  });

  return Array.from(detected);
}

function detectSkillFromFiles(files) {
  const detected = new Set();
  const fileStr = files.map(f => f.filename).join(' ').toLowerCase();

  Object.entries(skillKeywords).forEach(([skill, keywords]) => {
    if (keywords.some(keyword => fileStr.includes(keyword.toLowerCase()))) {
      detected.add(skill);
    }
  });

  return Array.from(detected);
}

async function updateSkills() {
  try {
    const repos = await getRepos();
    const skillActivity = {};

    Object.keys(skills).forEach(skill => {
      skillActivity[skill] = 0;
    });

    for (const repo of repos.slice(0, 20)) {
      const owner = repo.owner.login;
      const repoName = repo.name;

      const languages = await getRepoLanguages(owner, repoName);
      const detectedFromLang = detectSkillFromLanguages(languages);
      detectedFromLang.forEach(skill => {
        skillActivity[skill] += 2;
      });

      const commits = await getRecentCommits(owner, repoName);
      for (const commit of commits.slice(0, 10)) {
        const files = await getCommitFiles(owner, repoName, commit.sha);
        const detectedFromFiles = detectSkillFromFiles(files);
        detectedFromFiles.forEach(skill => {
          skillActivity[skill] += 1;
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    Object.keys(skills).forEach(skill => {
      const activity = skillActivity[skill] || 0;
      const increase = Math.min(activity * 0.5, 5);
      skills[skill] = Math.min(Math.round(skills[skill] + increase), 100);
    });

    fs.writeFileSync(skillsPath, JSON.stringify(skills, null, 2) + '\n', 'utf8');
    console.log('Skills updated successfully!');
    console.log('Updated skills:', skills);
  } catch (error) {
    console.error('Error updating skills:', error);
    process.exit(1);
  }
}

updateSkills();

