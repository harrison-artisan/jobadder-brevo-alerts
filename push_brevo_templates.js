/**
 * Push the master consultant template HTML to Brevo templates #171, #172, #173
 * Usage: node push_brevo_templates.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
if (!BREVO_API_KEY) { console.error('❌ BREVO_API_KEY env var not set'); process.exit(1); }
const TEMPLATE_FILE = path.join(__dirname, 'templates', 'brevo_consultant_for_brevo.html');

const TEMPLATES = [
  { id: 171, name: 'Mathew' },
  { id: 172, name: 'Sean' },
  { id: 173, name: 'Debbie' }
];

function brevoRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.brevo.com',
      port: 443,
      path,
      method,
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function pushTemplate(templateId, consultantName, htmlContent) {
  console.log(`\n📤 Pushing to template #${templateId} (${consultantName})...`);
  try {
    const result = await brevoRequest('PUT', `/v3/smtp/templates/${templateId}`, {
      name: `Consultant Newsletter — ${consultantName}`,
      htmlContent,
      isActive: true
    });
    console.log(`✅ Template #${templateId} updated (HTTP ${result.status})`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to update template #${templateId}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('📖 Reading template file...');
  const html = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  console.log(`   Template size: ${(html.length / 1024).toFixed(1)} KB`);

  let successCount = 0;
  for (const t of TEMPLATES) {
    const ok = await pushTemplate(t.id, t.name, html);
    if (ok) successCount++;
  }

  console.log(`\n🎉 Done: ${successCount}/${TEMPLATES.length} templates updated successfully.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
