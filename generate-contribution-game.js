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

// Achievement system
function calculateAchievements(stats) {
  const achievements = [];
  const { contributions, repositories } = stats;
  
  // Contribution achievements
  if (contributions.lastYear >= 1000) achievements.push({ name: 'Commit Master', icon: '🏆', desc: '1000+ commits' });
  else if (contributions.lastYear >= 500) achievements.push({ name: 'Code Warrior', icon: '⚔️', desc: '500+ commits' });
  else if (contributions.lastYear >= 250) achievements.push({ name: 'Dedicated Dev', icon: '💪', desc: '250+ commits' });
  else if (contributions.lastYear >= 100) achievements.push({ name: 'Active Coder', icon: '🔥', desc: '100+ commits' });
  else if (contributions.lastYear >= 50) achievements.push({ name: 'Getting Started', icon: '🌱', desc: '50+ commits' });
  
  // Streak achievements
  if (contributions.last7Days >= 7) achievements.push({ name: 'Perfect Week', icon: '⭐', desc: '7 days in a row' });
  if (contributions.last30Days >= 20) achievements.push({ name: 'Monthly Hero', icon: '🌟', desc: '20+ days this month' });
  
  // Repository achievements
  if (repositories.total >= 50) achievements.push({ name: 'Repo Collector', icon: '📦', desc: '50+ repositories' });
  else if (repositories.total >= 25) achievements.push({ name: 'Project Pro', icon: '🚀', desc: '25+ repositories' });
  else if (repositories.total >= 10) achievements.push({ name: 'Multi-Project', icon: '📁', desc: '10+ repositories' });
  
  // Star achievements
  if (repositories.stars >= 100) achievements.push({ name: 'Star Magnet', icon: '✨', desc: '100+ stars' });
  else if (repositories.stars >= 50) achievements.push({ name: 'Rising Star', icon: '⭐', desc: '50+ stars' });
  else if (repositories.stars >= 10) achievements.push({ name: 'Noticed', icon: '👀', desc: '10+ stars' });
  
  // Consistency achievements
  const consistency = (contributions.last30Days / 30) * 100;
  if (consistency >= 70) achievements.push({ name: 'Consistent Coder', icon: '📅', desc: '70%+ consistency' });
  
  return achievements;
}

function calculateLevel(contributions) {
  // Level system: 1 XP per commit
  const xp = contributions.lastYear;
  const level = Math.floor(xp / 50) + 1;
  const xpInLevel = xp % 50;
  const xpForNextLevel = 50;
  const levelProgress = (xpInLevel / xpForNextLevel) * 100;
  
  return { level, xp, xpInLevel, xpForNextLevel, levelProgress };
}

function calculateStreak(dailyCommits) {
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  
  const dates = Object.keys(dailyCommits).sort();
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate current streak (from today backwards)
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dailyCommits[dates[i]] > 0) {
      if (dates[i] === today || tempStreak === 0 || dates[i] === getPreviousDay(dates[i + 1])) {
        tempStreak++;
        if (i === dates.length - 1) currentStreak = tempStreak;
      } else {
        break;
      }
    } else {
      if (dates[i] === today) continue; // Today can have 0 commits
      break;
    }
  }
  
  // Calculate longest streak
  tempStreak = 0;
  for (const date of dates) {
    if (dailyCommits[date] > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }
  
  return { currentStreak, longestStreak };
}

function getPreviousDay(dateString) {
  const date = new Date(dateString);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

async function getGameStats() {
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
    const dailyCommits = {};
    
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Initialize daily commits object for the last year
    for (let d = new Date(oneYearAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      dailyCommits[dateKey] = 0;
    }
    
    for (const repo of repos) {
      totalStars += repo.stargazers_count;
      totalForks += repo.forks_count;
      
      try {
        let page = 1;
        let hasMore = true;
        
        while (hasMore && page <= 10) {
          const { data: commits } = await octokit.repos.listCommits({
            owner: repo.owner.login,
            repo: repo.name,
            author: username,
            since: oneYearAgo.toISOString(),
            per_page: 100,
            page: page
          });
          
          if (commits.length === 0) {
            hasMore = false;
            break;
          }
          
          totalCommits += commits.length;
          
          commits.forEach(commit => {
            const commitDate = new Date(commit.commit.author.date);
            const dateKey = commitDate.toISOString().split('T')[0];
            
            if (dailyCommits.hasOwnProperty(dateKey)) {
              dailyCommits[dateKey]++;
            }
          });
          
          if (commits.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        continue;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const recentActivity = {
      last7Days: Object.values(dailyCommits).slice(-7).reduce((a, b) => a + b, 0),
      last30Days: Object.values(dailyCommits).slice(-30).reduce((a, b) => a + b, 0),
      lastYear: totalCommits
    };
    
    const streaks = calculateStreak(dailyCommits);
    const level = calculateLevel(recentActivity);
    const achievements = calculateAchievements({
      contributions: recentActivity,
      repositories: { total: totalRepos, stars: totalStars, forks: totalForks }
    });
    
    return {
      username,
      profile: {
        name: user.name || username,
        avatar: user.avatar_url
      },
      repositories: {
        total: totalRepos,
        stars: totalStars,
        forks: totalForks
      },
      contributions: recentActivity,
      streaks,
      level,
      achievements,
      dailyCommits
    };
  } catch (error) {
    console.error('Error fetching game stats:', error);
    throw error;
  }
}

function generateGameSVG(stats) {
  const width = 900;
  const height = 650;
  const padding = 30;
  
  const level = stats.level;
  const achievements = stats.achievements.slice(0, 8); // Show top 8 achievements
  const progressBarWidth = 400;
  const progressBarHeight = 20;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#58a6ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#79c0ff;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <style>
    .game-title { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 24px; font-weight: bold; fill: #58a6ff; }
    .section-title { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 18px; font-weight: bold; fill: #e1e4e8; }
    .stat-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; fill: #8b949e; }
    .stat-value { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 28px; font-weight: bold; fill: #e1e4e8; }
    .level-text { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 36px; font-weight: bold; fill: #58a6ff; }
    .xp-text { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; fill: #8b949e; }
    .achievement-name { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; fill: #e1e4e8; font-weight: 600; }
    .achievement-desc { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10px; fill: #8b949e; }
    .streak-text { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 16px; fill: #26a641; font-weight: bold; }
  </style>
  <rect width="${width}" height="${height}" fill="#0d1117" rx="8"/>
  
  <!-- Title -->
  <text x="${padding}" y="${padding + 25}" class="game-title">🎮 Contribution Quest</text>
  
  <!-- Level & XP Section -->
  <g transform="translate(${padding}, ${padding + 60})">
    <text x="0" y="0" class="section-title">Level ${level.level}</text>
    <text x="200" y="0" class="xp-text">XP: ${level.xp}</text>
    <text x="0" y="50" class="stat-label">Progress to Level ${level.level + 1}</text>
    <rect x="0" y="60" width="${progressBarWidth}" height="${progressBarHeight}" fill="#21262d" rx="10"/>
    <rect x="0" y="60" width="${(level.levelProgress / 100) * progressBarWidth}" height="${progressBarHeight}" fill="url(#progressGradient)" rx="10"/>
    <text x="${progressBarWidth + 10}" y="75" class="xp-text">${level.xpInLevel}/${level.xpForNextLevel}</text>
  </g>
  
  <!-- Stats Grid -->
  <g transform="translate(${padding}, ${padding + 150})">
    <text x="0" y="0" class="section-title">Stats</text>
    <g transform="translate(0, 30)">
      <text x="0" y="0" class="stat-label">Commits</text>
      <text x="0" y="30" class="stat-value">${stats.contributions.lastYear}</text>
      
      <text x="150" y="0" class="stat-label">Repositories</text>
      <text x="150" y="30" class="stat-value">${stats.repositories.total}</text>
      
      <text x="300" y="0" class="stat-label">Stars</text>
      <text x="300" y="30" class="stat-value">${stats.repositories.stars}</text>
      
      <text x="450" y="0" class="stat-label">Current Streak</text>
      <text x="450" y="30" class="streak-text">${stats.streaks.currentStreak} 🔥</text>
      
      <text x="0" y="70" class="stat-label">Longest Streak</text>
      <text x="0" y="100" class="stat-value">${stats.streaks.longestStreak}</text>
      
      <text x="150" y="70" class="stat-label">Last 7 Days</text>
      <text x="150" y="100" class="stat-value">${stats.contributions.last7Days}</text>
      
      <text x="300" y="70" class="stat-label">Last 30 Days</text>
      <text x="300" y="100" class="stat-value">${stats.contributions.last30Days}</text>
    </g>
  </g>
  
  <!-- Achievements Section -->
  <g transform="translate(${padding}, ${padding + 320})">
    <text x="0" y="0" class="section-title">Achievements (${achievements.length})</text>
    <g transform="translate(0, 30)">
      ${achievements.map((achievement, index) => {
        const row = Math.floor(index / 4);
        const col = index % 4;
        const x = col * 210;
        const y = row * 70;
        return `
        <g transform="translate(${x}, ${y})">
          <circle cx="20" cy="20" r="18" fill="#21262d" stroke="#58a6ff" stroke-width="2"/>
          <text x="20" y="27" text-anchor="middle" font-size="20">${achievement.icon}</text>
          <text x="45" y="15" class="achievement-name">${achievement.name}</text>
          <text x="45" y="28" class="achievement-desc">${achievement.desc}</text>
        </g>`;
      }).join('')}
    </g>
  </g>
</svg>`;
  
  return svg;
}

async function main() {
  try {
    console.log('Fetching contribution game stats...');
    const stats = await getGameStats();
    
    // Save stats as JSON
    const statsPath = path.join(__dirname, 'game-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');
    
    // Generate game SVG
    const svgContent = generateGameSVG(stats);
    const svgPath = path.join(__dirname, 'contributions-game.svg');
    fs.writeFileSync(svgPath, svgContent, 'utf8');
    
    console.log('Contribution game visualization generated successfully!');
    console.log(`Level: ${stats.level.level}`);
    console.log(`Achievements: ${stats.achievements.length}`);
    console.log(`Current Streak: ${stats.streaks.currentStreak} days`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

