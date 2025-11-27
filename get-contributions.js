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
    
    // Daily commit counts for calendar heatmap
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
      
      // Get commits from the last year - need to paginate to get all commits
      try {
        let page = 1;
        let hasMore = true;
        
        while (hasMore && page <= 10) { // Limit to 10 pages to avoid rate limits
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
            
            if (commitDate >= last7Days) recentActivity.last7Days++;
            if (commitDate >= last30Days) recentActivity.last30Days++;
            if (commitDate >= oneYearAgo) recentActivity.lastYear++;
          });
          
          if (commits.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
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
      topLanguages,
      dailyCommits
    };
    
    return stats;
  } catch (error) {
    console.error('Error fetching contribution stats:', error);
    throw error;
  }
}

function getCommitColor(count, maxCount) {
  if (count === 0) return '#161b22';
  if (maxCount === 0) return '#0e4429';
  
  const intensity = count / maxCount;
  if (intensity <= 0.25) return '#0e4429';
  if (intensity <= 0.5) return '#006d32';
  if (intensity <= 0.75) return '#26a641';
  return '#39d353';
}

function generateCalendarHeatmap(dailyCommits) {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  // Find max commits in a single day
  const maxCommits = Math.max(...Object.values(dailyCommits), 1);
  
  // Create calendar data structure
  const calendarData = [];
  const currentDate = new Date(oneYearAgo);
  
  // Adjust to start on Sunday (GitHub calendar style)
  const dayOfWeek = currentDate.getDay();
  const daysToSubtract = dayOfWeek;
  currentDate.setDate(currentDate.getDate() - daysToSubtract);
  
  // Generate weeks (53 weeks to cover a full year)
  for (let week = 0; week < 53; week++) {
    const weekData = [];
    for (let day = 0; day < 7; day++) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const count = dailyCommits[dateKey] || 0;
      weekData.push({
        date: new Date(currentDate),
        count: count,
        dateKey: dateKey
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    calendarData.push(weekData);
  }
  
  return { calendarData, maxCommits };
}

async function generateContributionsSVG(stats) {
  const squareSize = 11;
  const squareGap = 2;
  const weekGap = 2;
  const cellSize = squareSize + squareGap;
  
  const leftMargin = 40;
  const topMargin = 60;
  const monthLabelHeight = 20;
  const dayLabelWidth = 30;
  
  const { calendarData, maxCommits } = generateCalendarHeatmap(stats.dailyCommits);
  
  const calendarWidth = calendarData.length * (squareSize + weekGap) + leftMargin;
  const calendarHeight = 7 * cellSize + topMargin + monthLabelHeight;
  const statsHeight = 120;
  const totalHeight = calendarHeight + statsHeight;
  
  const width = Math.max(900, calendarWidth + 50);
  const height = totalHeight;
  const padding = 20;
  
  // Month labels
  const monthLabels = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;
  
  calendarData.forEach((week, weekIndex) => {
    if (week.length > 0) {
      const firstDay = week[0].date;
      const month = firstDay.getMonth();
      if (month !== lastMonth && firstDay.getDate() <= 7) {
        const x = leftMargin + weekIndex * (squareSize + weekGap);
        monthLabels.push({ x, label: monthNames[month] });
        lastMonth = month;
      }
    }
  });
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .calendar-title { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 16px; fill: #e1e4e8; font-weight: 600; }
    .month-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; fill: #8b949e; }
    .day-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; fill: #8b949e; }
    .stat-title { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 16px; font-weight: bold; fill: #58a6ff; }
    .stat-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 13px; fill: #8b949e; }
    .stat-value { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 22px; font-weight: bold; fill: #e1e4e8; }
    .legend-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; fill: #8b949e; }
  </style>
  <rect width="${width}" height="${height}" fill="#0d1117" rx="8"/>
  
  <!-- Title -->
  <text x="${padding}" y="${padding + 15}" class="calendar-title">${stats.contributions.lastYear} contributions in the last year</text>
  
  <!-- Month Labels -->
  <g transform="translate(0, ${padding + 35})">
    ${monthLabels.map(m => `<text x="${m.x}" y="0" class="month-label">${m.label}</text>`).join('\n    ')}
  </g>
  
  <!-- Day Labels -->
  <g transform="translate(${padding}, ${padding + monthLabelHeight + 45})">
    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, i) => i % 2 === 0).map((day, i) => 
      `<text x="0" y="${i * 2 * cellSize + 8}" class="day-label">${day}</text>`
    ).join('\n    ')}
  </g>
  
  <!-- Calendar Grid -->
  <g transform="translate(${leftMargin}, ${padding + monthLabelHeight + 40})">
    ${calendarData.map((week, weekIndex) => 
      week.map((day, dayIndex) => {
        const x = weekIndex * (squareSize + weekGap);
        const y = dayIndex * cellSize;
        const color = getCommitColor(day.count, maxCommits);
        const title = `${day.count} ${day.count === 1 ? 'contribution' : 'contributions'} on ${day.dateKey}`;
        return `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${color}" rx="2" opacity="0.9">
          <title>${title}</title>
        </rect>`;
      }).join('\n    ')
    ).join('\n    ')}
  </g>
  
  <!-- Legend -->
  <g transform="translate(${width - 220}, ${padding + 40})">
    <text x="0" y="0" class="legend-label">Less</text>
    ${[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => {
      const x = 40 + i * (squareSize + 4);
      const count = Math.round(intensity * maxCommits);
      const color = getCommitColor(count, maxCommits);
      return `<rect x="${x}" y="-8" width="${squareSize}" height="${squareSize}" fill="${color}" rx="2"/>`;
    }).join('')}
    <text x="${200}" y="0" class="legend-label">More</text>
  </g>
  
  <!-- Stats Section -->
  <g transform="translate(${padding}, ${calendarHeight + padding})">
    <text x="0" y="0" class="stat-title">Summary Statistics</text>
    <g transform="translate(0, 30)">
      <text x="0" y="0" class="stat-label">Public Repositories</text>
      <text x="0" y="30" class="stat-value">${stats.repositories.total}</text>
      
      <text x="180" y="0" class="stat-label">Total Stars</text>
      <text x="180" y="30" class="stat-value">${stats.repositories.stars}</text>
      
      <text x="360" y="0" class="stat-label">Total Forks</text>
      <text x="360" y="30" class="stat-value">${stats.repositories.forks}</text>
      
      <text x="0" y="60" class="stat-label">Commits (Last 7 Days)</text>
      <text x="0" y="90" class="stat-value">${stats.contributions.last7Days}</text>
      
      <text x="180" y="60" class="stat-label">Commits (Last 30 Days)</text>
      <text x="180" y="90" class="stat-value">${stats.contributions.last30Days}</text>
      
      <text x="360" y="60" class="stat-label">Top Languages</text>
      <text x="360" y="90" class="stat-value" font-size="16">${stats.topLanguages.slice(0, 3).join(', ')}</text>
    </g>
  </g>
</svg>`;
  
  return svg;
}

function generateCalendarOnlySVG(dailyCommits, totalContributions) {
  const squareSize = 10;
  const squareGap = 3;
  const weekGap = 2;
  const cellSize = squareSize + squareGap;
  
  const leftMargin = 30;
  const topMargin = 50;
  const monthLabelHeight = 15;
  
  const { calendarData, maxCommits } = generateCalendarHeatmap(dailyCommits);
  
  const calendarWidth = calendarData.length * (squareSize + weekGap) + leftMargin;
  const calendarHeight = 7 * cellSize + topMargin + monthLabelHeight;
  
  const width = Math.max(800, calendarWidth + 50);
  const height = calendarHeight + 30;
  const padding = 15;
  
  // Month labels
  const monthLabels = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;
  
  calendarData.forEach((week, weekIndex) => {
    if (week.length > 0) {
      const firstDay = week[0].date;
      const month = firstDay.getMonth();
      if (month !== lastMonth && firstDay.getDate() <= 7) {
        const x = leftMargin + weekIndex * (squareSize + weekGap);
        monthLabels.push({ x, label: monthNames[month] });
        lastMonth = month;
      }
    }
  });
  
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .calendar-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; fill: #e1e4e8; font-weight: 600; }
    .month-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; fill: #8b949e; }
    .day-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; fill: #8b949e; }
    .legend-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10px; fill: #8b949e; }
  </style>
  <rect width="${width}" height="${height}" fill="#0d1117" rx="6"/>
  
  <!-- Title -->
  <text x="${padding}" y="${padding + 12}" class="calendar-title">${totalContributions} contributions in the last year</text>
  
  <!-- Month Labels -->
  <g transform="translate(0, ${padding + 28})">
    ${monthLabels.map(m => `<text x="${m.x}" y="0" class="month-label">${m.label}</text>`).join('\n    ')}
  </g>
  
  <!-- Day Labels -->
  <g transform="translate(${padding}, ${padding + monthLabelHeight + 38})">
    ${['', 'Mon', '', 'Wed', '', 'Fri', ''].map((day, i) => 
      day ? `<text x="0" y="${i * cellSize + 8}" class="day-label">${day}</text>` : ''
    ).join('\n    ')}
  </g>
  
  <!-- Calendar Grid -->
  <g transform="translate(${leftMargin}, ${padding + monthLabelHeight + 33})">
    ${calendarData.map((week, weekIndex) => 
      week.map((day, dayIndex) => {
        const x = weekIndex * (squareSize + weekGap);
        const y = dayIndex * cellSize;
        const color = getCommitColor(day.count, maxCommits);
        const title = `${day.count} ${day.count === 1 ? 'contribution' : 'contributions'} on ${day.dateKey}`;
        return `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${color}" rx="2" opacity="0.9">
          <title>${title}</title>
        </rect>`;
      }).join('\n    ')
    ).join('\n    ')}
  </g>
  
  <!-- Legend -->
  <g transform="translate(${width - 200}, ${padding + 33})">
    <text x="0" y="0" class="legend-label">Less</text>
    ${[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => {
      const x = 35 + i * (squareSize + 3);
      const count = Math.round(intensity * maxCommits);
      const color = getCommitColor(count, maxCommits);
      return `<rect x="${x}" y="-7" width="${squareSize}" height="${squareSize}" fill="${color}" rx="2"/>`;
    }).join('')}
    <text x="${185}" y="0" class="legend-label">More</text>
  </g>
</svg>`;
}

async function main() {
  try {
    console.log('Fetching contribution statistics...');
    const stats = await getContributionStats();
    
    // Save stats as JSON
    const statsPath = path.join(__dirname, 'contributions.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');
    
    // Generate full stats SVG
    const svgContent = await generateContributionsSVG(stats);
    const svgPath = path.join(__dirname, 'contributions.svg');
    fs.writeFileSync(svgPath, svgContent, 'utf8');
    
    // Generate calendar-only SVG
    const calendarOnlySVG = generateCalendarOnlySVG(stats.dailyCommits, stats.contributions.lastYear);
    const calendarPath = path.join(__dirname, 'contributions-calendar.svg');
    fs.writeFileSync(calendarPath, calendarOnlySVG, 'utf8');
    
    console.log('Contribution statistics generated successfully!');
    console.log('Generated files:');
    console.log('  - contributions.svg (full stats + calendar)');
    console.log('  - contributions-calendar.svg (calendar only)');
    console.log('Stats:', JSON.stringify({ ...stats, dailyCommits: '...' }, null, 2));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

