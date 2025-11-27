const fs = require('fs');
const path = require('path');

const skillsPath = path.join(__dirname, 'skills.json');
const outputPath = path.join(__dirname, 'skillmap.svg');

const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

const skillEntries = Object.entries(skills);
const lineHeight = 45;
const padding = 30;
const barWidth = 300;
const barHeight = 20;
const width = 600;
const height = padding * 2 + skillEntries.length * lineHeight + 30;

function getColorForPercentage(percentage) {
  if (percentage >= 80) return '#58a6ff'; // Blue
  if (percentage >= 60) return '#79c0ff'; // Light Blue
  if (percentage >= 40) return '#7ee787'; // Green
  if (percentage >= 20) return '#f85149'; // Red
  return '#8b949e'; // Gray
}

function generateSVG() {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="barGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#58a6ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#79c0ff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <style>
    .skill-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; fill: #e1e4e8; font-weight: 500; }
    .skill-percent { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; fill: #8b949e; font-weight: 600; }
    .bar-bg { fill: #21262d; }
    .bar-filled { fill: url(#barGradient); }
  </style>
  <rect width="${width}" height="${height}" fill="#0d1117" rx="8"/>
  <text x="${padding}" y="${padding + 20}" font-family="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" font-size="18" font-weight="bold" fill="#58a6ff">Skill Proficiency</text>
`;

  skillEntries.forEach(([skill, percentage], index) => {
    const y = padding + 50 + (index * lineHeight);
    const labelX = padding;
    const barX = 180;
    const barY = y - 12;
    const percentX = 500;
    const filledWidth = (percentage / 100) * barWidth;
    const barColor = getColorForPercentage(percentage);

    svg += `  <text x="${labelX}" y="${y}" class="skill-label">${skill}</text>
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="10" class="bar-bg"/>
  <rect x="${barX}" y="${barY}" width="${filledWidth}" height="${barHeight}" rx="10" fill="${barColor}" opacity="0.9"/>
  <text x="${percentX}" y="${y}" class="skill-percent">${percentage}%</text>
`;
  });

  svg += `</svg>`;

  return svg;
}

const svgContent = generateSVG();
fs.writeFileSync(outputPath, svgContent, 'utf8');

console.log('Skill map generated successfully!');

