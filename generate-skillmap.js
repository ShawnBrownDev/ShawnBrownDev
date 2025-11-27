const fs = require('fs');
const path = require('path');

const skillsPath = path.join(__dirname, 'skills.json');
const outputPath = path.join(__dirname, 'skillmap.svg');

const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

const barLength = 20;
const skillEntries = Object.entries(skills);
const lineHeight = 35;
const padding = 20;
const width = 600;
const height = padding * 2 + skillEntries.length * lineHeight;

function generateBar(percentage) {
  const filled = Math.round((percentage / 100) * barLength);
  const empty = barLength - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function generateSVG() {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .skill-label { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; fill: #e1e4e8; }
    .skill-bar { font-family: 'Courier New', monospace; font-size: 14px; fill: #58a6ff; }
    .skill-percent { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; fill: #8b949e; }
  </style>
  <rect width="${width}" height="${height}" fill="#0d1117"/>
`;

  skillEntries.forEach(([skill, percentage], index) => {
    const y = padding + (index * lineHeight) + 20;
    const bar = generateBar(percentage);
    const labelX = padding;
    const barX = 200;
    const percentX = 480;

    svg += `  <text x="${labelX}" y="${y}" class="skill-label">${skill}:</text>
  <text x="${barX}" y="${y}" class="skill-bar">${bar}</text>
  <text x="${percentX}" y="${y}" class="skill-percent">${percentage}%</text>
`;
  });

  svg += `</svg>`;

  return svg;
}

const svgContent = generateSVG();
fs.writeFileSync(outputPath, svgContent, 'utf8');

console.log('Skill map generated successfully!');

