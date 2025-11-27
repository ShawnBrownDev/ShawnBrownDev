const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function getUsername() {
  let username = process.env.GITHUB_REPOSITORY_OWNER;
  
  if (!username) {
    const { data: user } = await octokit.users.getAuthenticated();
    username = user.login;
  }
  
  return username;
}

async function getContributionStats() {
  try {
    const username = await getUsername();
    
    // Get all public repositories
    const { data: repos } = await octokit.repos.listForUser({
      username: username,
      type: 'public',
      sort: 'updated',
      per_page: 100
    });

    // Get user info
    const { data: user } = await octokit.users.getByUsername({ username });
    
    // Calculate stats from last year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    let totalCommits = 0;
    let totalRepos = repos.length;
    let totalStars = 0;
    let totalForks = 0;
    let languages = {};
    let recentActivity = {
      last7Days: 0,
      last30Days: 0,
      lastYear: 0
    };
    
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    for (const repo of repos) {
      totalStars += repo.stargazers_count;
      totalForks += repo.forks_count;
      
      // Get commits from the last year
      try {
        const { data: commits } = await octokit.repos.listCommits({
          owner: repo.owner.login,
          repo: repo.name,
          author: username,
          since: oneYearAgo.toISOString(),
          per_page: 100
        });
        
        totalCommits += commits.length;
        
        commits.forEach(commit => {
          const commitDate = new Date(commit.commit.author.date);
          if (commitDate >= last7Days) recentActivity.last7Days++;
          if (commitDate >= last30Days) recentActivity.last30Days++;
          if (commitDate >= oneYearAgo) recentActivity.lastYear++;
        });
        
        // Get repository languages
        const { data: repoLanguages } = await octokit.repos.listLanguages({
          owner: repo.owner.login,
          repo: repo.name
        });
        
        Object.entries(repoLanguages).forEach(([lang, bytes]) => {
          languages[lang] = (languages[lang] || 0) + bytes;
        });
      } catch (error) {
        // Skip repos with no access or errors
        continue;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Get top languages
    const topLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lang]) => lang);
    
    const stats = {
      username,
      profile: {
        name: user.name || username,
        bio: user.bio || '',
        avatar: user.avatar_url,
        followers: user.followers,
        following: user.following
      },
      repositories: {
        total: totalRepos,
        stars: totalStars,
        forks: totalForks
      },
      contributions: {
        total: totalCommits,
        last7Days: recentActivity.last7Days,
        last30Days: recentActivity.last30Days,
        lastYear: recentActivity.lastYear
      },
      topLanguages
    };
    
    return stats;
  } catch (error) {
    console.error('Error fetching contribution stats:', error);
    throw error;
  }
}

async function generateContributionsSVG(stats) {
  const width = 700;
  const height = 400;
  const padding = 30;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .stat-title { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 18px; font-weight: bold; fill: #58a6ff; }
    .stat-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; fill: #8b949e; }
    .stat-value { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 24px; font-weight: bold; fill: #e1e4e8; }
    .language-tag { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; fill: #58a6ff; }
  </style>
  <rect width="${width}" height="${height}" fill="#0d1117"/>
  
  <!-- Title -->
  <text x="${padding}" y="${padding + 20}" class="stat-title">GitHub Contributions</text>
  
  <!-- Stats Grid -->
  <g transform="translate(${padding}, ${padding + 50})">
    <!-- Repositories -->
    <text x="0" y="0" class="stat-label">Public Repositories</text>
    <text x="0" y="35" class="stat-value">${stats.repositories.total}</text>
    
    <!-- Stars -->
    <text x="200" y="0" class="stat-label">Total Stars</text>
    <text x="200" y="35" class="stat-value">${stats.repositories.stars}</text>
    
    <!-- Forks -->
    <text x="400" y="0" class="stat-label">Total Forks</text>
    <text x="400" y="35" class="stat-value">${stats.repositories.forks}</text>
    
    <!-- Commits -->
    <text x="0" y="90" class="stat-label">Commits (Last Year)</text>
    <text x="0" y="125" class="stat-value">${stats.contributions.lastYear}</text>
    
    <!-- Last 7 Days -->
    <text x="200" y="90" class="stat-label">Commits (Last 7 Days)</text>
    <text x="200" y="125" class="stat-value">${stats.contributions.last7Days}</text>
    
    <!-- Last 30 Days -->
    <text x="400" y="90" class="stat-label">Commits (Last 30 Days)</text>
    <text x="400" y="125" class="stat-value">${stats.contributions.last30Days}</text>
    
    <!-- Top Languages -->
    <text x="0" y="180" class="stat-label">Top Languages</text>
    ${stats.topLanguages.map((lang, index) => 
      `<text x="${index * 120}" y="210" class="language-tag">${lang}</text>`
    ).join('')}
  </g>
</svg>`;
  
  return svg;
}

async function main() {
  try {
    console.log('Fetching contribution statistics...');
    const stats = await getContributionStats();
    
    // Save stats as JSON
    const statsPath = path.join(__dirname, 'contributions.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');
    
    // Generate SVG
    const svgContent = await generateContributionsSVG(stats);
    const svgPath = path.join(__dirname, 'contributions.svg');
    fs.writeFileSync(svgPath, svgContent, 'utf8');
    
    console.log('Contribution statistics generated successfully!');
    console.log('Stats:', JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

